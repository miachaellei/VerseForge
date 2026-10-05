from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from typing import Iterable
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree


PARSER_VERSION = "document-worker-1"
MAX_ARCHIVE_ENTRIES = 10_000
MAX_ARCHIVE_TOTAL_BYTES = 300 * 1024 * 1024
MAX_ARCHIVE_ENTRY_BYTES = 20 * 1024 * 1024
CHAPTER_HEADING = re.compile(
    r"^\s*(?:(第[〇零一二三四五六七八九十百千万两\d]+[卷部篇章节回])|"
    r"(?:卷|章)[〇零一二三四五六七八九十百千万两\d]+|"
    r"(?:序章|楔子|引子|前言|后记|尾声|终章|番外(?:篇)?(?:[一二三四五六七八九十\d]+)?))"
    r"(?:[\s　:：、.\-]+.*)?\s*$"
)


class DocumentParseError(ValueError):
    pass


@dataclass(frozen=True)
class QualityIssue:
    code: str
    severity: str
    message: str
    chapter_id: str | None = None

    def to_dict(self) -> dict:
        value = asdict(self)
        return {"code": value["code"], "severity": value["severity"], "message": value["message"], "chapterId": value["chapter_id"]}


@dataclass(frozen=True)
class ParsedChapter:
    id: str
    ordinal: int
    title: str
    content: str
    source_path: str | None = None

    def to_dict(self) -> dict:
        return {"id": self.id, "ordinal": self.ordinal, "title": self.title, "content": self.content, "sourcePath": self.source_path}


@dataclass(frozen=True)
class ParsedSegment:
    id: str
    chapter_id: str
    ordinal: int
    content: str

    def to_dict(self) -> dict:
        return {"id": self.id, "chapterId": self.chapter_id, "ordinal": self.ordinal, "content": self.content}


@dataclass(frozen=True)
class ParsedDocument:
    project_id: str
    file_name: str
    format: str
    byte_size: int
    sha256: str
    parser_version: str
    chapters: tuple[ParsedChapter, ...]
    segments: tuple[ParsedSegment, ...]
    issues: tuple[QualityIssue, ...]
    encoding: str | None = None

    def to_dict(self) -> dict:
        return {
            "document": {
                "projectId": self.project_id,
                "fileName": self.file_name,
                "format": self.format,
                "byteSize": self.byte_size,
                "sha256": self.sha256,
                "parserVersion": self.parser_version,
                "encoding": self.encoding,
            },
            "chapters": [chapter.to_dict() for chapter in self.chapters],
            "segments": [segment.to_dict() for segment in self.segments],
            "issues": [issue.to_dict() for issue in self.issues],
        }


def _stable_id(namespace: str, value: str) -> str:
    digest = hashlib.sha256(f"{namespace}\0{value}".encode("utf-8")).hexdigest()
    return f"{namespace}_{digest[:24]}"


def _decode_text(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\xef\xbb\xbf"):
        return data[3:].decode("utf-8"), "utf-8-bom"
    if data.startswith(b"\xff\xfe"):
        return data[2:].decode("utf-16le"), "utf-16le"
    try:
        return data.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return data.decode("gb18030"), "gb18030"


def _quality_issues(chapters: Iterable[ParsedChapter]) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    for chapter in chapters:
        length = len(re.sub(r"\s", "", chapter.content))
        if length == 0:
            issues.append(QualityIssue("EMPTY_CHAPTER", "warning", f"“{chapter.title}”没有正文。", chapter.id))
        elif length < 100:
            issues.append(QualityIssue("VERY_SHORT_CHAPTER", "info", f"“{chapter.title}”正文少于 100 字。", chapter.id))
        if "�" in chapter.content:
            issues.append(QualityIssue("REPLACEMENT_CHARACTER", "warning", f"“{chapter.title}”包含乱码替代字符。", chapter.id))
    return issues


def _segments(document_hash: str, chapters: Iterable[ParsedChapter]) -> tuple[ParsedSegment, ...]:
    result: list[ParsedSegment] = []
    for chapter in chapters:
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n|(?<=。)\s*\n", chapter.content) if part.strip()]
        for ordinal, content in enumerate(paragraphs):
            result.append(ParsedSegment(_stable_id("seg", f"{document_hash}:{chapter.ordinal}:{ordinal}:{content}"), chapter.id, ordinal, content))
    return tuple(result)


def _split_text(text: str, document_hash: str) -> tuple[ParsedChapter, ...]:
    lines = text.splitlines(keepends=True)
    boundaries: list[tuple[int, str]] = []
    offset = 0
    for line in lines:
        title = line.strip()
        if title and CHAPTER_HEADING.match(title):
            boundaries.append((offset, title))
        offset += len(line)

    if not boundaries:
        return (ParsedChapter(_stable_id("chapter", f"{document_hash}:0"), 0, "正文", text),)

    chapters: list[ParsedChapter] = []
    if text[: boundaries[0][0]].strip():
        content = text[: boundaries[0][0]].strip()
        chapters.append(ParsedChapter(_stable_id("chapter", f"{document_hash}:0:prefix"), 0, "章节前内容", content))

    for index, (start, title) in enumerate(boundaries):
        line_end = text.find("\n", start)
        content_start = len(text) if line_end == -1 else line_end + 1
        end = boundaries[index + 1][0] if index + 1 < len(boundaries) else len(text)
        ordinal = len(chapters)
        chapters.append(ParsedChapter(_stable_id("chapter", f"{document_hash}:{ordinal}:{start}:{end}"), ordinal, title, text[content_start:end].strip()))
    return tuple(chapters)


class _HtmlTextExtractor(HTMLParser):
    BLOCKS = {"p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "br", "li", "blockquote"}
    SKIP = {"script", "style", "svg", "nav"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.title: str | None = None
        self._heading_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in self.SKIP:
            self.skip_depth += 1
        if not self.skip_depth and tag in self.BLOCKS:
            self.parts.append("\n")
        if not self.skip_depth and tag in {"h1", "h2"} and self.title is None:
            self._heading_parts = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
            return
        if not self.skip_depth and tag in self.BLOCKS:
            self.parts.append("\n")
        if tag in {"h1", "h2"} and self._heading_parts is not None:
            heading = "".join(self._heading_parts).strip()
            if heading:
                self.title = heading
            self._heading_parts = None

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(data)
        if self._heading_parts is not None:
            self._heading_parts.append(data)

    def text(self) -> str:
        lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in "".join(self.parts).splitlines()]
        return "\n\n".join(line for line in lines if line)


def _safe_archive_members(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    members = archive.infolist()
    if len(members) > MAX_ARCHIVE_ENTRIES:
        raise DocumentParseError("EPUB 文件条目过多，已拒绝解析。")
    total_size = 0
    safe: dict[str, zipfile.ZipInfo] = {}
    for member in members:
        path = PurePosixPath(member.filename)
        if path.is_absolute() or ".." in path.parts:
            raise DocumentParseError("EPUB 包含不安全路径。")
        if member.file_size > MAX_ARCHIVE_ENTRY_BYTES:
            raise DocumentParseError("EPUB 中单个文件超过安全大小限制。")
        total_size += member.file_size
        if total_size > MAX_ARCHIVE_TOTAL_BYTES:
            raise DocumentParseError("EPUB 解压后大小超过安全限制。")
        safe[member.filename] = member
    return safe


def _xml_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _parse_epub(data: bytes, document_hash: str) -> tuple[tuple[ParsedChapter, ...], list[QualityIssue]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise DocumentParseError("EPUB 文件不是有效的 ZIP 容器。") from error

    with archive:
        members = _safe_archive_members(archive)
        container_name = "META-INF/container.xml"
        if container_name not in members:
            raise DocumentParseError("EPUB 缺少 META-INF/container.xml。")
        try:
            container = ElementTree.fromstring(archive.read(container_name))
            rootfile = next(element for element in container.iter() if _xml_local_name(element.tag) == "rootfile")
            opf_name = rootfile.attrib["full-path"]
        except (ElementTree.ParseError, StopIteration, KeyError) as error:
            raise DocumentParseError("EPUB 容器描述无效。") from error
        if opf_name not in members:
            raise DocumentParseError("EPUB 指定的 OPF 文件不存在。")

        try:
            package = ElementTree.fromstring(archive.read(opf_name))
        except ElementTree.ParseError as error:
            raise DocumentParseError("EPUB OPF 文件无效。") from error
        manifest: dict[str, str] = {}
        spine: list[str] = []
        for element in package.iter():
            local = _xml_local_name(element.tag)
            if local == "item" and element.attrib.get("id") and element.attrib.get("href"):
                manifest[element.attrib["id"]] = element.attrib["href"]
            elif local == "itemref" and element.attrib.get("idref"):
                spine.append(element.attrib["idref"])

        opf_dir = PurePosixPath(opf_name).parent
        chapters: list[ParsedChapter] = []
        issues: list[QualityIssue] = []
        for idref in spine:
            href = manifest.get(idref)
            if not href:
                issues.append(QualityIssue("MISSING_SPINE_ITEM", "warning", f"EPUB 阅读顺序引用了不存在的条目：{idref}"))
                continue
            # EPUB manifest hrefs are URLs, not literal ZIP member names. Real books
            # commonly percent-encode spaces/non-ASCII characters and may include a
            # query or fragment. Resolve the decoded path relative to the OPF file.
            href_path = unquote(urlsplit(href).path)
            member_path = opf_dir / PurePosixPath(href_path)
            if member_path.is_absolute() or ".." in member_path.parts:
                issues.append(QualityIssue("UNSAFE_CONTENT_PATH", "warning", f"EPUB 正文路径不安全：{href}"))
                continue
            member_name = str(member_path)
            if member_name not in members:
                issues.append(QualityIssue("MISSING_CONTENT_FILE", "warning", f"EPUB 正文文件不存在：{member_name}"))
                continue
            raw = archive.read(member_name)
            text, _ = _decode_text(raw)
            extractor = _HtmlTextExtractor()
            extractor.feed(text)
            content = extractor.text()
            if not content:
                continue
            ordinal = len(chapters)
            title = extractor.title or f"第 {ordinal + 1} 节"
            chapters.append(ParsedChapter(_stable_id("chapter", f"{document_hash}:{ordinal}:{member_name}"), ordinal, title, content, member_name))
        if not chapters:
            raise DocumentParseError("EPUB 没有可读取的正文内容。")
        return tuple(chapters), issues


def _parse_pdf(data: bytes, document_hash: str) -> tuple[tuple[ParsedChapter, ...], list[QualityIssue]]:
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise DocumentParseError("缺少文字型 PDF 解析依赖 pypdf。") from error
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as error:
        raise DocumentParseError("PDF 文件无效或无法读取。") from error
    if reader.is_encrypted:
        raise DocumentParseError("暂不支持加密 PDF。")

    page_text: list[str] = []
    empty_pages = 0
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if not text:
            empty_pages += 1
        page_text.append(text)
    combined = "\n\n".join(text for text in page_text if text)
    if not combined:
        raise DocumentParseError("PDF 没有可提取的文字层，可能是扫描版 PDF。")
    chapters = _split_text(combined, document_hash)
    issues: list[QualityIssue] = []
    if empty_pages:
        issues.append(QualityIssue("EMPTY_PDF_PAGES", "warning", f"PDF 有 {empty_pages} 页未提取到文字。"))
    if len(chapters) == 1 and chapters[0].title == "正文":
        issues.append(QualityIssue("NO_CHAPTER_HEADINGS", "warning", "未识别到章节标题，已将 PDF 全文作为一个章节导入。"))
    return chapters, issues


def parse_document(path: str | Path, project_id: str) -> ParsedDocument:
    source_path = Path(path)
    if not source_path.is_file():
        raise DocumentParseError("导入文件不存在。")
    data = source_path.read_bytes()
    document_hash = hashlib.sha256(data).hexdigest()
    extension = source_path.suffix.lower()
    encoding: str | None = None
    issues: list[QualityIssue] = []

    if extension in {".txt", ".md", ".markdown"}:
        text, encoding = _decode_text(data)
        chapters = _split_text(text, document_hash)
        format_name = "markdown" if extension in {".md", ".markdown"} else "txt"
        if len(chapters) == 1 and chapters[0].title == "正文" and text.strip():
            issues.append(QualityIssue("NO_CHAPTER_HEADINGS", "warning", "未识别到章节标题，已将全文作为一个章节导入。"))
    elif extension == ".epub":
        chapters, parser_issues = _parse_epub(data, document_hash)
        issues.extend(parser_issues)
        format_name = "epub"
    elif extension == ".pdf":
        chapters, parser_issues = _parse_pdf(data, document_hash)
        issues.extend(parser_issues)
        format_name = "pdf"
    else:
        raise DocumentParseError(f"暂不支持此文件格式：{extension or '无扩展名'}")

    issues.extend(_quality_issues(chapters))
    return ParsedDocument(
        project_id=project_id,
        file_name=source_path.name,
        format=format_name,
        byte_size=len(data),
        sha256=document_hash,
        parser_version=PARSER_VERSION,
        encoding=encoding,
        chapters=chapters,
        segments=_segments(document_hash, chapters),
        issues=tuple(issues),
    )

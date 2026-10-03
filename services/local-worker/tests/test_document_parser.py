from __future__ import annotations

import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

from reportlab.pdfgen import canvas

from story_worker.document_parser import DocumentParseError, parse_document
from story_worker.cli import main


CONTAINER_XML = """<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c2"/><itemref idref="c1"/></spine>
</package>
"""


class DocumentParserTests(unittest.TestCase):
    def test_standard_100_chapter_fixture(self) -> None:
        fixture = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "novel-100-chapters.txt"
        result = parse_document(fixture, "project-performance")
        self.assertEqual(len(result.chapters), 100)
        self.assertEqual(len({chapter.id for chapter in result.chapters}), 100)
        self.assertGreaterEqual(len(result.segments), 400)

    def test_txt_detects_chapters_and_stable_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "novel.txt"
            path.write_text("序章\n雾起。\n\n第一章 归来\n林栀回来了。", encoding="utf-8")
            first = parse_document(path, "project-1")
            second = parse_document(path, "project-1")

        self.assertEqual([chapter.title for chapter in first.chapters], ["序章", "第一章 归来"])
        self.assertEqual(first.sha256, second.sha256)
        self.assertEqual([chapter.id for chapter in first.chapters], [chapter.id for chapter in second.chapters])
        self.assertGreaterEqual(len(first.segments), 2)

    def test_epub_uses_spine_order_and_removes_scripts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "book.epub"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("mimetype", "application/epub+zip")
                archive.writestr("META-INF/container.xml", CONTAINER_XML)
                archive.writestr("OPS/content.opf", OPF)
                archive.writestr("OPS/chapter1.xhtml", "<html><body><h1>第一章</h1><p>第一章正文。</p></body></html>")
                archive.writestr("OPS/chapter2.xhtml", "<html><body><h1>第二章</h1><script>bad()</script><p>第二章正文。</p></body></html>")
            result = parse_document(path, "project-1")

        self.assertEqual([chapter.title for chapter in result.chapters], ["第二章", "第一章"])
        self.assertNotIn("bad()", result.chapters[0].content)
        self.assertEqual(result.chapters[0].source_path, "OPS/chapter2.xhtml")

    def test_epub_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unsafe.epub"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("../escape", "unsafe")
                archive.writestr("META-INF/container.xml", CONTAINER_XML)
            with self.assertRaisesRegex(DocumentParseError, "不安全路径"):
                parse_document(path, "project-1")

    def test_pdf_extracts_text_layer_and_reports_missing_headings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "book.pdf"
            document = canvas.Canvas(str(path))
            document.drawString(72, 760, "A story with a real text layer.")
            document.save()
            result = parse_document(path, "project-1")

        self.assertEqual(result.format, "pdf")
        self.assertIn("real text layer", result.chapters[0].content)
        self.assertTrue(any(issue.code == "NO_CHAPTER_HEADINGS" for issue in result.issues))

    def test_rejects_unsupported_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "book.mobi"
            path.write_bytes(b"data")
            with self.assertRaisesRegex(DocumentParseError, "暂不支持"):
                parse_document(path, "project-1")

    def test_cli_emits_versioned_json_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "novel.txt"
            path.write_text("第一章\n正文。", encoding="utf-8")
            output = StringIO()
            progress = StringIO()
            with redirect_stdout(output), redirect_stderr(progress):
                exit_code = main(["parse-document", str(path), "--project-id", "project-1"])

        payload = __import__("json").loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["result"]["document"]["parserVersion"], "document-worker-1")
        self.assertEqual(payload["result"]["document"]["projectId"], "project-1")
        self.assertEqual([line.split("\t")[1:] for line in progress.getvalue().splitlines()], [["读取文件", "10"], ["解析文档格式", "35"], ["识别章节与质量问题", "80"], ["完成章节与片段构建", "100"]])


if __name__ == "__main__":
    unittest.main()

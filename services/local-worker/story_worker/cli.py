from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from .document_parser import DocumentParseError, parse_document


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="story-worker", description="Local worker for story rewriter projects")
    subcommands = parser.add_subparsers(dest="command", required=True)
    parse = subcommands.add_parser("parse-document", help="Parse TXT, Markdown, EPUB, or text-based PDF")
    parse.add_argument("path", help="Absolute or working-directory-relative document path")
    parse.add_argument("--project-id", required=True, help="Project boundary for the imported source")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command != "parse-document":
        raise AssertionError(f"Unhandled command: {args.command}")
    try:
        print("PROGRESS\t读取文件\t10", file=sys.stderr, flush=True)
        print("PROGRESS\t解析文档格式\t35", file=sys.stderr, flush=True)
        result = parse_document(args.path, args.project_id)
        print("PROGRESS\t识别章节与质量问题\t80", file=sys.stderr, flush=True)
        print("PROGRESS\t完成章节与片段构建\t100", file=sys.stderr, flush=True)
    except DocumentParseError as error:
        print(json.dumps({"ok": False, "error": {"code": "DOCUMENT_PARSE_ERROR", "message": str(error)}}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"ok": True, "result": result.to_dict()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

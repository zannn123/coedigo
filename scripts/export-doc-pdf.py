from __future__ import annotations

import html
import re
import sys
import textwrap
from html.parser import HTMLParser
from pathlib import Path


PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT_MARGIN = 50
RIGHT_MARGIN = 50
TOP_MARGIN = 792
BOTTOM_MARGIN = 50
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN


STYLE_MAP = {
    "h1": {"font": "F2", "size": 20, "gap_after": 10, "wrap_factor": 0.58},
    "h2": {"font": "F2", "size": 15, "gap_after": 8, "wrap_factor": 0.58},
    "h3": {"font": "F2", "size": 12, "gap_after": 6, "wrap_factor": 0.58},
    "p": {"font": "F1", "size": 10.5, "gap_after": 6, "wrap_factor": 0.54},
    "li": {"font": "F1", "size": 10.5, "gap_after": 2, "wrap_factor": 0.54},
    "table": {"font": "F3", "size": 9.3, "gap_after": 2, "wrap_factor": 0.6},
    "pre": {"font": "F3", "size": 9.0, "gap_after": 8, "wrap_factor": 0.6},
    "note": {"font": "F1", "size": 10.2, "gap_after": 8, "wrap_factor": 0.54},
}


class DocumentationHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[tuple[str, str]] = []
        self.in_body = False
        self.current_tag: str | None = None
        self.current_chunks: list[str] = []
        self.current_row: list[str] = []
        self.current_cell: list[str] = []
        self.list_stack: list[dict[str, int | str]] = []
        self.in_cell = False
        self.note_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "body":
            self.in_body = True
            return

        if not self.in_body:
            return

        attr_map = {key: value for key, value in attrs}

        if tag == "div" and "note" in (attr_map.get("class") or ""):
            self.note_depth += 1

        if tag in {"h1", "h2", "h3", "p", "pre"}:
            self._flush_block()
            self.current_tag = tag
            self.current_chunks = []
        elif tag == "li":
            self._flush_block()
            self.current_tag = "li"
            self.current_chunks = []
        elif tag in {"ul", "ol"}:
            self.list_stack.append({"type": tag, "index": 0})
        elif tag == "tr":
            self._flush_block()
            self.current_row = []
        elif tag in {"th", "td"}:
            self.current_cell = []
            self.in_cell = True
        elif tag == "br":
            if self.current_tag:
                self.current_chunks.append("\n")
            elif self.in_cell:
                self.current_cell.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "body":
            self._flush_block()
            self.in_body = False
            return

        if not self.in_body:
            return

        if tag in {"h1", "h2", "h3", "p", "pre", "li"}:
            self._flush_block()
        elif tag in {"th", "td"}:
            cell_text = self._normalize_cell("".join(self.current_cell))
            if cell_text:
                self.current_row.append(cell_text)
            self.current_cell = []
            self.in_cell = False
        elif tag == "tr":
            if self.current_row:
                self.blocks.append(("table", " | ".join(self.current_row)))
            self.current_row = []
        elif tag in {"ul", "ol"} and self.list_stack:
            self.list_stack.pop()
        elif tag == "div" and self.note_depth > 0:
            self.note_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.in_body:
            return
        if self.in_cell:
            self.current_cell.append(data)
        elif self.current_tag:
            self.current_chunks.append(data)

    def _flush_block(self) -> None:
        if not self.current_tag:
            return

        raw_text = "".join(self.current_chunks)
        style = self.current_tag

        if style == "pre":
            text = raw_text.strip("\n")
        else:
            text = self._normalize_text(raw_text)

        if text:
            if style == "li":
                text = self._with_list_prefix(text)
            if self.note_depth > 0 and style == "p":
                style = "note"
            self.blocks.append((style, text))

        self.current_tag = None
        self.current_chunks = []

    def _with_list_prefix(self, text: str) -> str:
        depth = max(0, len(self.list_stack) - 1)
        prefix = "- "
        if self.list_stack:
            top = self.list_stack[-1]
            if top["type"] == "ol":
                top["index"] += 1
                prefix = f"{top['index']}. "
        return ("  " * depth) + prefix + text

    @staticmethod
    def _normalize_text(value: str) -> str:
        value = html.unescape(value)
        value = value.replace("\r", "")
        value = re.sub(r"\s+", " ", value)
        return value.strip()

    @staticmethod
    def _normalize_cell(value: str) -> str:
        value = html.unescape(value)
        value = value.replace("\r", "")
        value = re.sub(r"\s+", " ", value)
        return value.strip()


class PdfWriter:
    def __init__(self) -> None:
        self.pages: list[list[tuple[str, float, float, str]]] = [[]]
        self.y = TOP_MARGIN

    def add_block(self, style: str, text: str) -> None:
        spec = STYLE_MAP[style]
        font = spec["font"]
        size = spec["size"]
        gap_after = spec["gap_after"]
        wrap_factor = spec["wrap_factor"]
        line_height = size + 3
        max_chars = max(24, int(CONTENT_WIDTH / (size * wrap_factor)))

        if style == "pre":
            raw_lines = text.splitlines() or [""]
            wrapped_lines: list[str] = []
            for raw_line in raw_lines:
                pieces = textwrap.wrap(
                    raw_line,
                    width=max_chars,
                    break_long_words=False,
                    break_on_hyphens=False,
                    replace_whitespace=False,
                    drop_whitespace=False,
                )
                wrapped_lines.extend(pieces or [""])
        else:
            initial_indent = ""
            subsequent_indent = ""
            if style == "li":
                bullet_match = re.match(r"^(\s*(?:- |\d+\. ))(.*)$", text)
                if bullet_match:
                    initial_indent = bullet_match.group(1)
                    subsequent_indent = " " * len(initial_indent)
                    text = initial_indent + bullet_match.group(2)
            wrapped_lines = textwrap.wrap(
                text,
                width=max_chars,
                break_long_words=False,
                break_on_hyphens=False,
                initial_indent=initial_indent,
                subsequent_indent=subsequent_indent,
            ) or [text]

        required_height = (line_height * len(wrapped_lines)) + gap_after
        self._ensure_space(required_height)

        for line in wrapped_lines:
            self.pages[-1].append((font, size, self.y, line))
            self.y -= line_height

        self.y -= gap_after

    def _ensure_space(self, required_height: float) -> None:
        if self.y - required_height < BOTTOM_MARGIN:
            self.pages.append([])
            self.y = TOP_MARGIN

    def write_pdf(self, output_path: Path) -> None:
        font_helvetica = 1
        font_bold = 2
        font_courier = 3
        pages_id = 4
        page_ids = []
        content_ids = []
        next_id = 5

        for _ in self.pages:
            page_ids.append(next_id)
            next_id += 1
            content_ids.append(next_id)
            next_id += 1

        catalog_id = next_id

        objects: dict[int, bytes] = {
            font_helvetica: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            font_bold: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
            font_courier: b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        }

        kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
        objects[pages_id] = f"<< /Type /Pages /Count {len(page_ids)} /Kids [{kids}] >>".encode("ascii")

        for index, page_lines in enumerate(self.pages):
            page_id = page_ids[index]
            content_id = content_ids[index]

            stream_lines = []
            for font, size, y, text_line in page_lines:
                safe = self._escape_pdf_text(text_line)
                stream_lines.append(
                    f"BT /{font} {size:.1f} Tf 1 0 0 1 {LEFT_MARGIN} {y:.1f} Tm ({safe}) Tj ET"
                )

            stream_data = "\n".join(stream_lines).encode("latin-1", errors="replace")
            objects[content_id] = (
                f"<< /Length {len(stream_data)} >>\nstream\n".encode("ascii")
                + stream_data
                + b"\nendstream"
            )

            objects[page_id] = (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_helvetica} 0 R /F2 {font_bold} 0 R /F3 {font_courier} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("ascii")

        objects[catalog_id] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")

        ordered_ids = sorted(objects)
        pdf = bytearray()
        pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = {}

        for object_id in ordered_ids:
            offsets[object_id] = len(pdf)
            pdf.extend(f"{object_id} 0 obj\n".encode("ascii"))
            pdf.extend(objects[object_id])
            pdf.extend(b"\nendobj\n")

        xref_offset = len(pdf)
        pdf.extend(f"xref\n0 {catalog_id + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")

        for object_id in range(1, catalog_id + 1):
            offset = offsets.get(object_id, 0)
            pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

        pdf.extend(
            (
                f"trailer\n<< /Size {catalog_id + 1} /Root {catalog_id} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF"
            ).encode("ascii")
        )

        output_path.write_bytes(pdf)

    @staticmethod
    def _escape_pdf_text(value: str) -> str:
        value = value.replace("\\", "\\\\")
        value = value.replace("(", "\\(").replace(")", "\\)")
        return value


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/export-doc-pdf.py <source.html> <output.pdf>")
        return 1

    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not source_path.exists():
        print(f"Source document not found: {source_path}")
        return 1

    parser = DocumentationHtmlParser()
    parser.feed(source_path.read_text(encoding="utf-8"))
    parser.close()

    writer = PdfWriter()
    for style, text in parser.blocks:
        writer.add_block(style, text)

    writer.write_pdf(output_path)
    print(f"PDF exported to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

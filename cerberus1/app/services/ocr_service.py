import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Compatibility/stability settings for PaddlePaddle CPU inference.
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("FLAGS_use_mkldnn", "0")

class OCRService:
    """Document extraction service with real parsers/OCR and no fabricated fallback text."""

    _ocr = None

    def extract_text_chunks(self, file_path: str, mime_type: str) -> List[Dict[str, Any]]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = path.suffix.lower()
        mime = (mime_type or "").lower()

        if ext in {".txt", ".md", ".log"} or mime.startswith("text/"):
            content = path.read_text(encoding="utf-8", errors="strict")
            if not content.strip():
                raise ValueError("The uploaded text document is empty; no text was extracted.")
            return self._split_into_chunks(content, 1)

        if ext == ".json" or "json" in mime:
            with path.open("r", encoding="utf-8") as f:
                obj = json.load(f)
            content = json.dumps(obj, ensure_ascii=False, indent=2)
            if not content.strip():
                raise ValueError("The uploaded JSON document is empty; no text was extracted.")
            return self._split_into_chunks(content, 1)

        if ext in {".csv"} or "csv" in mime:
            import csv
            rows = []
            with path.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.reader(f)
                rows = [" | ".join(cell.strip() for cell in row) for row in reader]
            content = "\n".join(r for r in rows if r.strip())
            if not content.strip():
                raise ValueError("The uploaded CSV is empty; no text was extracted.")
            return self._split_into_chunks(content, 1)

        if ext in {".xlsx", ".xlsm", ".xltx", ".xltm"} or "spreadsheet" in mime or "excel" in mime:
            import openpyxl
            wb = openpyxl.load_workbook(filename=str(path), read_only=True, data_only=True)
            chunks = []
            for ws in wb.worksheets:
                lines = []
                for row in ws.iter_rows(values_only=True):
                    values = ["" if v is None else str(v).strip() for v in row]
                    if any(values):
                        lines.append(" | ".join(values))
                if lines:
                    chunks.extend(self._split_into_chunks("\n".join(lines), ws.title or 1))
            if not chunks:
                raise ValueError("The uploaded spreadsheet contains no readable cells.")
            return chunks

        if ext == ".doc" or mime == "application/msword":
            import subprocess
            try:
                completed = subprocess.run(["antiword", str(path)], check=True, capture_output=True, text=True)
                content = completed.stdout.strip()
            except FileNotFoundError as exc:
                raise RuntimeError("Legacy .doc support requires antiword in the backend image.") from exc
            except subprocess.CalledProcessError as exc:
                raise RuntimeError(f"Unable to read legacy .doc file: {exc.stderr.strip() or exc}") from exc
            if not content:
                raise ValueError("The Word .doc document contains no readable text.")
            return self._split_into_chunks(content, 1)

        if ext == ".docx" or "wordprocessingml.document" in mime:
            from docx import Document as DocxDocument
            doc = DocxDocument(str(path))
            lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    vals = [cell.text.strip() for cell in row.cells]
                    if any(vals):
                        lines.append(" | ".join(vals))
            content = "\n".join(lines)
            if not content.strip():
                raise ValueError("The Word document contains no readable text.")
            return self._split_into_chunks(content, 1)

        if ext == ".pdf" or "pdf" in mime:
            return self._extract_pdf(path)

        if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"} or mime.startswith("image/"):
            text = self._ocr_image(path)
            if not text.strip():
                raise ValueError("OCR completed but found no readable text in the image.")
            return self._split_into_chunks(text, 1)

        raise ValueError(
            f"Unsupported document type '{ext or mime}'. Supported formats: PDF, DOCX, XLSX, CSV, JSON, TXT, PNG, JPG, JPEG."
        )

    def _extract_pdf(self, path: Path) -> List[Dict[str, Any]]:
        chunks: List[Dict[str, Any]] = []
        try:
            import pdfplumber
            with pdfplumber.open(str(path)) as pdf:
                for page_idx, page in enumerate(pdf.pages, start=1):
                    page_text = (page.extract_text() or "").strip()
                    if page_text:
                        chunks.extend(self._split_into_chunks(page_text, page_idx))
        except Exception as exc:
            logger.warning("PDF text extraction failed for %s: %s", path, exc)

        # For scanned/image-only pages, render the PDF and run the same real OCR pipeline.
        if not chunks:
            try:
                import fitz
                doc = fitz.open(str(path))
                for page_idx, page in enumerate(doc, start=1):
                    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                    text = self._ocr_image_bytes(pix.tobytes("png"))
                    if text.strip():
                        chunks.extend(self._split_into_chunks(text, page_idx))
                doc.close()
            except Exception as exc:
                logger.exception("Scanned PDF OCR failed for %s", path)
                raise RuntimeError(f"PDF OCR failed: {exc}") from exc

        if not chunks:
            raise ValueError("No readable text could be extracted from this PDF.")
        return chunks

    @classmethod
    def _get_ocr(cls):
        if cls._ocr is None:
            try:
                from paddleocr import PaddleOCR
                cls._ocr = PaddleOCR(
                    text_detection_model_name="PP-OCRv5_mobile_det",
                    text_recognition_model_name="PP-OCRv5_mobile_rec",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    device="cpu",
                )
            except Exception as exc:
                logger.exception("Failed to initialize PaddleOCR")
                raise RuntimeError(f"PaddleOCR initialization failed: {exc}") from exc
        return cls._ocr

    @staticmethod
    def _result_to_dict(result: Any) -> Dict[str, Any]:
        data = None
        try:
            value = getattr(result, "json", None)
            if callable(value):
                data = value()
            elif value is not None:
                data = value
        except Exception:
            data = None
        if data is None and isinstance(result, dict):
            data = result
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict):
            return {}
        return data.get("res", data)

    @classmethod
    def _ocr_image(cls, path: Path) -> str:
        with path.open("rb") as f:
            return cls._ocr_image_bytes(f.read())

    @classmethod
    def _ocr_image_bytes(cls, data: bytes) -> str:
        import tempfile
        ocr = cls._get_ocr()
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(data)
                tmp_path = tmp.name
            results = ocr.predict(tmp_path)
            lines: List[str] = []
            for res in results:
                payload = cls._result_to_dict(res)
                texts = payload.get("rec_texts") or []
                scores = payload.get("rec_scores") or []
                for idx, t in enumerate(texts):
                    t = str(t).strip()
                    if not t:
                        continue
                    try:
                        score = float(scores[idx]) if idx < len(scores) else 1.0
                    except Exception:
                        score = 1.0
                    # OCR confidence is metadata; do not invent or edit text.
                    if score >= 0.35:
                        lines.append(t)
            return "\n".join(lines)
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    def _split_into_chunks(self, text: str, page_number: Any, max_chunk_chars: int = 1500) -> List[Dict[str, Any]]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
        if not paragraphs:
            return []

        chunks = []
        current_chunk: List[str] = []
        current_len = 0
        chunk_idx = 0
        for paragraph in paragraphs:
            if current_chunk and current_len + len(paragraph) + 2 > max_chunk_chars:
                chunks.append({
                    "page_number": int(page_number) if str(page_number).isdigit() else 1,
                    "chunk_index": chunk_idx,
                    "text_content": "\n\n".join(current_chunk),
                })
                chunk_idx += 1
                current_chunk = [paragraph]
                current_len = len(paragraph)
            else:
                current_chunk.append(paragraph)
                current_len += len(paragraph) + 2
        if current_chunk:
            chunks.append({
                "page_number": int(page_number) if str(page_number).isdigit() else 1,
                "chunk_index": chunk_idx,
                "text_content": "\n\n".join(current_chunk),
            })
        return chunks

ocr_service = OCRService()

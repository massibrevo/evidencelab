import hashlib
import io
import re

import httpx
from pypdf import PdfReader

from .schema import Chunk, Paper


def chunk_paper(paper: Paper, max_chars: int = 900, overlap: int = 120) -> list[Chunk]:
    """Sentence-aware boundaries with exact source offsets; no semantic-embedding claim."""
    if max_chars < 50 or not 0 <= overlap < max_chars:
        raise ValueError("Require max_chars >= 50 and 0 <= overlap < max_chars")
    text = paper.text
    chunks, start = [], 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            boundaries = list(re.finditer(r"[.!?]\s+|\n\n", text[start:end]))
            if boundaries and boundaries[-1].end() > max_chars // 2:
                end = start + boundaries[-1].end()
        chunk_id = hashlib.sha256(f"{paper.id}:{start}:{end}:{text[start:end]}".encode()).hexdigest()[:20]
        chunks.append(
            Chunk(
                id=chunk_id,
                paper_id=paper.id,
                title=paper.title,
                text=text[start:end],
                start=start,
                end=end,
                source=paper.source,
            )
        )
        if end == len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def semantic_chunks(paper: Paper, encoder, threshold: float = 0.45) -> list[Chunk]:
    """Optional semantic breakpoints, preserving offsets and imposing a size bound."""
    import numpy as np

    spans = list(re.finditer(r"[^.!?]+(?:[.!?](?:\s+|$)|$)", paper.text))
    if len(spans) < 2:
        return chunk_paper(paper)
    embeddings = np.asarray(encoder.encode([s.group() for s in spans], normalize_embeddings=True))
    cuts = [0]
    for i in range(1, len(spans)):
        if float(embeddings[i - 1] @ embeddings[i]) < threshold:
            cuts.append(spans[i].start())
    cuts.append(len(paper.text))
    result = []
    for start, end in zip(cuts, cuts[1:]):
        segment = paper.model_copy(update={"text": paper.text[start:end]})
        for c in chunk_paper(segment):
            offset = c.start + start
            result.append(
                c.model_copy(
                    update={
                        "start": offset,
                        "end": c.end + start,
                        "id": hashlib.sha256(f"{paper.id}:{offset}:{c.text}".encode()).hexdigest()[:20],
                    }
                )
            )
    return result


def pdf_paper(content: bytes, title: str, source: str = "local upload") -> Paper:
    if len(content) > 20 * 1024 * 1024:
        raise ValueError("PDF exceeds the 20 MiB limit")
    reader = PdfReader(io.BytesIO(content))
    if len(reader.pages) > 200:
        raise ValueError("PDF exceeds the 200-page limit")
    text = "\n\n".join(f"[Page {i + 1}]\n{p.extract_text() or ''}" for i, p in enumerate(reader.pages))
    if len(re.sub(r"\[Page \d+\]", "", text).strip()) < 20:
        raise ValueError("No extractable text; scanned PDFs require an external OCR step")
    return Paper(id="pdf-" + hashlib.sha256(content).hexdigest()[:16], title=title, text=text, source=source)


def arxiv_paper(identifier: str) -> Paper:
    # Only a validated arXiv ID, never a caller-provided URL: prevents arbitrary-network fetches.
    if not re.fullmatch(r"\d{4}\.\d{4,5}(v\d+)?", identifier):
        raise ValueError("Use a modern arXiv identifier such as 2305.14314")
    url = f"https://arxiv.org/pdf/{identifier}"
    with httpx.Client(timeout=45, follow_redirects=False) as client:
        with client.stream("GET", url, headers={"User-Agent": "EvidenceLab/0.1 local-research"}) as response:
            response.raise_for_status()
            data = bytearray()
            for block in response.iter_bytes():
                data.extend(block)
                if len(data) > 20 * 1024 * 1024:
                    raise ValueError("PDF exceeds the 20 MiB limit")
    return pdf_paper(bytes(data), f"arXiv:{identifier}", f"https://arxiv.org/abs/{identifier}")

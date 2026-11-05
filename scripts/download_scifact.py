import hashlib
import io
import tarfile
from pathlib import Path

import httpx

URL = "https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz"
# Verified source archive used for the shipped subset. Fail closed if upstream 'latest' changes.
SHA256 = "11c621288d41ac144d29b13b0f8503b3820b7d6e8b1f6ff24dff335c196d76be"


def main():
    data = httpx.get(URL, timeout=60).raise_for_status().content
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("Archive changed. Review provenance before updating the pinned checksum.")
    destination = Path("data/downloads/scifact")
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for name in ("corpus.jsonl", "claims_train.jsonl", "claims_dev.jsonl", "claims_test.jsonl"):
            member = next(m for m in archive.getmembers() if m.name.endswith("/" + name))
            if member.size > 50 * 1024**2:
                raise ValueError("Unexpected archive size")
            (destination / name).write_bytes(archive.extractfile(member).read())
    print(f"Verified download: {destination}")


if __name__ == "__main__":
    main()

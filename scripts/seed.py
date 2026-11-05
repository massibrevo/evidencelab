"""Idempotent offline seed; never downloads weights or datasets."""

from evidencelab.service import Lab

lab = Lab()
print(f"Indexed {len(lab.store.papers())} papers / {len(lab.index.chunks)} chunks")
lab.store.close()

# Data provenance

`demo/papers.json`: 108 original SciFact/S2ORC scientific abstracts, ODC-By-1.0.
`demo/queries.json`: 24 original SciFact dev claims and evidence annotations, CC-BY-4.0.
`demo/manifest.json`: upstream URL/checksum, subset hashes, seed and selection algorithm.

Attribution: David Wadden, Shanchuan Lin, Kyle Lo, Lucy Lu Wang, Madeleine van Zuylen, Arman Cohan and Hannaneh Hajishirzi (2020), *Fact or Fiction: Verifying Scientific Claims*. Abstract corpus from Semantic Scholar S2ORC. [Source](https://github.com/allenai/scifact), [license](https://github.com/allenai/scifact/blob/master/LICENSE.md), [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), [ODC-By-1.0](https://opendatacommons.org/licenses/by/1-0/).

This subset adapts the original JSONL data to JSON, joins abstract sentences with spaces and preserves numeric document IDs. Seeded sampling chooses 24 dev claims with evidence, keeps all their gold papers and adds 80 distractors. No scientific text or claim labels are generated. It is a development demonstration, not an independent test set. Original `doc_id` values are dataset identifiers, not Semantic Scholar article hashes.

Full data are downloaded only through `scripts/download_scifact.py`, which verifies the archive checksum and reads allowlisted tar members without path extraction. Upstream training data can be converted with `scripts/prepare.py`. Official test labels are not public. arXiv and user-uploaded papers retain their own rights: public access does not imply a universal redistribution license. No arXiv full text is bundled here.

QASPER conversion is provided for original train JSON; dataset licensing is [CC-BY-4.0](https://huggingface.co/datasets/allenai/qasper). Its full text is not packaged. Foundation capability datasets are fetched by the optional harness at explicit execution and retain their upstream terms.

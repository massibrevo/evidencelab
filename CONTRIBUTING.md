# Contributing

Start with a reproducible issue: system version, dependency lock, exact command, expected/observed behavior and a minimal paper/claim example you can legally share. Never include private papers, cache tokens or large model weights.

Use the README quick start. Core tests need no network. Frontend tests mock the service boundary; browser checks should also exercise the real API. Optional hardware tests belong behind an explicit marker/command and must record model/device/library revisions.

For experimental changes, state the hypothesis, held-constant settings, changed intervention and dataset split. Submit raw per-query records with any score claim. A successful smoke check does not establish an ML improvement. Document failed ablations as carefully as successful ones.

The project uses Apache-2.0 for code. Dataset and model licenses are independent; see NOTICE and data/README.md. Contributions are provided under the same code license.

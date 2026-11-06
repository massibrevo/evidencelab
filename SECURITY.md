# Security policy

EvidenceLab is a single-user workstation. Run the dashboard and API on loopback. The Docker Compose port is published to `127.0.0.1`. The API rejects foreign hosts and cross-site browser requests, limits request bodies, and tells browsers not to cache API responses or embed the dashboard in frames. Run the service under your own local account.

Keep integration credentials in the local API process environment. Credentials are used to authenticate to the selected provider over TLS. Frontend builds, notebook kernels and training subprocesses receive a restricted environment. Git and Docker ignore common credential files, conversation archives and local databases. GitHub push protection and CI secret scanning check for accidental exposure. If a real secret appears in Git history, revoke it at the provider and replace it.

Notebook execution is opt-in. Cells run with the local user's file and network permissions. Run notebook cells you trust. External agent actions require an individual approval. Local file operations are scoped to an operator-selected directory or the agent workspace, and filesystem writes refuse to overwrite files. Hosted decision experiments require consent before sending prompts to their provider.

The optional benchmark harness still brings in [sqlitedict 2.1.0](https://github.com/advisories/GHSA-g4r7-86gm-pgqc). EvidenceLab disables response and request caches in the harness and accepts no external cache path. The upstream dependency has no patched release.

Open a pull request for changes to `main`. GitHub requires review by the repository's sole code owner, `@massibrevo`, for contributor changes. GitHub blocks direct pushes, force pushes and branch deletion. The repository owner can complete a pull request they authored using GitHub's pull-request-only bypass.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/massibrevo/evidencelab/security/advisories/new). Include a reproducible example using synthetic data.

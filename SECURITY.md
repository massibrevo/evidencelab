# Security model

EvidenceLab is a trusted single-user workstation bound to localhost. It has no authentication or tenant isolation. Keep the default loopback binding; do not expose this service to the public internet without a separate authentication, authorization, reverse-proxy, upload-quota and worker-isolation design.

The service accepts bounded PDFs/text and validated modern arXiv IDs. It does not accept arbitrary fetch URLs. Model loading uses no remote code. Uploaded document content is untrusted model context, never an executable tool instruction. The server does not execute generated code or launch training through web routes.

Untrusted PDF parsers and machine-learning packages remain a dependency risk. Apply updates and process hostile documents in isolation. SQLite and all source text remain in the configured local artifact directory; protect that directory according to the sensitivity of your research.

Report a reproducible vulnerability privately through the repository's GitHub security reporting feature when enabled. Do not post private source documents or credentials in a public issue.

# Security model

EvidenceLab is a trusted single-user workstation bound to localhost. It has no authentication or tenant isolation. Keep the default loopback binding; do not expose this service to the public internet without a separate authentication, authorization, reverse-proxy, upload-quota and worker-isolation design.

The service accepts bounded PDFs/text and validated modern arXiv IDs. It does not accept arbitrary fetch URLs. Model loading uses no remote code. Uploaded document content is untrusted model context, never an executable tool instruction. The standard research service does not launch training or execute generated answers through web routes. An explicit `--notebooks` startup option enables a local Python kernel for user-selected notebook cells. Kernels have the local user’s file/network permissions; this is not a code sandbox. Do not expose notebook execution to untrusted clients. Imported notebooks never execute automatically; rendered outputs allow plain text and PNG only.

Untrusted PDF parsers and machine-learning packages remain a dependency risk. Apply updates and process hostile documents in isolation. SQLite and all source text remain in the configured local artifact directory; protect that directory according to the sensitivity of your research.

Report a reproducible vulnerability privately through the repository's GitHub security reporting feature when enabled. Do not post private source documents or credentials in a public issue.

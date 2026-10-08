# Project rules

- This repository is a standalone local application. Only use its own `data/` or temporary test databases.
- Read `README.md`, `UPSTREAM.md` and `CONTRIBUTING.md` before changing core behavior.
- Never add private study records, textbook/question-bank excerpts, PDF/OCR data, credentials, deployment scripts or machine-specific paths.
- Preserve vendor files and their license verbatim; verify hashes when updating upstream.
- Keep answer hiding, rating, cross-group intervals, count-based plans, append-only audit and transactional replay invariants.
- Run format, lint, tests, build/typecheck and vendor verification. Keep runtime TypeScript erasable by Node24.
- No automatic website deployment or model calls. Use the documented GitHub review workflow for changes.

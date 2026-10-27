# Implementation notes

## Design decisions

The first version wraps an existing MIT diagnostic engine instead of porting its Rust rules. This preserves its tested JSON/JSONC/TOML semantics and provenance, and makes upgrades reviewable.

The UI is an independent local orchestration layer. It translates upstream findings into Chinese explanations while retaining original rule codes and evidence. Static scan, write-capable repairs and explicit process probes are separate modules.

## Repair transaction

1. Resolve a finding from an in-memory report; never accept arbitrary replacement text from the HTTP client.
2. Re-read the registered config and compare its exact-byte SHA-256 with the scan baseline.
3. Produce a selected-server preview, redacting known secrets.
4. On explicit apply, recheck canonical path, reject symlinks, check content hash again, save and verify original bytes, then atomically replace the config with a sibling temporary file.
5. Persist a recovery manifest and re-scan. A later scan failure does not misreport an applied fix as unapplied.
6. Restore checks original-backup integrity and exact current after-hash; it refuses to overwrite later edits.

The file lock coordinates this application's writes; it is not an OS-wide lock against every external writer. Exact hash checks narrow race windows; no tool can promise transaction isolation against uncooperative external programs without OS-level locking.

## Scope and future work

- Add TOML edits only with a comment-preserving parser and equivalent regression coverage.
- Add approved remote HTTP diagnostics with explicit destination display and bounded credentials handling.
- Add more documented repair types rather than guessing package names or installing software.
- Add operating-system ACL-aware private backup storage on Windows.
- Improve accessibility and translation coverage with real user testing.
- Build signed release artifacts and Windows CI before public distribution.

## Verification

Run npm run check after installing the pinned upstream engine.
Core integration tests use that actual binary and real local MCP handshake fixtures.
All mutation tests target dedicated temporary directories.

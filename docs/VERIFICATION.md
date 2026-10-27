# Verification — 2026-10-27

## Automated verification

- TypeScript typecheck and Vite production build: passed.
- 24 regression tests: passed, 0 failures, 0 skipped on Windows.
- Tests invoke the real pinned MCP Doctor v0.1.17 binary; the executable's recorded checksum is verified.
- Actual local MCP initialize/tools-list exchange: passed; no callable tools executed.
- Exact original-byte restore, stale preview rejection, edited-file protection, corrupted backup rejection, JSONC preservation, credential redaction, client-specific disabled flags, Windows npx literal arguments and HTTP session/origin validation: passed.

## Interactive verification

Using only the generated example workspace:

1. Initial scan: 2 config files, 7 servers, 3 errors.
2. Previewed stale-node-path: command changed from the synthetic missing path to the installed Node executable.
3. Applied repair: original backup was created, automatic recheck reduced errors from 3 to 2.
4. Explicitly probed local-demo: MCP handshake succeeded and tool names were read; no tools were called.
5. Restored the original config through the UI: backup state changed to restored.
6. Re-scanned the example and clicked recheck: the scope remained example-only and the initial 3 errors returned.
7. Desktop window opened and loaded the workbench. Software rendering is used for broader VM compatibility.
8. Narrow-screen navigation has accessible names and tooltips.
9. The portable executable was launched without an attached terminal; closed-pipe startup logging was fixed and the workbench window opened without the prior EPIPE dialog.

No real user MCP configuration was modified by these tests. All interactive repairs targeted generated example files.

## UI revision — 2026-10-27

- Replaced the promotional banner, gradients, decorative cards and slogans with a compact neutral workbench.
- Summary controls filter errors, warnings and repairable findings; service count opens the configuration list.
- Configuration and runtime views use rows with readable paths, versions and connection states.
- Production typecheck/build passed. In-browser verification covered the initial state, example scan, severity/repair filters, diff preview, configuration navigation and runtime inventory.

## Limits

This is an unsigned MVP. TOML repairs and remote HTTP probes are not implemented. Static scans do not certify a server's business behavior. Windows CI is provided but has not been run on GitHub.

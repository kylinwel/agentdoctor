# Third-party components and provenance

## MCP Doctor — actual reused diagnostic engine

- Repository: https://github.com/Tinkora/mcp_doctor
- Pinned release: v0.1.17
- Release source commit: abeaab6a20935251ce25c8b99871c9bcdca8fddf
- Copyright: (c) 2026 Tinkora contributors
- License: MIT, reproduced at vendor/mcp-doctor/LICENSE
- Distribution: official platform release archive; published SHA256SUMS is verified before extraction. The extracted executable hash is recorded and checked before invocation.
- Changes: none to the upstream binary. All upstream diagnostic codes are retained and attributed.
- The upstream engine remains strictly read-only. Optional execution and repair features are separate AgentDoctor modules.

## Other actual dependencies

- Microsoft jsonc-parser: https://github.com/microsoft/node-jsonc-parser — MIT — preserving JSONC comments during local edits.
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk — MIT — explicit initialize/tools-list probes.
- React: https://github.com/facebook/react — MIT — UI.
- Lucide: https://github.com/lucide-icons/lucide — ISC — icons.
- Electron: https://github.com/electron/electron — MIT plus bundled Chromium/third-party notices — desktop runtime.
- jsdiff: https://github.com/kpdecker/jsdiff — BSD-3-Clause — reviewable patch display.
- @iarna/toml: https://github.com/iarna/iarna-toml — ISC — read-only TOML parsing.
- Zod: https://github.com/colinhacks/zod — MIT — API input validation.
- extract-zip: https://github.com/max-mapper/extract-zip — BSD-2-Clause — official archive extraction.
- Vite and TypeScript: build-time dependencies; see installed package licenses.

Exact resolved versions are in package-lock.json. Portable builds retain installed dependency license files and Electron's LICENSE/LICENSES.chromium.html.

## References, without copied implementation

- CC Switch: https://github.com/farion1231/cc-switch — reviewed as a related client configuration manager; no source was copied.
- Official MCP server Windows npx documentation: https://github.com/modelcontextprotocol/servers — compatibility reference. AgentDoctor uses a direct Node launcher rather than synthesizing shell command text.

There are no copied product screenshots, logos or proprietary assets.

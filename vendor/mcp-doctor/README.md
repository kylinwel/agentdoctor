# Vendored MCP Doctor engine

AgentDoctor invokes the **unmodified** MCP Doctor CLI from Tinkora/mcp_doctor.
Pinned release: v0.1.17 (release source commit abeaab6a20935251ce25c8b99871c9bcdca8fddf).
Source: https://github.com/Tinkora/mcp_doctor/tree/v0.1.17
License: MIT; retained in this directory.

Run npm run setup:engine to download the official platform archive and verify its published SHA-256.
The downloaded binary is ignored by Git. AgentDoctor's source distribution includes this notice.
All static findings retain their upstream rule codes and attribution.
The upstream CLI never starts configured MCP commands. Optional active probes are a separate
AgentDoctor capability, explicitly requested by the user for one displayed server.

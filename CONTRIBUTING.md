# Contributing

AgentDoctor welcomes reproducible bug reports, client compatibility fixes and small focused pull requests. The interface is currently Chinese; issues and pull requests may be written in Chinese or English.

## Development

Use Node.js 22.12+ (24 recommended), then run:

```sh
npm ci --ignore-scripts
npm run setup:engine
npm run dev
```

Run `npm run check` before opening a pull request. Tests use isolated temporary configurations. The optional desktop shell requires `npm run setup:desktop`.

## Bug reports

Include your OS, AgentDoctor version, client name, rule code and reproduction steps. A scrubbed report can help, but review it before sharing. Do not upload API keys, access tokens, original configuration files or `.agentdoctor/backups/`. Prefer a minimal configuration with invented values.

## Implementation boundaries

- Keep the upstream MCP Doctor binary unmodified and preserve attribution.
- Static scanning must never start configured servers.
- Repairs require a diff, explicit approval, original-byte backup and stale-file checks.
- Probes must remain explicit, time-bounded and separate from scanning.
- Preserve comments and unrelated configuration values.

Contributions are distributed under the project's MIT license. Describe the user-visible problem, resulting behavior and relevant verification in your pull request.

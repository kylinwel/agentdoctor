// Side-effect-free local MCP fixture, exposing no callable tools.
import { createInterface } from 'node:readline';
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  try {
    const request = JSON.parse(line);
    if (request.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'agentdoctor-local-fixture', version: '1.0.0' } } }) + '\n');
    else if (request.method === 'tools/list') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [] } }) + '\n');
  } catch {}
}


import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpServerTransport } from '@modelcontextprotocol/sdk/server/http.js';
import { ClientRegistry, validateRegistry } from './mcp/clients';
import { loadConfig } from './mcp/config';
import { registerFanoutTools } from './mcp/tools/fanout';
import { registerReadTools } from './mcp/tools/read';
import { registerWriteTools } from './mcp/tools/write';

async function main(): Promise<void> {
  const config = loadConfig();
  const registry = new ClientRegistry(config);

  await validateRegistry(registry, config.teamDeclaredByUser);

  const server = new McpServer({
    name: 'sura-elabftw',
    version: '0.1.0',
  });

  registerReadTools(server, registry, config);
  registerWriteTools(server, registry, config);
  if (registry.teams().length > 1) {
    registerFanoutTools(server, registry);
  }

  const host = process.env.MCP_HOST || '0.0.0.0';
  const port = parseInt(process.env.MCP_PORT || '8000', 10);

  const transport = new HttpServerTransport({ host, port });
  await server.connect(transport);

  // biome-ignore lint/suspicious/noConsole: CLI entry point, stdout is appropriate
  console.log(`elabftw MCP server listening on http://${host}:${port}`);
}

main().catch((error) => {
  // biome-ignore lint/suspicious/noConsole: CLI entry point, stderr is appropriate
  console.error('elabftw MCP server failed to start:', error);
  process.exit(1);
});

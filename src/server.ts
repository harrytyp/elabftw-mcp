
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SseServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ClientRegistry, validateRegistry } from './mcp/clients';
import { loadConfig } from './mcp/config';
import { registerFanoutTools } from './mcp/tools/fanout';
import { registerReadTools } from './mcp/tools/read';
import { registerWriteTools } from './mcp/tools/write';

// --- Types & Session Management ---

interface SessionData {
  apiKey: string;
  baseUrl: string;
  lastActive: number;
}

interface SessionContext {
  token: string;
  apiKey: string;
  baseUrl: string;
}

const sessionStore = new Map<string, SessionData>();
const sessionContext = new AsyncLocalStorage<SessionContext>();
const transports = new Map<string, SseServerTransport>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function cleanupSessions() {
  const now = Date.now();
  for (const [token, data] of sessionStore.entries()) {
    if (now - data.lastActive > SESSION_TIMEOUT) {
      sessionStore.delete(token);
    }
  }
  // Cleanup orphaned transports if necessary
  // (In a real app, we'd link transport IDs to tokens)
}

// --- Server Factory ---

function createMcpServer(registry: ClientRegistry, config: any) {
  const server = new McpServer({
    name: 'sura-elabftw',
    version: '0.1.0',
  });

  registerReadTools(server, registry, config);
  registerWriteTools(server, registry, config);
  if (registry.teams().length > 1) {
    registerFanoutTools(server, registry);
  }

  // Custom Tool: configure_auth
  server.tool(
    'configure_auth',
    {
      token: { type: 'string', description: 'Your eLabFTW API Key' },
      baseUrl: { type: 'string', description: 'Your eLabFTW Instance URL' },
    },
    async ({ token, baseUrl }) => {
      const ctx = sessionContext.getStore();
      if (!ctx) {
        return { content: [{ type: 'text', text: 'Error: This tool can only be used in a hosted session.' }] };
      }

      sessionStore.set(ctx.token, {
        apiKey: token,
        baseUrl: baseUrl.replace(/\/$/, ''),
        lastActive: Date.now(),
      });

      return { content: [{ type: 'text', text: 'Authentication updated successfully.' }] };
    },
  );

  return server;
}

// --- Main Server ---

export async function main(): Promise<void> {
  const config = loadConfig();
  const registry = new ClientRegistry(config);
  await validateRegistry(registry, config.teamDeclaredByUser);

  const app = express();
  app.use(express.json());

  // Middleware for Session Tracking
  app.use((req, res, next) => {
    const token = req.query.token as string;
    if (token && sessionStore.has(token)) {
      const data = sessionStore.get(token)!;
      data.lastActive = Date.now();
      sessionContext.run({ token, apiKey: data.apiKey, baseUrl: data.baseUrl }, next);
    } else {
      next();
    }
  });

  // Registration UI
  app.get('/register', (req, res) => {
    res.send(`
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 40px auto; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #2c3e50;">eLabFTW MCP Registration</h2>
        <p style="color: #666;">Enter your API token to generate a personal session URL.</p>
        <form method="post" action="/register">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">API Token:</label>
            <input type="password" name="apiKey" placeholder="Paste your token here" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" required>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">eLabFTW Base URL:</label>
            <input type="text" name="baseUrl" value="${config.baseUrl}" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
          </div>
          <button type="submit" style="background: #3498db; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 1em; width: 100%;">Generate MCP URL</button>
        </form>
      </div>
    `);
  });

  app.post('/register', express.urlencoded({ extended: true }), (req, res) => {
    const { apiKey, baseUrl } = req.body;
    if (!apiKey) return res.status(400).send('API Key is required');

    const token = randomUUID();
    sessionStore.set(token, {
      apiKey,
      baseUrl: baseUrl.replace(/\/$/, ''),
      lastActive: Date.now(),
    });

    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'] || 'localhost:8000';
    const personalUrl = `${proto}://${host}/sse?token=${token}`;

    res.send(`
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 40px auto; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #2c3e50;">Registration Successful</h2>
        <p>Use the following URL in your MCP client (e.g. Claude Desktop):</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; word-break: break-all; font-family: monospace; border: 1px solid #eee; margin: 10px 0;">
          ${personalUrl}
        </div>
        <p style="color: #666; font-size: 0.9em; margin-top: 20px;">
          Note: This session will expire after 30 minutes of inactivity.
        </p>
        <a href="/register" style="display: inline-block; margin-top: 10px; color: #3498db; text-decoration: none;">&larr; Register another key</a>
      </div>
    `);
  });

  // --- MCP SSE Integration ---

  app.get('/sse', async (req, res) => {
    const token = req.query.token as string;
    if (!token || !sessionStore.has(token)) {
      res.status(401).send('Unauthorized: No valid session token provided.');
      return;
    }

    const transport = new SseServerTransport('/message', res);
    const server = createMcpServer(registry, config);
    
    await server.connect(transport);
    
    // Map transport to a unique ID provided by the SDK (or our token)
    // Note: SseServerTransport handles its own session management internally 
    // when using the /message endpoint, but we need to ensure the server
    // instance is preserved.
    transports.set(transport.sessionId, transport);

    // Cleanup when connection closes
    res.on('close', () => {
      transports.delete(transport.sessionId);
    });
  });

  app.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    
    if (!transport) {
      res.status(404).send('Session not found');
      return;
    }
    
    await transport.handlePostMessage(req, res);
  });

  setInterval(cleanupSessions, 5 * 60 * 1000);

  const host = process.env.MCP_HOST || '0.0.0.0';
  const port = parseInt(process.env.MCP_PORT || '8000', 10);
  app.listen(port, host, () => {
    console.log(`elabftw MCP server listening on http://${host}:${port}`);
    console.log(`Registration page: http://${host}:${port}/register`);
  });
}

main().catch((error) => {
  console.error('elabftw MCP server failed to start:', error);
  process.exit(1);
});

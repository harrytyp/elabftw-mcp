# @harrytyp/elabftw-mcp (Hosted)

This repository is a **fork** of the original [letrplB/elabftw-mcp](https://github.com/letrplB/elabftw-mcp). 

While the original is designed primarily as a local `stdio` server for single-user desktop use, this fork extends it to support **centralized server-side hosting**. It adopts the architectural patterns found in [harrytyp/datatagger-mcp](https://github.com/harrytyp/datatagger-mcp) to enable multi-user support via HTTP/SSE and a self-service registration endpoint.

Model Context Protocol server for [elabftw](https://www.elabftw.net/) —
search, read, and (optionally) mutate experiments, items, attachments,
comments, steps, and links in an electronic lab notebook from any
MCP-aware AI client.

Target: elabftw **5.5+** via the [API v2](https://doc.elabftw.net/api/v2/).
Node 18+.

## Usage Modes

The server supports two transport modes:

1.  **STDIO (Local)**: Default mode, used for local integrations like Claude Desktop.
2.  **SSE (Server)**: Used for network-accessible deployments (e.g., in Docker). Supports multi-user session authentication.

## Quick start (STDIO)

### Single team

```json
{
  "mcpServers": {
    "elabftw": {
      "command": "npx",
      "args": ["-y", "@sura_ai/elabftw"],
      "env": {
        "ELABFTW_BASE_URL": "https://elab.example.com",
        "ELABFTW_API_KEY": "3-<rest of your key>"
      }
    }
  }
}
```

Mint a key in your elabftw UI under **Settings → API keys**. By default
the server runs read-only even if the key has write permissions. Set
`ELABFTW_ALLOW_WRITES=true` to enable mutation tools.

### Multi-team

elabftw API keys are bound to the team you were viewing when you
created them. Each key's team context determines what data it can
reach. For admin-level access to multiple teams, mint one key per
team and configure them with indexed env vars:

```json
{
  "mcpServers": {
    "elabftw": {
      "command": "npx",
      "args": ["-y", "@sura_ai/elabftw"],
      "env": {
        "ELABFTW_BASE_URL": "https://elab.example.com",
        "ELABFTW_KEY_3": "26-<key minted in team 3>",
        "ELABFTW_KEY_3_LABEL": "Main Lab",
        "ELABFTW_KEY_7": "27-<key minted in team 7>",
        "ELABFTW_KEY_7_LABEL": "Teaching Group",
        "ELABFTW_DEFAULT_TEAM": "3"
      }
    }
  }
}
```

Every tool now takes an optional `team` parameter. Omit for the default;
pass `team=7` to route a call through the team-7 key. The tool
`elab_search_all_teams` runs the same query across every configured
team in parallel and merges results.

## Centralized Hosting (SSE)

This server can be hosted centrally (e.g., in a Docker container) to serve multiple users. Each user provides their own API key via a registration interface, ensuring total isolation between users.

### Deployment (Admin Guide)

The repository includes a `Dockerfile` and `docker-compose.yml` for production-ready deployment.

1.  **Clone and Configure**:
    - Clone this repository.
    - (Optional) Edit `docker-compose.yml` to set a default `ELABFTW_BASE_URL`.
2.  **Start the Cluster**:
    ```bash
    docker-compose up -d --build
    ```
    This starts the MCP server and a Caddy reverse proxy (providing automatic HTTPS on port 443).
3.  **Network Access**: 
    - Ensure ports `80` and `443` are open on your firewall.
    - The registration page will be available at `https://your-domain/register`.

### User Setup (Registration)

Users do not need to edit config files. They can self-provision their access:
1.  Visit the registration page: `https://your-domain/register`.
2.  Enter your **eLabFTW API Key** and **Instance URL**.
3.  The server generates a **Personal Session URL** (e.g., `https://your-domain/sse?token=uuid`).
4.  **Configure Client**: Copy this URL into your MCP client (Claude Desktop, Cursor, etc.) as the SSE server endpoint.

### Session-based Authentication

Users can update their credentials without re-registering by using the `configure_auth` tool directly in the chat:

`configure_auth(token="YOUR_NEW_API_KEY", baseUrl="https://elab.example.com")`

-   **Private**: Credentials are stored only in memory for the current session.
-   **Transient**: Sessions expire after 30 minutes of inactivity.
-   **Priority**: This overrides any global defaults set in `docker-compose.yml`.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ELABFTW_BASE_URL` | yes | — | Instance URL, no trailing slash, no `/api/v2` suffix. |
| `ELABFTW_API_KEY` | one of | — | Raw API key (single-team mode). Sent as `Authorization: <key>` — no `Bearer` prefix, per the elabftw spec. |
| `ELABFTW_KEY_<teamId>` | one of | — | One API key per team (multi-team mode). Example: `ELABFTW_KEY_19=26-abc...`. Repeat for each team. |
| `ELABFTW_KEY_<teamId>_LABEL` | no | — | Optional label shown by `elab_configured_teams`. |
| `ELABFTW_DEFAULT_TEAM` | no | lowest id | In multi-team mode, which team's key is used when a tool call omits `team`. |
| `ELABFTW_TEAM_ID` | no | auto | Single-team mode: pin the inferred team. Discovered at startup via `/users/me` when unset. |
| `ELABFTW_ALLOW_WRITES` | no | `false` | `true` to expose create / update / delete / comment / step / link / tag tools. |
| `ELABFTW_ALLOW_DESTRUCTIVE` | no | `false` | `true` to additionally expose lock / unlock / sign / timestamp / bloxberg. Irreversible. Requires `ELABFTW_ALLOW_WRITES=true`. |
| `ELABFTW_REVEAL_USER_IDENTITIES` | no | `false` | `true` to surface user names / emails / orcids in formatter output. Default-off means user tools and comment listings return `user <id>` instead of PII. `elab_me` is exempt (callers always see their own identity). |
| `ELABFTW_TIMEOUT_MS` | no | `30000` | Per-request timeout. |
| `ELABFTW_USER_AGENT` | no | `sura-elabftw-mcp/<version>` | Shows up in instance access logs. |
| `MCP_MODE` | no | `stdio` | Set to `hosted` for HTTP/SSE server mode. |
| `MCP_HOST` | no | `0.0.0.0` | Host to bind the HTTP server to. |
| `MCP_PORT` | no | `8000` | Port for the HTTP server. |

## Security model

The deployment model for this fork provides two options depending on your trust requirements:

- **Local Mode (STDIO)**: The server talks MCP over stdin/stdout to a locally-trusted parent process (Claude Desktop, Cursor, etc.). **No network port is opened.** This remains the most secure way to use the MCP for personal research.
- **Hosted Mode (SSE)**: When `MCP_MODE=hosted` is set, the server opens an HTTP port. This is intended for server-side deployments. Security is handled via:
  - **Tokenized Sessions**: Users receive unique tokens; their API keys are never stored on disk and are kept isolated in memory.
  - **Inactivity Timeouts**: Sessions are purged from memory after 30 minutes of inactivity.
- **Your own API key**: All eLabFTW calls use the key you provide. The MCP has no elevated access; it can only do what your user account is permitted to do.
- **Writes are off by default**: Even with the new transport, mutation tools are only exposed if `ELABFTW_ALLOW_WRITES=true` is set by the admin.

## Known gotchas

- **Session Expiry**: In Hosted/SSE mode, sessions expire after 30 minutes of inactivity. You will need to re-register at `/register` if your session times out.
- **`Authorization` header has no `Bearer` prefix.** This trips up generic HTTP clients. The server sends the key verbatim, which is what eLabFTW expects.
- **`metadata` is a JSON-encoded string on the wire.** `elab_get` parses it for display; when writing, send `metadata` as a JSON string.
- **Bodies are HTML by default on create.** If you seed an entry with markdown content, follow up with `elab_update_entity({content_type: "markdown", body: ...})`.
- **Pagination is offset-based with no total count.** Tools cap at 200 rows per call; use `offset` to page further.
- **Locked entities reject edits.** `elab_update_entity` will fail on a locked entry. `elab_unlock` is available under `ELABFTW_ALLOW_DESTRUCTIVE`.

## Programmatic use

The client library ships alongside the MCP server:

```ts
import { ElabftwClient } from '@sura_ai/elabftw';

const client = new ElabftwClient({
  baseUrl: 'https://elab.example.com',
  apiKey: '3-<rest of your key>',
});

const me = await client.me();
for await (const row of client.paginate('experiments', { q: 'stöber' })) {
  console.log(row.id, row.title);
}
```

## Development

```bash
npm install
npm run typecheck
npm run build      # emits dist/index.js, dist/cli.js, and dist/*.d.ts via tsup
```

Run the server locally against your instance:

**STDIO Mode:**
```bash
ELABFTW_BASE_URL=https://elab.example.com \
ELABFTW_API_KEY=3-... \
node dist/cli.js
```

**Hosted Mode (Testing):**
```bash
MCP_MODE=hosted \
MCP_PORT=8000 \
node dist/cli.js
```

## License

MIT. See [LICENSE](./LICENSE).

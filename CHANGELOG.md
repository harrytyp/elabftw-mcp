# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `elab_search_users`, `elab_get_user`, `elab_list_team_users` read
  tools. Resolves the opaque `userid` field on entities to a real
  user (role, team memberships, and — when opted in — name / email).
- `ELABFTW_REVEAL_USER_IDENTITIES` env var (default `false`). When
  off, user names / emails / orcids are redacted to `user <id>` in
  all formatter output. `elab_me` is exempt.
- `elab_get` now accepts
  `include: ["steps","comments","attachments","links"]` and fans
  out sub-resource fetches in parallel. Drops per-entity round-trip
  count for cohort review from 4 to 1.
- `elab_get` body rendering is now lossless by default. New
  `format` arg: `markdown` (default) preserves HTML tables as GFM
  pipes and link hrefs via turndown; `text` is the previous
  regex-stripped output; `html` passes the raw body through. Ansatz
  tables and literature links now survive review. Markdown cap is
  4000 chars; text cap remains 2000.
- `elab_list_extra_field_names` exposes the instance-wide
  `/extra_fields_keys` endpoint. Use with `elab_get` on a template
  to discover the structured schema students are expected to fill.
- `elab_list_revisions` + `elab_get_revision` expose eLabFTW's
  per-entity revision history. Surfaces edit timestamps and
  authors, and renders historical bodies through the markdown
  converter.
- Client: new `ElabftwClient.listRevisions` /
  `ElabftwClient.getRevision` methods. New `ElabRevision` type.
- `elab_get_bulk` fetches up to 50 entities in one call with shared
  `include` / `format`. Chunks requests into groups of 8 so a
  50-id call doesn't open 50 sockets at once. Cohort-review
  shortcut: 40 students × 4 round-trips → 1 tool call.

### Changed

- **Breaking (default-on privacy):** `elab_list_comments` no longer
  prints `fullname` by default. Rows now render as
  `user <id> @ <timestamp>: ...`. Set
  `ELABFTW_REVEAL_USER_IDENTITIES=true` to restore the previous
  behaviour.
- **Breaking (default markdown body):** `elab_get`'s default body
  rendering switched from regex-stripped plaintext to turndown
  markdown (tables + link hrefs preserved). Pass `format="text"`
  to restore byte-for-byte legacy output.

## [0.1.0] — 2026-04-17

### Added

- Initial release.
- MCP server wrapping the elabftw v2 REST API.
- Read tools: `elab_me`, `elab_info`, `elab_search`, `elab_get`,
  `elab_list_attachments`, `elab_download_attachment`,
  `elab_list_comments`, `elab_list_steps`, `elab_list_links`,
  `elab_list_templates`, `elab_list_items_types`, `elab_list_tags`,
  `elab_list_events`, `elab_list_teams`, `elab_configured_teams`,
  `elab_export`.
- Write tools (gated by `ELABFTW_ALLOW_WRITES=true`): create / update /
  duplicate / delete entities, update a single extra_field, add comments
  / steps, toggle steps, link / unlink entities, add / remove tags.
- Destructive tools (gated by `ELABFTW_ALLOW_DESTRUCTIVE=true`): lock,
  force-unlock, RFC 3161 timestamp, bloxberg anchor, sign.
- Multi-team support: configure one API key per team via
  `ELABFTW_KEY_<teamId>` env vars; every tool accepts an optional
  `team` parameter that routes the call through the matching key.
- Fan-out `elab_search_all_teams` tool merges results across every
  configured team in parallel.
- Standalone `ElabftwClient` library export for programmatic use
  without running the MCP server.

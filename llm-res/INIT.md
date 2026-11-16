# INIT.md

Project initiation record (per `AGENTIC.md` section 0). Fill this **once, before `phase_01` and before any app code**. Agent: fill every field by asking the user for what is missing - never guess the name, stack, or commands. Confirm the completed file back to the user before starting work.

**Role:** project setup record. **Read when:** before `phase_01` and at session start for stack/commands. **Update when:** stack, layout, commands, data handling, or deploy target change.

## Identity

- Project name: bmail (display name: bountyMail)
- Project slug (snake_case, used for repo/directory/binary names): bmail
- One-line description: Tiny inbound email inbox on Cloudflare Workers. Mail lands in R2, and an agent polls it over REST or MCP.
- Distribution: public and self-hosted. No deployment-specific domain, address, account ID, or key is committed.
- Hosting constraint: **Cloudflare Workers Free plan**. R2 is the only storage; no D1, Durable Objects, Queues, or KV.
- App type: worker
- Owner: `undecided`
- Date initialized (UTC): 2026-11-16

## Tech stack

- Primary language + version: TypeScript (Cloudflare Workers runtime; Node.js 22+ for the MCP client and tooling)
- Framework: Cloudflare Workers + Wrangler; native `fetch` router, no HTTP framework
- Package manager: pnpm (workspace: `worker/` and `client/`)
- Runtime: Cloudflare Workers (V8 isolates) on the Workers Free plan
- Database / storage: R2 only. One object per message under `mail/<address>/<timestamp>-<random>.eml`, plus one latest marker per address under `latest/<address>`
- Auth mechanism: one shared bearer key, `bmail_api_key`, compared in constant time
- Key third-party dependencies: Worker runtime: none. MCP client: `postal-mime`, `@modelcontextprotocol/sdk`, `zod`
- Why this stack: Email Routing invokes a Worker directly, R2 stores raw MIME without a database, and the MCP client parses mail on the agent host so the Worker stays tiny.
- Configuration: `.env` is the source of truth. `pnpm dev` writes `worker/.dev.vars`; `pnpm deploy` maps values to Worker vars and the secret.

## Design system

- Design system: **Neo Brutalism** (override of the `AGENTIC.md` section 13 default Material 3; approved by the user on 2026-11-16)
- Reference: <https://www.neobrutalism.dev/docs>
- Applies to: any web UI built later. v1 has no UI.
- Theme modes: light / dark / auto (default: auto)
- Theme persistence: `undecided`
- Source / seed color: `undecided`
- Motion engine: anime.js (v4+), unchanged from `AGENTIC.md`
- Motion policy: 150-300 ms, `prefers-reduced-motion` respected
- Accessibility target: WCAG AA
- Approved overrides: design system only. Motion and the light/dark/auto tri-state stay in force.

## Layout

- Project root (absolute path): /home/enji/dev/ts/bmail
- App/source directory: pnpm workspace with `worker/` and `client/`
- Tests directory: `worker/test/` and `client/test/`
- Config/secrets: `.env` (gitignored) and `.env.example` (committed placeholders)

## Commands (canonical verify commands)

- Install: `pnpm install`
- Build: `pnpm build`
- Lint (must be zero warnings): `pnpm lint`
- Format: `pnpm lint` (no separate formatter)
- Test: `pnpm test`
- Run dev (bind 127.0.0.1 only): `pnpm dev`
- Run prod: `pnpm deploy`
- MCP server: `pnpm mcp` or `node client/dist/mcp.js`

## Environments & release

- Environments (dev/staging/prod): local dev + production Worker per self-hosted deployment
- Mail domains: **not in code**. `bmail_mail_domains` is a comma-separated list. Any address on a configured domain is accepted.
- Deploy target / mechanism: Cloudflare Workers via Wrangler, Free plan, deployed by tag
- Retention: none. R2 keeps messages until the operator deletes them or adds an R2 lifecycle rule.

## Security

- Security tier: strict core with a single shared API key.
- Hardcoding ban: no domain, address, account ID, or key in source, config examples, docs, or tests. Examples use reserved names. Missing config fails closed.
- Data handled: raw email, OTPs, verification links = confidential; addresses = internal; `bmail_api_key` = secret.
- Trust boundaries: internet mail -> Email Routing -> Worker `email()`; agent -> public HTTPS API; Worker -> R2.
- Controls: constant-time key comparison, strict address validation before building R2 keys, 25 MiB platform size cap, no body logging, raw parsing only on the agent host.
- No retention and no rate limiting: storage growth and request volume are operator concerns, documented in `THREAT.md`.

## Scope

- In scope for v1: `email()` R2 ingest, one REST list route, one REST raw route, one stdio MCP server with `list_messages`, `get_message`, `wait_for_message`.
- Out of scope: aliases, registration, D1, retention cleanup, UI, outbound mail, Worker-hosted MCP, rate limiting, full-text search.
- Open questions:
  - Owner name
  - Deployment zone and R2 bucket name in the real `.env`

## Agent completion checklist

- [ ] Every field filled - no blanks or `TODO` markers remain (write `none` + reason if not applicable)
- [x] Stack, layout, design system, and commands confirmed by the user
- [x] Values copied into the `PHASE.md` Workspace block
- [x] Initialization recorded in `MEMORY.md`
- [x] `THREAT.md` seeded from the stack, data handled, and trust boundaries

# INIT.md

Project initiation record (per `AGENTIC.md` section 0). Fill this **once, before `phase_01` and before any app code**. Agent: fill every field by asking the user for what is missing - never guess the name, stack, or commands. Confirm the completed file back to the user before starting work.

**Role:** project setup record. **Read when:** before `phase_01` and at session start for stack/commands. **Update when:** stack, layout, commands, data handling, or deploy target change.

## Identity

- Project name: bmail (display name: bountyMail)
- Project slug (snake_case, used for repo/directory/binary names): bmail
- One-line description: Self-hostable inbound email gateway for an autonomous security agent - alias per target, raw mail stored, read API/CLI/MCP, mirrored copy to the owner.
- Distribution: public and self-hosted. No deployment-specific domain, address, account ID, or token is committed to the repository.
- Hosting constraint: **Cloudflare Workers Free plan**. Every feature must fit the Free limits; paid-only primitives (Durable Objects, Queues) and quota-heavy features are excluded by design.
- App type: worker
- Owner: `undecided`
- Date initialized (UTC): 2026-11-16

## Tech stack

- Primary language + version: TypeScript (Cloudflare Workers runtime; Node.js 22+ for tooling)
- Framework: Cloudflare Workers + Wrangler; the Worker uses a native `fetch` router and no HTTP framework (smallest bundle and CPU)
- Package manager: pnpm (workspace: `worker/` and `client/`)
- Runtime: Cloudflare Workers (V8 isolates) on the **Workers Free plan**
- Database / storage: D1 (metadata only), R2 (raw RFC 5322 messages, attachments stay inside the raw MIME), KV not used in v1
- Auth mechanism: per-agent bearer tokens, SHA-256 hashed at rest with a server-side pepper, scoped per mail domain, optional expiry
- Key third-party dependencies (only those justified by the task): Worker runtime: none. `bmail` client and MCP server: `postal-mime` (local parsing), MCP SDK, TypeScript.
- Why this stack (1-2 lines): Email Routing invokes a Worker directly for inbound mail, and D1/R2 cover metadata and raw content with no extra infrastructure. The Worker stores raw mail **without parsing**, so ingest stays inside the Free plan's 10 ms CPU budget; MIME parsing runs on the agent host.
- Free-tier budget (verified 2026-11-16): 100,000 requests/day; 10 ms CPU per HTTP request and per Cron Trigger; 128 MB memory; 50 subrequests; 5 Cron Triggers per account. D1: 5M rows read/day, 100,000 rows written/day, 5 GB. R2: 10 GB-month, 1M Class A and 10M Class B operations/month. Every v1 feature is sized against these numbers.
- Configuration: `.env` at the repo root is the source of truth. The Worker cannot read `.env` at runtime, so the deploy script maps `bmail_*` values to Worker `vars` and secrets and writes `.dev.vars` for local dev. `.env` is gitignored; `.env.example` carries placeholders only.

## Design system

- Design system: **Neo Brutalism** (override of the `AGENTIC.md` section 13 default Material 3; approved by the user on 2026-11-16)
- Reference: <https://www.neobrutalism.dev/docs>
- Component source: shadcn/ui registry, `https://neobrutalism.dev/r/styling/<palette>.json`; built on Base UI, Tailwind CSS, `class-variance-authority`, `lucide-react`, `tw-animate-css`
- Theme modes: light / dark / auto (default: auto)
- Theme persistence: `undecided` (proposed: `localStorage["bmail_theme"]`, explicit stored choice)
- Source / seed color (M3 replaced by neobrutalism palette): `undecided` - proposed start with the blue registry palette (`--main: hsl(217 100% 66%)`); palette chosen at UI phase
- Design tokens: `--background`, `--secondary-background`, `--main`, `--main-foreground`, `--foreground`, `--border`, `--ring`, `--overlay`, `--shadow`; 4px hard offset shadow, 5px base radius, base font weight 500, heading weight 700
- Motion engine: anime.js (v4+), unchanged from `AGENTIC.md`
- Motion policy: 150-300 ms, snappy press/offset feedback on interactive elements, `prefers-reduced-motion` respected
- Accessibility target: WCAG AA - verify every `--main` / `--main-foreground` pair and the focus ring; a border or shadow alone is never the only focus indicator
- Approved overrides (design system, motion, or theme): design system only (Material 3 -> Neo Brutalism). Motion (anime.js) and the light/dark/auto tri-state stay in force.
- Applies to: any web UI built for this project. v1 is headless, so the override takes effect when the admin UI phase starts.

## Layout

- Project root (absolute path): /home/enji/dev/ts/bmail
- App/source directory: pnpm workspace: `worker/` and `client/`
- Tests directory: `worker/test/` and `client/test/`
- Config/secrets: `.env` (gitignored) and `.env.example` (committed placeholders, synced per AGENTIC.md section 8)

## Commands (canonical verify commands)

- Install: `pnpm install`
- Build: `pnpm build` (wrangler dry-run bundle + client tsc)
- Lint (must be zero warnings): `pnpm lint`
- Format: `pnpm lint` (no separate formatter configured)
- Test: `pnpm test`
- Run dev (bind 127.0.0.1 only): `pnpm dev` (writes `worker/.dev.vars` from `.env`, listens on 127.0.0.1:8787)
- Run prod: `pnpm deploy` (requires Cloudflare credentials, D1 and R2 created, and remote migration applied)
- Smoke test: `pnpm smoke` (requires a running local server and `BMAIL_ADMIN_TOKEN`)

## Environments & release

- Environments (dev/staging/prod): local dev + production Worker per self-hosted deployment
- Mail domains: **not in code**. `bmail_mail_domains` is a comma-separated `domain:mode` list. `catch_all` allows new aliases; `fixed` allows only the addresses in `bmail_fixed_addresses`, which are created on first inbound.
- Default mail domain for clients: `bmail_default_mail_domain`, used by the CLI/MCP when a call omits `mail_domain`.
- Agent runtime: remote host - the agent runs the `bmail` client and stdio MCP server next to itself and calls the public HTTPS API; no Worker-side MCP endpoint, no OAuth
- Deploy target / mechanism: Cloudflare Workers via Wrangler, deployed by tag, Free plan

## Security

- Security tier: strict core, confirmed by the user on 2026-11-16, with a free-tier efficiency budget. No security control is relaxed: hashed tokens, per-domain scope, optional expiry, sender authentication, input validation, secrets handling, and dependency audit all stay. Efficiency comes from doing less work per invocation and moving MIME parsing to the agent host, not from weaker checks.
- Hardcoding ban: no domain, email address, account ID, zone ID, or token may appear in source, config examples, docs, or tests. Examples use reserved names (`example.com`, `example.test`). Missing runtime config fails closed.
- Data handled and classification (public / internal / confidential / secret): message bodies, OTP codes, verification links = confidential; alias metadata and mail domains = internal; agent bearer tokens = secret
- Retention: `bmail_retention_days` (default 90) for aliases, messages, and raw MIME (attachments live inside the raw message)
- Mirror loop guard: `bmail_forward_to` must not be on a configured mail domain, and any message carrying `X-BMail-*` headers is dropped on re-entry
- Trust boundaries: internet mail -> Email Routing -> Worker `email()`; remote agent -> public HTTPS API; Worker -> D1/R2; domain config -> Worker bindings

## Scope

- In scope for the first phase: `phase_01_inbound_capture` - Worker skeleton on the Free plan, multi-domain config from env with `catch_all` and `fixed` modes, fixed-address auto-create, alias lookup keyed by `(mail_domain, local_part)`, trusted Authentication-Results handling, header-only metadata, raw stream to R2, D1 insert, mirror copy to the owner inbox
- Deferred (not v1): outbound mail, Worker-hosted MCP endpoint, admin web UI, Durable Objects, Queues, full-text search, MIME parsing inside the Worker
- Dropped as unneeded for v1: attachment table and download endpoint (raw MIME already contains them), read/unread state, threading metadata, per-alias token scope, alias pause/update (delete and recreate), D1 audit table (Workers logs instead), rate-limit tables, CORS, HTML rendering and sanitization
- Open questions (resolve before the phase that needs them):
  - Package manager, source/test layout, and canonical commands
  - Owner name

## Agent completion checklist

- [ ] Every field filled - no blanks or `TODO` markers remain (write `none` + reason if not applicable)
- [ ] Stack, layout, design system, and commands confirmed by the user
- [ ] Values copied into the `PHASE.md` Workspace block
- [ ] Initialization recorded as the first `MEMORY.md` entry
- [ ] `THREAT.md` seeded from the stack, data handled, and trust boundaries

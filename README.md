# bmail (bountyMail)

Inbound-only email gateway for an autonomous security agent. It gives the agent its own addresses, stores raw mail, and exposes read-only access over HTTP, a CLI, and an MCP server.

The Worker is designed for the **Cloudflare Workers Free plan**: it stores raw MIME without parsing it, so ingest stays inside the 10 ms CPU budget. MIME parsing happens on the agent host.

## What it does

- Accepts mail for one or more configured domains.
- `catch_all` domains allow the agent to create aliases on demand.
- `fixed` domains accept only allowlisted addresses, created automatically on first inbound.
- Streams every accepted message into R2 and stores metadata in D1.
- Mirrors a copy to the owner inbox with `X-BMail-*` tracing headers.
- Exposes read-only API routes and an MCP server for the agent.
- Deletes D1 rows after the retention window; an R2 lifecycle rule removes raw objects.

## Requirements

- Cloudflare account on the Free plan. No paid-only primitives are used.
- A domain on Cloudflare with Email Routing.
- Node.js 22 or newer, pnpm 10 or newer.

## Local quick start

```bash
pnpm install
cp .env.example .env
# fill in bmail_* values; reserved domains like mail.example.com are fine locally
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` writes `worker/.dev.vars` from `.env` and starts Wrangler on `127.0.0.1:8787`.

Create the first agent token with the admin token:

```bash
export bmail_api_url=http://127.0.0.1:8787
export bmail_admin_token=<your bmail_admin_token>
pnpm --filter bmail-client build
node client/dist/cli.js tokens create --name local-agent --domains '*'
```

Send a local test message:

```bash
curl --request POST 'http://127.0.0.1:8787/cdn-cgi/handler/email?from=sender@example.com&to=acme-7f3k2a@mail.example.com' \
  --data-raw 'From: sender@example.com
To: acme-7f3k2a@mail.example.com
Subject: Test
Message-ID: <test-1@example.com>
Content-Type: text/plain

Your code is 123456.'
```

Then read it:

```bash
export bmail_token=<token from tokens create>
node client/dist/cli.js messages list
node client/dist/cli.js messages get <message_id>
```

Run the local smoke test after the server is up:

```bash
BMAIL_ADMIN_TOKEN=<admin token> \
BMAIL_CATCH_ALL=<catch-all domain> \
BMAIL_FIXED=<fixed domain> \
BMAIL_FIXED_ADDRESS=<address on the fixed domain> \
pnpm smoke
```

## Configuration

All runtime config comes from `.env`. The Worker cannot read `.env` directly, so `pnpm dev` and `pnpm deploy` map the values to Worker vars and secrets. No domain is compiled into the code.

| key | purpose |
|---|---|
| `bmail_mail_domains` | comma-separated `domain:mode`, mode is `catch_all` or `fixed` |
| `bmail_fixed_addresses` | full addresses accepted on `fixed` domains |
| `bmail_default_mail_domain` | default domain for API/CLI/MCP calls that omit `mail_domain` |
| `bmail_forward_to` | verified Email Routing destination for the mirror; must not be on a configured mail domain |
| `bmail_retention_days` | retention window, default 90 |
| `bmail_token_pepper` | server-side pepper for token hashes |
| `bmail_admin_token` | operator token for `/v1/tokens` and `bmail tokens ...` |
| `cloudflare_worker_name` | Worker name for deploy |
| `cloudflare_d1_database_id` | D1 database id for deploy |
| `cloudflare_r2_bucket_name` | R2 bucket for deploy |
| `cloudflare_account_id` | optional account id for deploy |
| `bmail_api_url` | client only: API base URL |
| `bmail_token` | client only: agent token |

## Deploy

```bash
wrangler login
wrangler d1 create bmail
wrangler r2 bucket create bmail-mail
# put the D1 id and bucket name in .env
pnpm deploy
wrangler d1 execute bmail --remote --config worker/wrangler.jsonc \
  --file worker/migrations/0001_init.sql
```

Then in the Cloudflare dashboard:

1. Enable Email Routing on each mail domain.
2. For a `catch_all` domain, set the catch-all action to the `bmail` Worker.
3. For a `fixed` domain, create one literal routing rule to the Worker for the address in `bmail_fixed_addresses`.
4. Add an R2 lifecycle rule on the bucket that deletes objects after `bmail_retention_days`.
5. The CRON trigger `17 3 * * *` deletes expired D1 rows.

Create tokens with the operator token:

```bash
export bmail_api_url=https://<worker>.<account>.workers.dev
export bmail_admin_token=<secret>
pnpm bmail tokens create --name remote-agent --domains '*'
```

The token is printed once. Give it to the agent host.

## MCP server

The MCP server runs on the agent host over stdio and calls the Worker API. Build the client first, then point the MCP client at `client/dist/cli.js` (or link the `bmail` bin globally with `pnpm --filter bmail-client link --global`):

```json
{
  "mcpServers": {
    "bmail": {
      "command": "node",
      "args": ["/absolute/path/to/bmail/client/dist/cli.js", "mcp"],
      "env": {
        "bmail_api_url": "https://bmail.example.workers.dev",
        "bmail_token": "<agent token>",
        "bmail_default_mail_domain": "mail.example.com"
      }
    }
  }
}
```

Tools: `config`, `list_aliases`, `create_alias`, `delete_alias`, `list_messages`, `get_message`, `wait_for_message`.

Every tool accepts an optional `mail_domain`. `wait_for_message` polls with a cursor and backoff. Message content is returned with `untrusted: true`; links and OTPs are candidates, not verified data.

## Security notes

- Tokens are stored as SHA-256 hashes with a server-side pepper, scoped per mail domain, with optional expiry.
- Unknown aliases are dropped before the message body is read.
- `fixed` domains accept only `bmail_fixed_addresses`.
- The mirror target cannot be on a configured mail domain, and messages carrying `X-BMail-*` are dropped to prevent loops.
- Raw mail is parsed on the agent host, not in the Worker.
- Rate limiting is not implemented. The Workers daily request cap is the backstop.

## Limits

The design targets the Workers Free plan: 100,000 requests/day, 10 ms CPU per invocation, 5 GB D1 storage, 10 GB-month R2 storage. See the Cloudflare docs for current quotas.

## License

Not set yet.

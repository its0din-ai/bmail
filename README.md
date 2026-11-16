# bmail

A tiny inbound email inbox on Cloudflare Workers. Mail is stored in R2 and read through a REST endpoint or an MCP server. No database, no UI, no aliases, no retention job.

## Flow

1. Pick any address on a configured domain, for example `test@mail.example.com`.
2. Poll it through the REST API or MCP with the shared key.
3. If a message exists, read the raw message and parse it locally.

There is no registration step. Every address on a configured domain is accepted.

## Requirements

- Cloudflare account on the Free plan.
- A domain on Cloudflare with Email Routing.
- An R2 bucket.
- Node.js 22 or newer, pnpm 10 or newer.

## Setup

```bash
pnpm install
cp .env.example .env
# fill in bmail_mail_domains, bmail_api_key, cloudflare_r2_bucket_name
wrangler login
wrangler r2 bucket create <cloudflare_r2_bucket_name>
pnpm deploy
```

Then in the Cloudflare dashboard:

1. Enable Email Routing on each domain in `bmail_mail_domains`.
2. For a catch-all domain, set the catch-all action to the `bmail` Worker.
3. For a single address, create one literal routing rule to the `bmail` Worker.

Mail is stored under `mail/<address>/<timestamp>-<random>.eml` in R2. Nothing deletes it automatically. If you want expiry, add an R2 lifecycle rule.

## Local dev

```bash
pnpm dev
```

`pnpm dev` writes `worker/.dev.vars` from `.env` and listens on `127.0.0.1:8787`.

Send a local message:

```bash
curl --request POST 'http://127.0.0.1:8787/cdn-cgi/handler/email?from=sender@example.com&to=test@mail.example.com' \
  --data-raw 'From: sender@example.com
To: test@mail.example.com
Subject: Test
Content-Type: text/plain

Your code is 123456.'
```

List it:

```bash
curl 'http://127.0.0.1:8787/v1/inbox/test%40mail.example.com' \
  -H "authorization: Bearer $bmail_api_key"
```

## REST API

All `/v1` routes require `Authorization: Bearer <bmail_api_key>`.

| route | purpose |
|---|---|
| `GET /health` | liveness, no auth |
| `GET /v1/inbox/:address?after=<cursor>&limit=<n>` | list message metadata, newest paging via `next_cursor` |
| `GET /v1/inbox/:address/:id` | raw RFC 5322 message |

The address must be URL encoded. `after` is the `next_cursor` from the previous response. `limit` is 1 to 200, default 50.

## MCP server

Build the client, then point the MCP client at `client/dist/mcp.js`:

```bash
pnpm build
```

```json
{
  "mcpServers": {
    "bmail": {
      "command": "node",
      "args": ["/absolute/path/to/bmail/client/dist/mcp.js"],
      "env": {
        "bmail_api_url": "https://bmail.example.workers.dev",
        "bmail_api_key": "<shared key>",
        "bmail_address": "test@mail.example.com"
      }
    }
  }
}
```

Tools:

- `list_messages` - metadata for an address, with an `after` cursor.
- `get_message` - fetch raw mail and return subject, text, links, OTP candidates, and attachment metadata.
- `wait_for_message` - poll until a new message arrives, starting from now when `after` is omitted.

Every tool accepts an `address` argument; it defaults to `bmail_address`. Message content is returned with `untrusted: true`.

## Notes

- One shared key grants access to every configured address.
- No retention. R2 keeps messages until you delete them or add a lifecycle rule.
- No rate limiting. The Workers daily request cap is the backstop.
- MIME parsing happens in the MCP client, not in the Worker, so ingest stays cheap.
- Raw message size is capped by Cloudflare at 25 MiB.

# bmail

A tiny inbound email inbox on Cloudflare Workers. Mail is stored in R2 and read through a REST endpoint or an MCP server. No database, no UI, no aliases. Ack deletes the stored copy; a lifecycle rule catches anything left behind.

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

Mail is stored under `mail/<address>/<timestamp>-<random>.eml` in R2. The agent calls `ack_message` after a successful read to delete the stored copy; your forwarded archive is unaffected. `pnpm deploy` also sets an R2 lifecycle rule that expires `mail/` and `latest/` objects after `bmail_lifecycle_days` (default 7 days).

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
| `DELETE /v1/inbox/:address/:id` | acknowledge and delete the stored copy |

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
- `ack_message` - delete the R2 copy after a successful read. The forwarded archive is unaffected.
- `wait_for_message` - poll until a new message arrives, starting from now when `after` is omitted.

Every tool accepts an `address` argument; it defaults to `bmail_address`. Message content is returned with `untrusted: true`.

## Free plan budget

The design is sized for the Workers Free and R2 Free tiers.

| operation | R2 class | when |
|---|---|---|
| store a message | Class A | 2 per received email (message plus latest marker) |
| read a message | Class B | 1 per `get_message` |
| poll with a cursor and no new mail | Class B | 1 `head` per poll |
| poll that finds new mail | Class B + A | 1 `head` plus 1 `list` |
| list without a cursor | Class A | first call only |
| acknowledge a message | free | one `DeleteObject` per ack |

A cursor poll does not call `ListObjects` unless the latest marker says something newer exists. That keeps polling cheap.

The default poll interval is 5 seconds, with a 2-second minimum. At 5 seconds, one hour of waiting is 720 requests. That is about 21,600 requests per month if you wait one hour per day. R2 Free includes 1M Class A operations, 10M Class B operations, and 10 GB-month of storage. The Workers Free plan includes 100,000 requests per day.

Storage is bounded by two things: `ack_message` deletes a message after the agent reads it, and the lifecycle rule deletes anything the agent did not ack after `bmail_lifecycle_days` (default 7). Set a longer window if you want more recovery time.

The rule is applied by `pnpm deploy` and replaces the bucket's lifecycle configuration, so use a dedicated bucket. Change `bmail_lifecycle_days` to keep messages longer, then redeploy.

## Notes

- One shared key grants access to every configured address.
- Ack deletes the R2 copy. Your forwarded personal archive is the source of truth and is unaffected.
- The lifecycle rule is a safety net for messages the agent never acknowledges.
- No rate limiting. The Workers daily request cap is the backstop.
- MIME parsing happens in the MCP client, not in the Worker, so ingest stays cheap.
- Raw message size is capped by Cloudflare at 25 MiB.

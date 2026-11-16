<p align="center">
  <img src="assets/banner.svg" alt="bmail - inbound email for agents on Cloudflare Workers and R2" width="100%">
</p>

<p align="center">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=white">
  <img alt="Cloudflare R2" src="https://img.shields.io/badge/Cloudflare-R2-F38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=white">
  <img alt="Cloudflare Email Routing" src="https://img.shields.io/badge/Email-Routing-F38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=white">
  <img alt="MCP server" src="https://img.shields.io/badge/MCP-server-111111?style=for-the-badge">
  <img alt="Free tier" src="https://img.shields.io/badge/Free%20tier-friendly-05E17A?style=for-the-badge">
</p>

# bmail

A tiny inbound email inbox for autonomous agents, built on the Cloudflare Free plan.

- **Cloudflare Workers** receive mail and serve the polling API.
- **Cloudflare Email Routing** handles MX, catch-all, and literal address rules.
- **Cloudflare R2** stores the raw message and a per-address latest marker.
- **MCP** gives the agent `list_messages`, `get_message`, `ack_message`, and `wait_for_message`.

No database, no UI, no aliases. One Worker, one R2 bucket, one shared key.

## Cloudflare products used

| Product | Role in bmail | Free plan note |
|---|---|---|
| **Cloudflare Workers** | Runs the `email()` ingest handler and the HTTPS REST API. | 100,000 requests/day, 10 ms CPU per invocation. |
| **Cloudflare Email Routing** | Receives mail at the domain MX, applies catch-all or literal rules, invokes the Worker, and prepends a trusted `Authentication-Results` header. | Free. 25 MiB inbound limit, 200 routing rules per domain. Routing rules decide what reaches the Worker; bmail applies a second allowlist. |
| **Cloudflare R2** | Stores `mail/<address>/<id>.eml` and the `latest/<address>` marker. Serves list, head, get, and delete operations. Holds the lifecycle rule. | 10 GB-month, 1M Class A and 10M Class B operations/month, free egress. |
| **Cloudflare DNS** | Hosts the zone, MX records, and the domain used by Email Routing. | Included with the zone. |
| **Wrangler** | Local dev, deploy, secret upload, and `r2 bucket lifecycle set`. | CLI. |
| **Email Service activity log** | Optional observability: routing status, from, to, subject, message id, SPF/DKIM/DMARC. | Metadata only, about 31 days. It is not a mailbox and does not contain the message body. |

**Not used, on purpose:** D1, KV, Durable Objects, Queues, Pages, Access, and Email Sending. The only state lives in R2.

## Architecture

```text
                         Internet mail
                              |
                              v
             Cloudflare Email Routing  (MX, catch-all)
                    |                       |
                    |                       +--> optional forward --> personal inbox (archive)
                    v
             Cloudflare Worker  email()
                    |
                    v
             Cloudflare R2
             mail/<address>/<id>.eml  +  latest/<address>

   Agent (MCP) -- HTTPS + Bearer --> Cloudflare Worker  fetch()
                                          |
                                          +--> R2 head / list / get / delete
```

## Flow

1. Pick an address that matches the allowlist, for example `test@mail.example.com` or `bbounty@programs.example.net`.
2. Cloudflare Email Routing delivers it to the Worker.
3. The Worker stores the raw MIME in R2 and updates `latest/<address>`.
4. The agent polls the REST API or MCP with the shared key.
5. If a message exists, the agent reads the raw message and parses it locally.
6. After a successful read, `ack_message` deletes the R2 copy. Your forwarded archive is unaffected.
7. The R2 lifecycle rule deletes anything the agent did not ack after `bmail_lifecycle_days`.

There is no registration step. The Worker accepts addresses that match its recipient allowlist.

## Recipient allowlist

`bmail_mail_domains` accepts two forms:

- `mail.example.com` - any local part on that domain.
- `bbounty@programs.example.net` - exactly that address.

For example:

```bash
bmail_mail_domains=mail.example.com,bbounty@programs.example.net
```

This accepts `test@mail.example.com` and `bbounty@programs.example.net`, but drops `other@programs.example.net`.

Email Routing is the first gate. It decides which mail reaches the Worker:

- A **catch-all** rule sends every local part to the Worker. Pair it with a domain entry.
- A **literal** rule sends one address to the Worker. Pair it with an exact address entry.

A common setup is one catch-all domain plus one fixed program address:

```text
mail.example.com          catch-all -> bmail Worker
bbounty@programs.example.net   literal -> bmail Worker
programs.example.net      catch-all -> personal inbox (archive)
```

The literal rule wins over the catch-all, so only `bbounty@programs.example.net` reaches the Worker on that domain.

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
pnpm deploy:worker
```

`pnpm deploy:worker` deploys the Worker, uploads `bmail_api_key` as a secret, and sets the R2 lifecycle rules.

Then in the Cloudflare dashboard:

1. Enable Email Routing on each domain used in `bmail_mail_domains`.
2. For a catch-all domain, set the catch-all action to the `bmail` Worker.
3. For a single address, create one literal routing rule to the `bmail` Worker.
4. If you want a personal archive, do not give the same rule two actions. Either use a literal rule for the agent address and leave the catch-all forwarding to your inbox, or run bmail on a separate subdomain with its own catch-all.

## Deploy with the Cloudflare dashboard

Use this path if you want to create and configure the Worker in the Cloudflare web UI. The in-browser editor path uses the bundled `worker/dist/index.js`, which you build locally with `pnpm build`. The Git-based flow builds from source in Cloudflare.

The in-browser editor does not read `wrangler.jsonc` and does not run `scripts/deploy.mjs`, so bindings, variables, and the R2 lifecycle rules are set by hand. The Git flow uses `wrangler.jsonc` for the Worker name, entry point, and R2 binding; variables and lifecycle rules are still manual.

| Path | Config source | Lifecycle rule |
|---|---|---|
| CLI (`pnpm deploy:worker`) | `.env` and `wrangler.jsonc` | Applied by the script. |
| Dashboard editor | UI bindings and variables | Added manually in R2 settings. |
| Dashboard Git | `wrangler.jsonc` plus UI variables | Added manually in R2 settings. |

### 1. Create the R2 bucket

1. Cloudflare dashboard > **R2 object storage** > **Create bucket**.
2. Name it, for example `bmail-mail`, and create it.

### 2. Create the Worker

1. **Workers & Pages** > **Create application**.
2. Choose the in-browser Worker or Hello World option if your account shows it.
3. Name it `bmail` and deploy.
4. Open the Worker and select **Edit code** (some accounts label this **Quick Edit**).

If your account only shows the Git-based **Create application** flow, use that instead:

1. Push this repository to GitHub or GitLab.
2. Connect it in **Workers & Pages** > **Create application**.
3. **Root directory:** `worker`. Do not use the repository root. bmail is a pnpm workspace, and Cloudflare needs a specific project.
4. Build command: leave it empty if the UI allows it, or use `npx wrangler deploy --dry-run`.
5. Deploy command: `npx wrangler deploy`.
6. Create the R2 bucket with the name in `worker/wrangler.jsonc` (`bmail-mail`), or edit that file before pushing.
7. Add `bmail_mail_domains` and `bmail_api_key` in the dashboard as described in step 4 below.

If Cloudflare reports **"The Cloudflare application detection logic has been run in the root of a workspace instead of targeting a specific project"**, the project root is still the repository root. Open the project's build settings, set **Root directory** to `worker`, and redeploy.

### 3. Paste the Worker code

Skip this step if you used the Git-based flow; it deploys from source.

The dashboard editor is safest with JavaScript, so use the bundled Worker instead of the TypeScript source.

```bash
pnpm install
pnpm build
```

1. Open `worker/dist/index.js`.
2. Replace the editor contents with that file.
3. Remove the final `//# sourceMappingURL=index.js.map` line if it is present.
4. Select **Deploy**.

If your editor accepts TypeScript, `worker/src/index.ts` also works.

### 4. Add the binding and variables

In the Worker settings:

- **Bindings** > **Add binding** > **R2 bucket**:
  - Variable name: `MAIL`
  - Bucket: the bucket you created
  - Skip this if you used the Git flow; `worker/wrangler.jsonc` already declares the binding.
- **Variables and Secrets**:
  - `bmail_mail_domains` as text: a comma-separated allowlist. A domain accepts any local part; a full address is exact. For example `mail.example.com,bbounty@programs.example.net`
  - `bmail_api_key` as a secret: at least 16 random characters

Save and deploy. The API returns `503` until the binding and key exist.

### 5. Set the compatibility date

Go to **Settings** > **Runtime** > **Compatibility date** and use `2026-03-12` or a later date supported by your account. No compatibility flags are required.

### 6. Add the R2 lifecycle rules

Go to **R2 object storage** > your bucket > **Settings** > **Object lifecycle rules**:

- Rule `bmail-expire-mail`, prefix `mail/`, delete after 7 days.
- Rule `bmail-expire-latest`, prefix `latest/`, delete after 7 days.

Use a longer window if you want more recovery time. New rules can take up to 24 hours to apply. The Worker does not need `bmail_lifecycle_days` in the dashboard path; that variable is only used by `pnpm deploy:worker`.

### 7. Route mail to the Worker

Go to **Compute** > **Email Service** > **Email Routing**, or the zone's **Email** > **Email Routing** page:

1. Enable Email Routing for the domain. For a subdomain, add it under **Settings** > **Subdomains** first.
2. For a catch-all domain: **Routing rules** > **Catch-all** > action **Send to Worker** > `bmail`.
3. For one address: **Create routing rule**, enter the local part, action **Send to Worker** > `bmail`.
4. If you need a personal archive, remember that a catch-all has only one action. Use a literal rule for the agent address to the Worker and leave the catch-all forwarding to your inbox, or run bmail on a separate subdomain.

### 8. Verify

```bash
curl https://<worker-url>/health
```

Then send a message to `test@mail.example.com` and list it:

```bash
curl 'https://<worker-url>/v1/inbox/test%40mail.example.com' \
  -H "authorization: Bearer <bmail_api_key>"
```

Use `https://<worker-url>` as `bmail_api_url` in the MCP config. The following values are only used by the CLI deploy script, so you can leave them out of the dashboard path: `bmail_lifecycle_days`, `cloudflare_worker_name`, `cloudflare_r2_bucket_name`, `cloudflare_account_id`.

## Configuration

`.env` is the source of truth. `pnpm dev` writes `worker/.dev.vars`; `pnpm deploy:worker` maps the values to Worker vars and secrets.

| Key | Used by | Purpose |
|---|---|---|
| `bmail_mail_domains` | Worker | Comma-separated allowlist. Domain entries accept any local part; full-address entries are exact. |
| `bmail_api_key` | Worker and MCP | Shared bearer key, 16+ characters. |
| `bmail_lifecycle_days` | CLI deploy | R2 expiry for `mail/` and `latest/`, default 7. The dashboard path sets these rules in the UI. |
| `cloudflare_worker_name` | Deploy | Worker name. |
| `cloudflare_r2_bucket_name` | Deploy | R2 bucket name. |
| `cloudflare_account_id` | Deploy | Optional account id. |
| `bmail_api_url` | MCP | Worker base URL. |
| `bmail_address` | MCP | Optional default address for tools. |

## Local development

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

Read it:

```bash
curl 'http://127.0.0.1:8787/v1/inbox/test%40mail.example.com' \
  -H "authorization: Bearer $bmail_api_key"
```

## REST API

All `/v1` routes require `Authorization: Bearer <bmail_api_key>`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness, no auth. |
| `GET /v1/inbox/:address?after=<cursor>&limit=<n>` | List message metadata, paged with `next_cursor`. |
| `GET /v1/inbox/:address/:id` | Raw RFC 5322 message. |
| `DELETE /v1/inbox/:address/:id` | Acknowledge and delete the stored copy. |

The address must be URL encoded. `after` is the `next_cursor` from the previous response. `limit` is 1 to 200, default 50. Delete is idempotent and returns `204`.

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
- `ack_message` - delete the R2 copy after a successful read. The archive is unaffected.
- `wait_for_message` - poll until a new message arrives, starting from now when `after` is omitted.

Every tool accepts an `address` argument; it defaults to `bmail_address`. Message content is returned with `untrusted: true`, because the agent is reading attacker-controlled mail.

## Ack and lifecycle

- `ack_message` removes `mail/<address>/<id>.eml` immediately.
- The `latest/<address>` marker may still point at the deleted object. New mail updates it, so this is harmless.
- `pnpm deploy:worker` sets two R2 lifecycle rules, `mail/` and `latest/`, each expiring after `bmail_lifecycle_days` (default 7).
- The lifecycle command replaces the bucket's lifecycle configuration, so use a dedicated bucket or merge your own rules into the generated file.

## Free plan budget

| Operation | R2 class | When |
|---|---|---|
| Store a message | Class A | 2 per received email: the `.eml` plus the latest marker. |
| Read a message | Class B | 1 per `get_message`. |
| Poll with a cursor and no new mail | Class B | 1 `head` per poll. |
| Poll that finds new mail | Class B + A | 1 `head` plus 1 `list`. |
| List without a cursor | Class A | First call only. |
| Acknowledge a message | Free | 1 `DeleteObject` per ack. |

A cursor poll does not call `ListObjects` unless the latest marker says something newer exists. That keeps polling cheap.

The default poll interval is 5 seconds, with a 2-second minimum. At 5 seconds, one hour of waiting is 720 requests, or about 21,600 requests per month if you wait one hour per day. Workers Free includes 100,000 requests/day. R2 Free includes 1M Class A operations, 10M Class B operations, and 10 GB-month of storage.

## Project layout

```text
worker/     Cloudflare Worker: email() ingest and REST API
client/     MCP server: REST client plus local MIME parsing
scripts/    dev and deploy helpers
assets/     README banner
llm-res/    agent rules, phase state, memory, threat model
```

## Security notes

- One shared key grants access to every configured address. Rotate it by changing `bmail_api_key`.
- Keys are compared in constant time and the key is never logged.
- Addresses are validated before being used in an R2 key, so a local part cannot escape its prefix.
- Only the first `Authentication-Results` header with `mx.cloudflare.net` as authserv-id is trusted for DMARC.
- R2 is private. Only the Worker binding reads it.
- MIME parsing happens in the MCP client, not in the Worker.
- The forwarded personal archive is the source of truth. Ack only removes the R2 copy.

## Limits

- Inbound message size is capped by Cloudflare at 25 MiB.
- `limit` is capped at 200 per list call.
- There is no rate limiting. The Workers daily request cap is the backstop.
- There is no UI, no alias manager, no outbound mail, and no D1.

## License

Not set yet.

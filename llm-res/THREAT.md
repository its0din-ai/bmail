# THREAT.md

Threat model for this project (per `AGENTIC.md` section 6). Created during initial planning, kept in sync with the code. Update whenever a micro-task introduces, mitigates, or removes a threat.

**Role:** threat model. **Read when:** at session start and before phase planning. **Update when:** a threat is introduced, mitigated, or removed.

Scope: one Cloudflare Worker, one R2 bucket, one shared API key, one stdio MCP client. No database, UI, retention job, or outbound mail.

| threat_id | description | surface | level | severity | user_requested | mitigation |
|---|---|---|---|---|---|---|
| t_01_prompt_injection_email | Attacker-controlled mail tries to redirect the agent, exfiltrate the key, or trigger actions. | inbound body -> agent context | certain | high | no | Every parsed message carries `untrusted: true` and a warning; no action tools; never treat body text as instructions; no automatic link following. |
| t_02_api_key_theft | A leaked shared key grants read access to every address in the R2 bucket. | agent -> HTTPS API | firm | high | no | Key only in `.env` and Worker secrets; bearer header only, never a query string; constant-time compare; never log the key or Authorization header. |
| t_03_storage_flood | Anyone who can send mail to a configured domain can grow R2 quickly before cleanup runs. | Email Routing -> `email()` | certain | med | no | Domain allowlist; 25 MiB platform cap; ack deletes after read; R2 lifecycle expires `mail/` and `latest/` after `bmail_lifecycle_days` (default 7); monitor R2 usage. |
| t_04_sender_spoofing | A forged From header claims to be a target or program. | inbound headers | certain | high | no | Read only the first `Authentication-Results` header and require `mx.cloudflare.net` as its authserv-id; store its dmarc result; treat the message as untrusted regardless; never auto-act on `dmarc=fail`. |
| t_05_stale_mail | OTPs and verification links can stay in R2 until the agent acks them or the lifecycle rule expires them. | R2 objects | likely | med | no | Private bucket; `ack_message` deletes after a successful read; R2 lifecycle expires both prefixes after `bmail_lifecycle_days`; never expose R2 publicly. |
| t_06_ssrf_via_links | A verification link points at an internal or metadata host and the agent follows it. | links returned by `get_message` | likely | high | no | Mark links as untrusted candidates; agent-side host allowlist derived from the target it registered on; the Worker never fetches links. |
| t_07_attachment_malware | Attachments carry malware or exploits that the agent or operator opens. | raw message -> agent | possible | high | no | Only metadata is returned by the parser; raw access is explicit; never auto-open attachments. |
| t_08_public_config_leak | A public repository leaks the operator's domains, addresses, account IDs, or key, or ships unsafe defaults. | docs, examples, `.env.example`, git history | likely | med | no | No deployment literals in source or docs; `.env` gitignored; placeholders use reserved names; empty config fails closed. |
| t_09_error_detail_leak | Error responses reveal R2 keys, configuration, or stack traces. | API error paths | possible | low | no | Generic JSON errors; log only a short message; no keys or key material in logs. |
| t_10_free_tier_exhaustion | Aggressive polling or mail bursts exhaust the 100,000 requests/day or R2 operation quotas. | Workers and R2 Free quotas | likely | med | no | Cursor polling checks a latest marker with `head` (Class B) and only calls `ListObjects` (Class A) when new mail exists; MCP interval default is 5 seconds with a 2-second minimum; `limit` capped at 200; monitor the Cloudflare dashboard; documented upgrade path. |
| t_11_shared_key_scope | One key has no per-address or per-agent scope, so a single leak exposes all inboxes. | shared auth model | certain | med | no | Accepted simplification; rotate by changing `bmail_api_key`; keep the key off shared hosts; document the blast radius. |
| t_12_premature_ack | The agent acknowledges a message it did not actually read, deleting the only R2 copy. | `DELETE /v1/inbox/:address/:id` | possible | low | no | Ack is explicit and separate from `get_message`; the forwarded personal archive remains the source of truth; lifecycle is a fallback for unacked mail; the agent should ack only after a successful parse. |

- `threat_id`: short snake_case id, e.g. `t_01_sql_injection`.
- `level`: how certain the threat applies - `certain`, `firm`, `likely`, `possible`, `speculative`.
- `severity`: impact if exploited - `info`, `low`, `med`, `high`, `crit`.
- `user_requested`: `yes`/`no`. `yes` = user explicitly wants the app vulnerable to this threat (e.g. security challenge/CTF) - keep it open, never "fix" it; mark the vulnerable surface in code with `# user_requested_vuln: <threat_id>`.
- `mitigation`: the control addressing the threat, or explicit "intentionally left open".

## Deferred surfaces

- Per-address or per-agent keys: revisit `t_11_shared_key_scope`.
- Admin UI: add session, CSRF, and stored-XSS threats when the Neo Brutalism UI is built.
- Outbound mail: add an open-relay threat and an approval gate.

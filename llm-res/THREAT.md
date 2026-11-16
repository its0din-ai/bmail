# THREAT.md

Threat model for this project (per `AGENTIC.md` section 6). Created during initial planning, kept in sync with the code. Update whenever a micro-task introduces, mitigates, or removes a threat.

**Role:** threat model. **Read when:** at session start and before phase planning. **Update when:** a threat is introduced, mitigated, or removed.

Scope: v1 is inbound only. Outbound mail, remote MCP, OAuth, and the admin UI are deferred, so their threats are listed as future surfaces rather than current ones.

| threat_id | description | surface | level | severity | user_requested | mitigation |
|---|---|---|---|---|---|---|
| t_01_prompt_injection_email | Attacker-controlled message body tries to redirect the agent, exfiltrate tokens, or trigger actions. | inbound body -> agent context | certain | high | no | Envelope every message as untrusted data; parse in the client, not the Worker; structured tool output; no action tools in v1; no automatic link following; never treat body text as instructions. |
| t_02_token_theft | A leaked bearer token exposes every alias and OTP the token can reach. | agent -> HTTP API auth | firm | high | no | SHA-256 hash with a server-side pepper at rest; per-domain scope; optional expiry; rotation; constant-time compare; never log the token or Authorization header. |
| t_03_alias_flood | Catch-all accepts unbounded spam or junk, growing D1/R2 and cost. | Email Routing -> `email()` | certain | med | no | Alias lookup before reading the body; unknown local parts dropped without storage; platform 25 MiB cap; 90-day R2 lifecycle; monitor the Cloudflare usage dashboard. |
| t_04_sender_spoofing | Forged From header claims to be a bug bounty program or target service. | inbound headers | certain | high | no | Trust only the first `Authentication-Results` from `mx.cloudflare.net`; store the dmarc result; never auto-act on `dmarc=fail`. |
| t_05_alias_enumeration | Probing addresses reveals which aliases exist and are active. | inbound recipient lookup | possible | low | no | Accept-and-drop unknown and expired aliases with identical behavior; fixed domains accept only `bmail_fixed_addresses`; no bounce detail. |
| t_06_ssrf_via_links | A verification or reset link points at an internal or metadata host and the agent follows it. | links returned by the read API | likely | high | no | Mark links untrusted; agent-side host allowlist derived from the alias target; Worker never fetches links. |
| t_07_email_content_xss | HTML body renders script, tracking pixels, or remote content in a future admin UI. | future admin UI | possible | med | no | Text-first API; sanitize HTML; CSP; block remote content by default; Neo Brutalism does not change this. |
| t_08_confidential_retention | OTPs and bug bounty content are kept past their need. | D1 and R2 | likely | med | no | 90-day TTL for aliases, messages, and raw MIME (user-confirmed); private buckets; no body logging. |
| t_09_attachment_malware | Attachments carry malware or exploits that the agent or owner opens. | R2 raw message -> agent | possible | high | no | Never auto-open; fetch through the raw endpoint only; correct `Content-Type` on download; platform size cap; optional scanning later. |
| t_10_d1_injection | A query is built by string concatenation from message or alias fields. | Worker -> D1 | speculative | high | no | Parameterized statements only; validate and normalize recipients before any query. |
| t_11_mirror_leak | The forwarded copy exposes OTPs to a mailbox with weaker security than the gateway. | `forward()` to owner inbox | possible | med | no | Owner-controlled destination; `X-BMail-*` headers for tracing; mirror can be disabled by unsetting `bmail_forward_to`; document the tradeoff. |
| t_12_dependency_supply_chain | A compromised parser or HTTP dependency runs inside the Worker. | build and runtime dependencies | possible | high | no | Audit dependencies; pin versions and lockfile; keep the dependency set minimal; no postinstall scripts. |
| t_13_error_detail_leak | SMTP rejection or API errors reveal internal paths, storage keys, or stack traces. | error paths | possible | low | no | Generic rejection reasons; log correlation IDs only; never echo raw errors or storage keys to the sender. |
| t_14_remote_api_exposure | The read API is public and carries OTPs and message bodies; a replayed or leaked token exposes them to anyone on the internet. | remote agent -> HTTPS API | certain | high | no | HTTPS only; bearer token in the `Authorization` header, never in a query string or URL; hashed at rest; daily request cap; optional Cloudflare Access or IP allowlist; token lifetime per the confirmed security profile. |
| t_15_free_tier_exhaustion | A burst of mail or polling exhausts the 100,000 requests/day or 10 ms CPU budget, producing 1027 errors and dropped mail. | Workers Free quotas | likely | med | no | Zero-parse ingest; header-only metadata; bounded client polling with backoff; fail closed on the API route; monitor the Cloudflare usage dashboard; documented Paid upgrade path. |
| t_16_cross_domain_confusion | An agent scoped to one mail domain reads or creates aliases on another, or a message is attributed to the wrong domain. | multi-domain lookup and token scope | likely | high | no | Validate `mail_domain` against `bmail_mail_domains` and its mode on every request; scope tokens per domain; key aliases by `(mail_domain, local_part)`; store `mail_domain` on every message; never infer a domain when none is configured. |
| t_17_public_config_leak | A public repository leaks the operator's domains, addresses, account IDs, or tokens, or ships unsafe defaults. | docs, examples, `.env.example`, git history | likely | med | no | No domain or account literals in source, docs, or tests; `.env` gitignored; placeholders use reserved names; fail closed on empty config; secret scan before publish; review `llm-res` history before release. |
| t_18_mirror_loop | The mirror destination also routes back into bmail, so every message re-enters the Worker and loops until quota is exhausted. | `forward()` to `bmail_forward_to` | likely | high | no | Reject a `bmail_forward_to` on any configured mail domain at startup; drop messages carrying `X-BMail-*` headers; cap forwards per message. |

- `threat_id`: short snake_case id, e.g. `t_01_sql_injection`.
- `level`: how certain the threat applies - `certain`, `firm`, `likely`, `possible`, `speculative`.
- `severity`: impact if exploited - `info`, `low`, `med`, `high`, `crit`.
- `user_requested`: `yes`/`no`. `yes` = user explicitly wants the app vulnerable to this threat (e.g. security challenge/CTF) - keep it open, never "fix" it; mark the vulnerable surface in code with `# user_requested_vuln: <threat_id>`.
- `mitigation`: the control addressing the threat, or explicit "intentionally left open".

## Deferred surfaces
- Outbound mail and agent-authored replies: add `t_14_open_relay` and an outbound approval gate when Email Sending is introduced.
- Worker-hosted MCP endpoint: add token transport and OAuth threats when the transport leaves the agent host or needs URL-only access.
- Admin UI: add session, CSRF, and stored-XSS threats when the Neo Brutalism UI phase starts.

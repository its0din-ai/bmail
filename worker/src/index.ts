interface Env {
  MAIL: R2Bucket;
  bmail_mail_domains?: string;
  bmail_api_key?: string;
}

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
const MESSAGE_ID_RE = /^\d{13}-[a-z0-9]{1,32}$/;

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function fail(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export interface RecipientConfig {
  domains: Set<string>;
  addresses: Set<string>;
}

export function parseRecipients(raw: string | undefined): RecipientConfig {
  const domains = new Set<string>();
  const addresses = new Set<string>();
  for (const item of (raw ?? "").split(",")) {
    const entry = item.trim().toLowerCase();
    if (!entry) continue;
    if (entry.includes("*")) {
      throw new ConfigError(
        "wildcards are not supported; use a bare domain to allow every local part",
      );
    }
    if (entry.includes("@")) {
      const parts = splitAddress(entry);
      if (!parts) {
        throw new ConfigError(`invalid recipient address: ${entry}`);
      }
      addresses.add(`${parts.local_part}@${parts.mail_domain}`);
    } else {
      if (!DOMAIN_RE.test(entry)) {
        throw new ConfigError(`invalid mail domain: ${entry}`);
      }
      domains.add(entry);
    }
  }
  if (domains.size === 0 && addresses.size === 0) {
    throw new ConfigError("bmail_mail_domains is empty");
  }
  return { domains, addresses };
}

export function recipientAllowed(
  config: RecipientConfig,
  address: string,
): boolean {
  const parts = splitAddress(address);
  if (!parts) return false;
  return (
    config.addresses.has(`${parts.local_part}@${parts.mail_domain}`) ||
    config.domains.has(parts.mail_domain)
  );
}

export function splitAddress(
  value: string,
): { local_part: string; mail_domain: string } | null {
  const address = value.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  const local_part = address.slice(0, at);
  const mail_domain = address.slice(at + 1);
  if (!LOCAL_RE.test(local_part) || !DOMAIN_RE.test(mail_domain)) return null;
  return { local_part, mail_domain };
}

export function readDmarc(headers: Headers): string {
  const value = headers.get("authentication-results");
  if (!value) return "none";

  // Email Routing prepends its own header. Only the first one is trustworthy.
  const first = value.trim();
  if (!/^mx\.cloudflare\.net(?:\s*;|\s*$)/i.test(first)) return "none";

  const match = /\bdmarc\s*=\s*([a-z]+)/i.exec(first);
  return match?.[1]?.toLowerCase() ?? "none";
}

function messagePrefix(address: string): string {
  return `mail/${address}/`;
}

function messageKey(address: string, id: string): string {
  return `${messagePrefix(address)}${id}.eml`;
}

function latestKey(address: string): string {
  return `latest/${address}`;
}

function newMessageId(): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${Date.now()}-${random}`;
}

function asciiPreview(value: string, maxLength: number): string {
  return value.replace(/[^\x20-\x7e]/g, "?").slice(0, maxLength);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const separator = header.indexOf(" ");
  if (separator <= 0) return null;
  const scheme = header.slice(0, separator).toLowerCase();
  const token = header.slice(separator + 1).trim();
  return scheme === "bearer" && token ? token : null;
}

function apiKeyFromEnv(env: Env): string | null {
  const key = (env.bmail_api_key ?? "").trim();
  return key.length >= 16 ? key : null;
}

function unauthorized(): Response {
  const response = fail("unauthorized", "Missing or invalid API key", 401);
  response.headers.set("www-authenticate", 'Bearer realm="bmail"');
  return response;
}

function readLimit(url: URL): number | null {
  const raw = url.searchParams.get("limit");
  if (raw === null) return 50;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) return null;
  return value;
}

async function handleList(
  requestUrl: URL,
  env: Env,
  address: string,
): Promise<Response> {
  const limit = readLimit(requestUrl);
  if (limit === null) {
    return fail("invalid_limit", "limit must be an integer from 1 to 200", 400);
  }

  const prefix = messagePrefix(address);
  const after = requestUrl.searchParams.get("after") || undefined;
  if (after && !after.startsWith(prefix)) {
    return fail("invalid_cursor", "after does not belong to this address", 400);
  }

  // A cursor poll is one HeadObject (Class B). ListObjects is Class A, so only
  // list when the marker says something newer exists. A missing marker means
  // this address has received nothing yet.
  const latest = await env.MAIL.head(latestKey(address));
  const latestMessageKey = latest?.customMetadata?.key ?? null;
  if (after && (!latestMessageKey || latestMessageKey <= after)) {
    return json({ address, messages: [], next_cursor: after });
  }

  const listed = await env.MAIL.list({
    prefix,
    limit,
    startAfter: after,
    include: ["customMetadata"],
  });

  const messages = listed.objects.slice(0, limit).map((object) => {
    const metadata = object.customMetadata ?? {};
    return {
      id: object.key.slice(prefix.length, -4),
      key: object.key,
      from: metadata.from ?? "",
      subject: metadata.subject ?? "",
      received_at: metadata.received_at ?? object.uploaded.toISOString(),
      size: Number(metadata.size ?? object.size),
      dmarc: metadata.dmarc ?? "none",
    };
  });

  return json({
    address,
    messages,
    next_cursor:
      messages.at(-1)?.key ??
      listed.objects.at(-1)?.key ??
      latestMessageKey ??
      after ??
      null,
  });
}

async function handleRaw(
  env: Env,
  address: string,
  id: string,
): Promise<Response> {
  if (!MESSAGE_ID_RE.test(id)) {
    return fail("not_found", "Message not found", 404);
  }
  const object = await env.MAIL.get(messageKey(address, id));
  if (!object) {
    return fail("not_found", "Message not found", 404);
  }

  const headers = new Headers({
    "content-type": "message/rfc822",
    "content-disposition": `attachment; filename="${id}.eml"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [key, value] of Object.entries(object.customMetadata ?? {})) {
    headers.set(`x-bmail-${key.replace(/_/g, "-")}`, value);
  }

  return new Response(object.body, { headers });
}

async function handleAck(
  env: Env,
  address: string,
  id: string,
): Promise<Response> {
  if (!MESSAGE_ID_RE.test(id)) {
    return fail("not_found", "Message not found", 404);
  }
  await env.MAIL.delete(messageKey(address, id));
  return new Response(null, { status: 204 });
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    const mailDomainsPresent = Boolean((env.bmail_mail_domains ?? "").trim());
    let mailDomainsValid = false;
    try {
      parseRecipients(env.bmail_mail_domains);
      mailDomainsValid = true;
    } catch {
      mailDomainsValid = false;
    }
    const apiKeyPresent = Boolean((env.bmail_api_key ?? "").trim());
    const apiKeyValid = Boolean(apiKeyFromEnv(env));
    const r2Ok = typeof env.MAIL?.put === "function";
    const ready = mailDomainsValid && apiKeyValid && r2Ok;

    if (!ready) {
      console.log(
        `bmail: not ready ${JSON.stringify({
          bmail_mail_domains_present: mailDomainsPresent,
          bmail_mail_domains_valid: mailDomainsValid,
          bmail_api_key_present: apiKeyPresent,
          bmail_api_key_valid: apiKeyValid,
          r2_binding: r2Ok,
        })}`,
      );
    }

    return json({
      ok: true,
      ready,
      version: "0.1.0",
      checks: {
        bmail_mail_domains: {
          present: mailDomainsPresent,
          valid: mailDomainsValid,
        },
        bmail_api_key: { present: apiKeyPresent, valid: apiKeyValid },
        r2_binding: r2Ok,
      },
    });
  }

  let recipients: RecipientConfig;
  try {
    recipients = parseRecipients(env.bmail_mail_domains);
  } catch (error) {
    const message =
      error instanceof ConfigError ? error.message : "invalid configuration";
    console.error(`bmail: ${message}`);
    return fail(
      "config_invalid",
      "bmail_mail_domains is missing or invalid",
      503,
    );
  }

  const apiKey = apiKeyFromEnv(env);
  if (!apiKey) {
    return fail("config_invalid", "bmail_api_key is not configured", 503);
  }
  const token = bearerToken(request);
  if (!token || !timingSafeEqual(token, apiKey)) {
    return unauthorized();
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "v1" ||
    segments[1] !== "inbox" ||
    (segments.length !== 3 && segments.length !== 4)
  ) {
    return fail("not_found", "Not found", 404);
  }

  let address: string;
  try {
    address = decodeURIComponent(segments[2] ?? "").toLowerCase();
  } catch {
    return fail("invalid_address", "Invalid address", 400);
  }

  if (!recipientAllowed(recipients, address)) {
    return fail("invalid_address", "Address is not allowed", 403);
  }

  if (segments.length === 3 && request.method === "GET") {
    return handleList(url, env, address);
  }
  if (segments.length === 4 && request.method === "GET") {
    return handleRaw(env, address, segments[3] ?? "");
  }
  if (segments.length === 4 && request.method === "DELETE") {
    return handleAck(env, address, segments[3] ?? "");
  }
  return fail("not_found", "Not found", 404);
}

async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  let recipients: RecipientConfig;
  try {
    recipients = parseRecipients(env.bmail_mail_domains);
  } catch (error) {
    const detail =
      error instanceof ConfigError ? error.message : "invalid configuration";
    console.error(`bmail: ${detail}, dropping message`);
    return;
  }

  const address = (message.to ?? "").trim().toLowerCase();
  if (!recipientAllowed(recipients, address)) {
    return;
  }

  if (message.rawSize > MAX_MESSAGE_BYTES) {
    message.setReject("Message too large");
    return;
  }

  console.log(`bmail: received ${address} size=${message.rawSize}`);

  if (typeof env.MAIL?.put !== "function") {
    console.error("bmail: MAIL is not an R2 binding");
    throw new Error("MAIL R2 binding is missing or invalid");
  }

  const id = newMessageId();
  const receivedAt = new Date().toISOString();
  const key = messageKey(address, id);
  const from = asciiPreview((message.from ?? "").trim().toLowerCase(), 320);

  try {
    await env.MAIL.put(key, message.raw, {
      customMetadata: {
        from,
        subject: asciiPreview(message.headers.get("subject") ?? "", 200),
        received_at: receivedAt,
        size: String(message.rawSize),
        dmarc: readDmarc(message.headers),
      },
    });
  } catch (error) {
    console.error(
      `bmail: R2 message write failed for ${address} ${id}: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`,
    );
    throw error;
  }

  try {
    await env.MAIL.put(latestKey(address), "", {
      customMetadata: { id, key, received_at: receivedAt },
    });
  } catch (error) {
    // Keep the marker and the message consistent. A missing marker would make
    // a cursor poll skip the message.
    await env.MAIL.delete(key);
    console.error(
      `bmail: R2 marker write failed for ${address} ${id}: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`,
    );
    throw error;
  }

  console.log(`bmail: stored ${address} id=${id}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch (error) {
      console.error(
        `bmail: request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return fail("internal_error", "Internal error", 500);
    }
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },
} satisfies ExportedHandler<Env>;

import {
  ConfigError,
  isValidLocalPart,
  parseConfig,
  type Config,
  type MailDomainConfig,
} from "./config";
import {
  hashTokenSecret,
  tokenAllowsDomain,
  verifyAdminToken,
  verifyAgentToken,
  type VerifiedToken,
} from "./auth";
import {
  deleteAlias,
  deleteToken,
  getAliasById,
  getMessage,
  getTokenRow,
  insertAlias,
  insertToken,
  listAliases,
  listMessages,
  listTokens,
  type AliasRow,
  type MessageRow,
} from "./db";
import { newId, nowIso, randomBase36, randomHex } from "./id";
import type { Env } from "./types";

const VERSION = "0.1.0";

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

function unauthorized(): Response {
  const response = fail("unauthorized", "Missing or invalid token", 401);
  response.headers.set("www-authenticate", 'Bearer realm="bmail"');
  return response;
}

function aliasJson(alias: AliasRow) {
  return {
    id: alias.id,
    mail_domain: alias.mail_domain,
    local_part: alias.local_part,
    address: `${alias.local_part}@${alias.mail_domain}`,
    label: alias.label,
    created_at: alias.created_at,
  };
}

function messageJson(message: MessageRow) {
  return {
    id: message.id,
    alias_id: message.alias_id,
    mail_domain: message.mail_domain,
    from_addr: message.from_addr,
    to_addr: message.to_addr,
    subject: message.subject,
    message_id: message.message_id,
    dmarc: message.dmarc,
    size: message.size,
    received_at: message.received_at,
    raw_url: `/v1/messages/${message.id}/raw`,
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "alias";
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readLimit(url: URL, fallback: number, max: number): number | null {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) return null;
  return value;
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function domainScopeFor(
  config: Config,
  token: VerifiedToken,
  requested: string | undefined,
): { domain: MailDomainConfig } | { error: Response } {
  if (requested) {
    const domainConfig = config.domain_map.get(requested);
    if (!domainConfig || !tokenAllowsDomain(token, requested)) {
      return { error: fail("domain_not_allowed", "Mail domain is not allowed", 403) };
    }
    return { domain: domainConfig };
  }
  if (config.default_mail_domain && tokenAllowsDomain(token, config.default_mail_domain)) {
    const domainConfig = config.domain_map.get(config.default_mail_domain);
    if (domainConfig) return { domain: domainConfig };
  }
  return {
    error: fail(
      "mail_domain_required",
      "mail_domain is required; configure bmail_default_mail_domain or pass one",
      400,
    ),
  };
}

async function handleConfig(config: Config, token: VerifiedToken): Promise<Response> {
  const domains = config.domains
    .filter((domain) => tokenAllowsDomain(token, domain.domain))
    .map((domain) => ({
      domain: domain.domain,
      mode: domain.mode,
      can_create_aliases: domain.mode === "catch_all",
    }));
  const defaultDomain =
    config.default_mail_domain && tokenAllowsDomain(token, config.default_mail_domain)
      ? config.default_mail_domain
      : null;
  return json({
    mail_domains: domains,
    default_mail_domain: defaultDomain,
    retention_days: config.retention_days,
  });
}

async function handleListAliases(
  url: URL,
  env: Env,
  config: Config,
  token: VerifiedToken,
): Promise<Response> {
  const requested = url.searchParams.get("mail_domain")?.trim().toLowerCase();
  if (requested) {
    if (!config.domain_map.has(requested) || !tokenAllowsDomain(token, requested)) {
      return fail("domain_not_allowed", "Mail domain is not allowed", 403);
    }
  }
  const limit = readLimit(url, 200, 500);
  if (limit === null) {
    return fail("invalid_limit", "limit must be an integer from 1 to 500", 400);
  }
  const aliases = await listAliases(
    env.DB,
    token.allowed_domains,
    requested,
    limit,
  );
  return json({ aliases: aliases.map(aliasJson) });
}

async function handleCreateAlias(
  request: Request,
  env: Env,
  config: Config,
  token: VerifiedToken,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) {
    return fail("invalid_body", "Body must be a JSON object", 400);
  }

  const requestedDomain =
    typeof body.mail_domain === "string"
      ? body.mail_domain.trim().toLowerCase()
      : undefined;
  const selected = domainScopeFor(config, token, requestedDomain);
  if ("error" in selected) return selected.error;
  const domain = selected.domain;
  if (domain.mode !== "catch_all") {
    return fail(
      "fixed_domain",
      "This mail domain is fixed; aliases cannot be created",
      409,
    );
  }

  const labelRaw = typeof body.label === "string" ? body.label : "";
  const label = labelRaw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);

  let localPart: string;
  if (body.local_part !== undefined) {
    const candidate =
      typeof body.local_part === "string"
        ? body.local_part.trim().toLowerCase()
        : "";
    if (!isValidLocalPart(candidate)) {
      return fail("invalid_local_part", "local_part is not valid", 400);
    }
    localPart = candidate;
  } else {
    localPart = `${slugify(label)}-${randomBase36(6)}`;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const alias: AliasRow = {
      id: newId(),
      mail_domain: domain.domain,
      local_part: localPart,
      label: label || localPart,
      created_at: nowIso(),
    };
    const inserted = await insertAlias(env.DB, alias);
    if (inserted) {
      return json(aliasJson(alias), 201);
    }
    if (body.local_part !== undefined) {
      return fail("alias_exists", "Alias already exists", 409);
    }
    localPart = `${slugify(label)}-${randomBase36(6)}`;
  }

  return fail("alias_exists", "Could not allocate a unique alias", 409);
}

async function handleDeleteAlias(
  id: string,
  env: Env,
  config: Config,
  token: VerifiedToken,
): Promise<Response> {
  const alias = await getAliasById(env.DB, id);
  if (!alias || !tokenAllowsDomain(token, alias.mail_domain)) {
    return fail("not_found", "Alias not found", 404);
  }
  if (!config.domain_map.has(alias.mail_domain)) {
    return fail("not_found", "Alias not found", 404);
  }
  await deleteAlias(env.DB, alias.id);
  return new Response(null, { status: 204 });
}

async function handleListMessages(
  url: URL,
  env: Env,
  config: Config,
  token: VerifiedToken,
): Promise<Response> {
  const requested = url.searchParams.get("mail_domain")?.trim().toLowerCase();
  if (requested) {
    if (!config.domain_map.has(requested) || !tokenAllowsDomain(token, requested)) {
      return fail("domain_not_allowed", "Mail domain is not allowed", 403);
    }
  }
  const orderRaw = url.searchParams.get("order") ?? "asc";
  if (orderRaw !== "asc" && orderRaw !== "desc") {
    return fail("invalid_order", "order must be asc or desc", 400);
  }
  const limit = readLimit(url, 50, 200);
  if (limit === null) {
    return fail("invalid_limit", "limit must be an integer from 1 to 200", 400);
  }
  const aliasId = url.searchParams.get("alias_id")?.trim() || undefined;
  if (aliasId && aliasId.length > 64) {
    return fail("invalid_alias_id", "alias_id is not valid", 400);
  }
  const since = url.searchParams.get("since")?.trim() || undefined;
  if (since && since.length > 64) {
    return fail("invalid_since", "since is not valid", 400);
  }

  const messages = await listMessages(env.DB, {
    domains: token.allowed_domains,
    mail_domain: requested,
    alias_id: aliasId,
    since,
    order: orderRaw,
    limit,
  });
  const nextCursor = messages.at(-1)?.id ?? since ?? null;
  return json({ messages: messages.map(messageJson), next_cursor: nextCursor });
}

async function handleGetMessage(
  id: string,
  env: Env,
  token: VerifiedToken,
): Promise<Response> {
  const message = await getMessage(env.DB, id, token.allowed_domains);
  if (!message) return fail("not_found", "Message not found", 404);
  return json(messageJson(message));
}

async function handleGetRaw(
  id: string,
  env: Env,
  token: VerifiedToken,
): Promise<Response> {
  const message = await getMessage(env.DB, id, token.allowed_domains);
  if (!message) return fail("not_found", "Message not found", 404);
  const object = await env.MAIL.get(message.raw_r2_key);
  if (!object) return fail("not_found", "Raw message not found", 404);
  return new Response(object.body, {
    headers: {
      "content-type": "message/rfc822",
      "content-disposition": `attachment; filename="${message.id}.eml"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function handleCreateToken(
  request: Request,
  env: Env,
  config: Config,
): Promise<Response> {
  if (!config.admin_token) {
    return fail("admin_disabled", "Admin token is not configured", 503);
  }
  if (!verifyAdminToken(request, config)) return unauthorized();
  if (!config.token_pepper) {
    return fail("pepper_missing", "bmail_token_pepper is not configured", 503);
  }

  const body = await readJsonBody(request);
  if (!body) return fail("invalid_body", "Body must be a JSON object", 400);

  const name = readString(body.name, 64);
  if (!name) return fail("invalid_name", "name is required", 400);

  let domains = "*";
  if (body.domains !== undefined) {
    if (body.domains === "*") {
      domains = "*";
    } else if (Array.isArray(body.domains)) {
      const selected: string[] = [];
      for (const item of body.domains) {
        if (typeof item !== "string") {
          return fail("invalid_domains", "domains must be a string array", 400);
        }
        const domain = item.trim().toLowerCase();
        if (!config.domain_map.has(domain) || selected.includes(domain)) {
          return fail("invalid_domains", "domains contains an unknown domain", 400);
        }
        selected.push(domain);
      }
      if (selected.length === 0) {
        return fail("invalid_domains", "domains must not be empty", 400);
      }
      domains = selected.join(",");
    } else {
      return fail("invalid_domains", "domains must be * or a string array", 400);
    }
  }

  let expiresAt: string | null = null;
  if (body.expires_in_days !== undefined) {
    const days = Number(body.expires_in_days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return fail(
        "invalid_expiry",
        "expires_in_days must be an integer from 1 to 3650",
        400,
      );
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const id = newId();
  const secret = randomHex(32);
  const tokenHash = await hashTokenSecret(secret, config.token_pepper);
  const createdAt = nowIso();

  await insertToken(env.DB, {
    id,
    name,
    token_hash: tokenHash,
    domains,
    expires_at: expiresAt,
    created_at: createdAt,
  });

  return json(
    {
      id,
      name,
      domains,
      expires_at: expiresAt,
      created_at: createdAt,
      token: `bmail_${id}_${secret}`,
    },
    201,
  );
}

async function handleListTokens(env: Env, config: Config): Promise<Response> {
  if (!config.admin_token) {
    return fail("admin_disabled", "Admin token is not configured", 503);
  }
  const rows = await listTokens(env.DB);
  return json({
    tokens: rows.map((row) => ({
      id: row.id,
      name: row.name,
      domains: row.domains,
      expires_at: row.expires_at,
      created_at: row.created_at,
    })),
  });
}

async function handleDeleteToken(
  id: string,
  env: Env,
  config: Config,
): Promise<Response> {
  if (!config.admin_token) {
    return fail("admin_disabled", "Admin token is not configured", 503);
  }
  const row = await getTokenRow(env.DB, id);
  if (!row) return fail("not_found", "Token not found", 404);
  await deleteToken(env.DB, id);
  return new Response(null, { status: 204 });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/health") {
    return json({ ok: true, version: VERSION });
  }

  let config: Config;
  try {
    config = parseConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return fail("config_invalid", "Server mail configuration is invalid", 503);
    }
    throw error;
  }

  if (segments[0] !== "v1") {
    return fail("not_found", "Not found", 404);
  }

  try {
    if (segments[1] === "tokens") {
      if (!config.admin_token) {
        return fail("admin_disabled", "Admin token is not configured", 503);
      }
      if (!verifyAdminToken(request, config)) return unauthorized();

      if (segments.length === 2) {
        if (method === "GET") return handleListTokens(env, config);
        if (method === "POST") return handleCreateToken(request, env, config);
      }
      if (segments.length === 3 && method === "DELETE") {
        const id = segments[2] ?? "";
        if (!/^[a-z0-9]{9,32}$/.test(id)) {
          return fail("not_found", "Token not found", 404);
        }
        return handleDeleteToken(id, env, config);
      }
      return fail("not_found", "Not found", 404);
    }

    const token = await verifyAgentToken(request, env, config);
    if (!token) return unauthorized();
    if (token.allowed_domains.length === 0) {
      return fail("domain_not_allowed", "Token has no mail domain access", 403);
    }

    if (segments[1] === "config" && segments.length === 2 && method === "GET") {
      return handleConfig(config, token);
    }

    if (segments[1] === "aliases") {
      if (segments.length === 2) {
        if (method === "GET") return handleListAliases(url, env, config, token);
        if (method === "POST") return handleCreateAlias(request, env, config, token);
      }
      if (segments.length === 3 && method === "DELETE") {
        const id = segments[2] ?? "";
        if (!/^[a-z0-9]{9,32}$/.test(id)) {
          return fail("not_found", "Alias not found", 404);
        }
        return handleDeleteAlias(id, env, config, token);
      }
      return fail("not_found", "Not found", 404);
    }

    if (segments[1] === "messages") {
      if (segments.length === 2 && method === "GET") {
        return handleListMessages(url, env, config, token);
      }
      if (segments.length === 3 && method === "GET") {
        const id = segments[2] ?? "";
        return handleGetMessage(id, env, token);
      }
      if (segments.length === 4 && segments[3] === "raw" && method === "GET") {
        const id = segments[2] ?? "";
        return handleGetRaw(id, env, token);
      }
      return fail("not_found", "Not found", 404);
    }

    return fail("not_found", "Not found", 404);
  } catch (error) {
    console.error(
      `bmail: request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return fail("internal_error", "Internal error", 500);
  }
}

import type { Config } from "./config";
import { domainsForScope } from "./config";
import { nowIso, sha256Hex, timingSafeEqual } from "./id";
import type { Env } from "./types";

export interface AgentTokenRow {
  id: string;
  name: string;
  token_hash: string;
  domains: string;
  expires_at: string | null;
  created_at: string;
}

export interface VerifiedToken extends AgentTokenRow {
  allowed_domains: string[];
}

export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const separator = header.indexOf(" ");
  if (separator <= 0) return null;
  const scheme = header.slice(0, separator).toLowerCase();
  const token = header.slice(separator + 1).trim();
  if (scheme !== "bearer" || !token) return null;
  return token;
}

export function parseAgentToken(
  token: string,
): { id: string; secret: string } | null {
  if (!token.startsWith("bmail_")) return null;
  const body = token.slice("bmail_".length);
  const separator = body.indexOf("_");
  if (separator <= 0 || separator === body.length - 1) return null;
  const id = body.slice(0, separator);
  const secret = body.slice(separator + 1);
  if (!/^[a-z0-9]{9,32}$/.test(id)) return null;
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  return { id, secret };
}

export async function hashTokenSecret(
  secret: string,
  pepper: string,
): Promise<string> {
  return sha256Hex(`${pepper}:${secret}`);
}

export async function verifyAgentToken(
  request: Request,
  env: Env,
  config: Config,
): Promise<VerifiedToken | null> {
  if (!config.token_pepper) return null;
  const bearer = parseBearerToken(request);
  if (!bearer) return null;
  const parsed = parseAgentToken(bearer);
  if (!parsed) return null;

  const row = await env.DB.prepare(
    "SELECT id, name, token_hash, domains, expires_at, created_at FROM agent_tokens WHERE id = ?",
  )
    .bind(parsed.id)
    .first<AgentTokenRow>();

  if (!row) {
    await hashTokenSecret(parsed.secret, config.token_pepper);
    return null;
  }

  const expected = await hashTokenSecret(parsed.secret, config.token_pepper);
  if (!timingSafeEqual(row.token_hash, expected)) return null;
  if (row.expires_at && row.expires_at <= nowIso()) return null;

  return { ...row, allowed_domains: domainsForScope(config, row.domains) };
}

export function verifyAdminToken(request: Request, config: Config): boolean {
  if (!config.admin_token) return false;
  const bearer = parseBearerToken(request);
  if (!bearer) return false;
  return timingSafeEqual(bearer, config.admin_token);
}

export function tokenAllowsDomain(
  token: VerifiedToken,
  mailDomain: string,
): boolean {
  return token.allowed_domains.includes(mailDomain);
}

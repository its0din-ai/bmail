import type { AgentTokenRow } from "./auth";

export interface AliasRow {
  id: string;
  mail_domain: string;
  local_part: string;
  label: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  alias_id: string;
  mail_domain: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  message_id: string | null;
  dmarc: string;
  size: number;
  raw_r2_key: string;
  received_at: string;
}

export interface MessageFilter {
  domains: string[] | "*";
  mail_domain?: string;
  alias_id?: string;
  since?: string;
  order: "asc" | "desc";
  limit: number;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

export async function getAliasByAddress(
  db: D1Database,
  mailDomain: string,
  localPart: string,
): Promise<AliasRow | null> {
  return db
    .prepare(
      "SELECT id, mail_domain, local_part, label, created_at FROM aliases WHERE mail_domain = ? AND local_part = ?",
    )
    .bind(mailDomain, localPart)
    .first<AliasRow>();
}

export async function getAliasById(
  db: D1Database,
  id: string,
): Promise<AliasRow | null> {
  return db
    .prepare(
      "SELECT id, mail_domain, local_part, label, created_at FROM aliases WHERE id = ?",
    )
    .bind(id)
    .first<AliasRow>();
}

export async function insertAlias(
  db: D1Database,
  alias: AliasRow,
): Promise<boolean> {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO aliases (id, mail_domain, local_part, label, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      alias.id,
      alias.mail_domain,
      alias.local_part,
      alias.label,
      alias.created_at,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listAliases(
  db: D1Database,
  domains: string[] | "*",
  mailDomain: string | undefined,
  limit: number,
): Promise<AliasRow[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (domains !== "*") {
    if (domains.length === 0) return [];
    clauses.push(`mail_domain IN (${placeholders(domains.length)})`);
    values.push(...domains);
  }
  if (mailDomain) {
    clauses.push("mail_domain = ?");
    values.push(mailDomain);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db
    .prepare(
      `SELECT id, mail_domain, local_part, label, created_at FROM aliases ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...values, limit)
    .all<AliasRow>();
  return result.results;
}

export async function deleteAlias(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM messages WHERE alias_id = ?").bind(id),
    db.prepare("DELETE FROM aliases WHERE id = ?").bind(id),
  ]);
}

export async function insertMessage(
  db: D1Database,
  message: MessageRow,
): Promise<boolean> {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO messages (id, alias_id, mail_domain, from_addr, to_addr, subject, message_id, dmarc, size, raw_r2_key, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      message.id,
      message.alias_id,
      message.mail_domain,
      message.from_addr,
      message.to_addr,
      message.subject,
      message.message_id,
      message.dmarc,
      message.size,
      message.raw_r2_key,
      message.received_at,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listMessages(
  db: D1Database,
  filter: MessageFilter,
): Promise<MessageRow[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filter.domains !== "*") {
    if (filter.domains.length === 0) return [];
    clauses.push(`mail_domain IN (${placeholders(filter.domains.length)})`);
    values.push(...filter.domains);
  }
  if (filter.mail_domain) {
    clauses.push("mail_domain = ?");
    values.push(filter.mail_domain);
  }
  if (filter.alias_id) {
    clauses.push("alias_id = ?");
    values.push(filter.alias_id);
  }
  if (filter.order === "asc" && filter.since) {
    clauses.push("id > ?");
    values.push(filter.since);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const order = filter.order === "asc" ? "ASC" : "DESC";
  const result = await db
    .prepare(
      `SELECT id, alias_id, mail_domain, from_addr, to_addr, subject, message_id, dmarc, size, raw_r2_key, received_at FROM messages ${where} ORDER BY id ${order} LIMIT ?`,
    )
    .bind(...values, filter.limit)
    .all<MessageRow>();
  return result.results;
}

export async function getMessage(
  db: D1Database,
  id: string,
  domains: string[] | "*",
): Promise<MessageRow | null> {
  if (domains === "*") {
    return db
      .prepare(
        "SELECT id, alias_id, mail_domain, from_addr, to_addr, subject, message_id, dmarc, size, raw_r2_key, received_at FROM messages WHERE id = ?",
      )
      .bind(id)
      .first<MessageRow>();
  }
  if (domains.length === 0) return null;
  return db
    .prepare(
      `SELECT id, alias_id, mail_domain, from_addr, to_addr, subject, message_id, dmarc, size, raw_r2_key, received_at FROM messages WHERE id = ? AND mail_domain IN (${placeholders(domains.length)})`,
    )
    .bind(id, ...domains)
    .first<MessageRow>();
}

export async function deleteExpired(
  db: D1Database,
  retentionDays: number,
): Promise<void> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db.batch([
    db
      .prepare(
        "DELETE FROM aliases WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.alias_id = aliases.id AND messages.received_at >= ?)",
      )
      .bind(cutoff, cutoff),
    db.prepare("DELETE FROM messages WHERE received_at < ?").bind(cutoff),
    db
      .prepare(
        "DELETE FROM agent_tokens WHERE expires_at IS NOT NULL AND expires_at < ?",
      )
      .bind(now.toISOString()),
  ]);
}

export async function getTokenRow(
  db: D1Database,
  id: string,
): Promise<AgentTokenRow | null> {
  return db
    .prepare(
      "SELECT id, name, token_hash, domains, expires_at, created_at FROM agent_tokens WHERE id = ?",
    )
    .bind(id)
    .first<AgentTokenRow>();
}

export async function insertToken(
  db: D1Database,
  token: AgentTokenRow,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO agent_tokens (id, name, token_hash, domains, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      token.id,
      token.name,
      token.token_hash,
      token.domains,
      token.expires_at,
      token.created_at,
    )
    .run();
}

export async function listTokens(db: D1Database): Promise<AgentTokenRow[]> {
  const result = await db
    .prepare(
      "SELECT id, name, token_hash, domains, expires_at, created_at FROM agent_tokens ORDER BY created_at DESC, id DESC",
    )
    .all<AgentTokenRow>();
  return result.results;
}

export async function deleteToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM agent_tokens WHERE id = ?").bind(id).run();
}

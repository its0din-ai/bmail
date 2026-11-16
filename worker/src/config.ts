import type { Env } from "./types";

export type MailDomainMode = "catch_all" | "fixed";

export interface MailDomainConfig {
  domain: string;
  mode: MailDomainMode;
}

export interface Config {
  domains: MailDomainConfig[];
  domain_map: Map<string, MailDomainConfig>;
  fixed_addresses: Set<string>;
  default_mail_domain: string | null;
  forward_to: string | null;
  retention_days: number;
  token_pepper: string | null;
  admin_token: string | null;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function isValidMailDomain(value: string): boolean {
  return DOMAIN_RE.test(value);
}

export function isValidLocalPart(value: string): boolean {
  return value.length <= 64 && LOCAL_RE.test(value);
}

export function normalizeAddress(input: string): string | null {
  const value = input.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!isValidLocalPart(local) || !isValidMailDomain(domain)) return null;
  return `${local}@${domain}`;
}

export function splitAddress(
  address: string,
): { local_part: string; mail_domain: string } | null {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return {
    local_part: address.slice(0, at),
    mail_domain: address.slice(at + 1),
  };
}

export function stripSubaddress(localPart: string): string {
  const plus = localPart.indexOf("+");
  return (plus === -1 ? localPart : localPart.slice(0, plus)).toLowerCase();
}

export function parseConfig(env: Env): Config {
  const rawDomains = (env.bmail_mail_domains ?? "").trim();
  if (!rawDomains) {
    throw new ConfigError("bmail_mail_domains is empty");
  }

  const domains: MailDomainConfig[] = [];
  const domain_map = new Map<string, MailDomainConfig>();

  for (const item of rawDomains.split(",")) {
    const entry = item.trim();
    if (!entry) continue;
    const separator = entry.lastIndexOf(":");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new ConfigError(`invalid mail domain entry: ${entry}`);
    }
    const domain = entry.slice(0, separator).trim().toLowerCase();
    const mode = entry.slice(separator + 1).trim().toLowerCase();
    if (!isValidMailDomain(domain)) {
      throw new ConfigError(`invalid mail domain: ${domain}`);
    }
    if (mode !== "catch_all" && mode !== "fixed") {
      throw new ConfigError(`invalid mode for ${domain}: ${mode}`);
    }
    if (domain_map.has(domain)) {
      throw new ConfigError(`duplicate mail domain: ${domain}`);
    }
    const config: MailDomainConfig = { domain, mode };
    domain_map.set(domain, config);
    domains.push(config);
  }

  if (domains.length === 0) {
    throw new ConfigError("bmail_mail_domains has no usable entries");
  }

  const fixed_addresses = new Set<string>();
  for (const item of (env.bmail_fixed_addresses ?? "").split(",")) {
    const entry = item.trim();
    if (!entry) continue;
    const address = normalizeAddress(entry);
    if (!address) {
      throw new ConfigError(`invalid fixed address: ${entry}`);
    }
    const parts = splitAddress(address);
    if (!parts) {
      throw new ConfigError(`invalid fixed address: ${entry}`);
    }
    const domain = domain_map.get(parts.mail_domain);
    if (!domain) {
      throw new ConfigError(
        `fixed address uses an unconfigured domain: ${parts.mail_domain}`,
      );
    }
    if (domain.mode !== "fixed") {
      throw new ConfigError(
        `fixed address requires a fixed domain: ${parts.mail_domain}`,
      );
    }
    fixed_addresses.add(address);
  }

  const defaultRaw = (env.bmail_default_mail_domain ?? "").trim().toLowerCase();
  let default_mail_domain: string | null = null;
  if (defaultRaw) {
    if (!domain_map.has(defaultRaw)) {
      throw new ConfigError(
        `bmail_default_mail_domain is not configured: ${defaultRaw}`,
      );
    }
    default_mail_domain = defaultRaw;
  }

  const forwardRaw = (env.bmail_forward_to ?? "").trim().toLowerCase();
  let forward_to: string | null = null;
  if (forwardRaw) {
    const address = normalizeAddress(forwardRaw);
    if (!address) {
      throw new ConfigError("bmail_forward_to is not a valid address");
    }
    const parts = splitAddress(address);
    if (parts && domain_map.has(parts.mail_domain)) {
      throw new ConfigError(
        "bmail_forward_to must not be on a configured mail domain",
      );
    }
    forward_to = address;
  }

  const retentionRaw = (env.bmail_retention_days ?? "90").trim();
  const retention_days = Number(retentionRaw);
  if (
    !Number.isInteger(retention_days) ||
    retention_days < 1 ||
    retention_days > 3650
  ) {
    throw new ConfigError("bmail_retention_days must be an integer from 1 to 3650");
  }

  const pepper = (env.bmail_token_pepper ?? "").trim();
  if (pepper && pepper.length < 16) {
    throw new ConfigError("bmail_token_pepper must be at least 16 characters");
  }

  const admin_token = (env.bmail_admin_token ?? "").trim() || null;

  return {
    domains,
    domain_map,
    fixed_addresses,
    default_mail_domain,
    forward_to,
    retention_days,
    token_pepper: pepper || null,
    admin_token,
  };
}

export function domainsForScope(config: Config, scope: string): string[] {
  if (scope.trim() === "*") {
    return config.domains.map((item) => item.domain);
  }
  const allowed = new Set<string>();
  for (const item of scope.split(",")) {
    const domain = item.trim().toLowerCase();
    if (domain && config.domain_map.has(domain)) {
      allowed.add(domain);
    }
  }
  return [...allowed];
}

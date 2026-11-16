import type { ClientOptions } from "./api.js";

export interface AdminConfig {
  api_url: string;
  admin_token: string;
}

function normalizeUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function loadClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): ClientOptions {
  const api_url = normalizeUrl(env.bmail_api_url);
  const token = env.bmail_token?.trim();
  if (!api_url) {
    throw new Error("bmail_api_url is required");
  }
  if (!token) {
    throw new Error("bmail_token is required");
  }
  return {
    api_url,
    token,
    admin_token: env.bmail_admin_token?.trim() || undefined,
    timeout_ms: 30_000,
  };
}

export function loadAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): AdminConfig {
  const api_url = normalizeUrl(env.bmail_api_url);
  const admin_token = env.bmail_admin_token?.trim();
  if (!api_url) {
    throw new Error("bmail_api_url is required");
  }
  if (!admin_token) {
    throw new Error("bmail_admin_token is required");
  }
  return { api_url, admin_token };
}

export function loadDefaultMailDomain(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.bmail_default_mail_domain?.trim() || undefined;
}

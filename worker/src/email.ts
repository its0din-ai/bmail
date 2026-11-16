import {
  ConfigError,
  isValidLocalPart,
  parseConfig,
  splitAddress,
  stripSubaddress,
  type Config,
} from "./config";
import { insertAlias, insertMessage, getAliasByAddress } from "./db";
import { newId, nowIso } from "./id";
import type { Env } from "./types";

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

export function readDmarc(headers: Headers): string {
  for (const [name, value] of headers) {
    if (name.toLowerCase() !== "authentication-results") continue;
    if (!value.toLowerCase().includes("mx.cloudflare.net")) continue;
    const match = /\bdmarc\s*=\s*([a-z]+)/i.exec(value);
    return match?.[1]?.toLowerCase() ?? "none";
  }
  return "none";
}

export function hasMirrorHeader(headers: Headers): boolean {
  for (const [name] of headers) {
    if (name.toLowerCase().startsWith("x-bmail-")) return true;
  }
  return false;
}

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  let config: Config;
  try {
    config = parseConfig(env);
  } catch (error) {
    const detail = error instanceof ConfigError ? error.message : "invalid config";
    console.error(`bmail: config error, dropping message: ${detail}`);
    return;
  }

  if (hasMirrorHeader(message.headers)) {
    return;
  }

  const recipient = message.to.trim().toLowerCase();
  const parts = splitAddress(recipient);
  if (!parts) return;
  const domainConfig = config.domain_map.get(parts.mail_domain);
  if (!domainConfig) return;

  const localPart = stripSubaddress(parts.local_part);
  if (!isValidLocalPart(localPart)) return;

  if (message.rawSize > MAX_MESSAGE_BYTES) {
    message.setReject("Message too large");
    return;
  }

  const aliasAddress = `${localPart}@${parts.mail_domain}`;
  let alias = await getAliasByAddress(env.DB, parts.mail_domain, localPart);
  if (!alias) {
    if (
      domainConfig.mode !== "fixed" ||
      !config.fixed_addresses.has(aliasAddress)
    ) {
      return;
    }
    const createdAt = nowIso();
    await insertAlias(env.DB, {
      id: newId(),
      mail_domain: parts.mail_domain,
      local_part: localPart,
      label: localPart,
      created_at: createdAt,
    });
    alias = await getAliasByAddress(env.DB, parts.mail_domain, localPart);
    if (!alias) return;
  }

  const dmarc = readDmarc(message.headers);
  const subject = (message.headers.get("subject") ?? "").slice(0, 998);
  const messageIdHeader = message.headers.get("message-id");
  const id = newId();
  const rawKey = `mail/${parts.mail_domain}/${id}.eml`;

  let stored = false;
  let storeError: unknown = null;
  try {
    await env.MAIL.put(rawKey, message.raw);
    const inserted = await insertMessage(env.DB, {
      id,
      alias_id: alias.id,
      mail_domain: parts.mail_domain,
      from_addr: message.from.trim().toLowerCase() || "unknown",
      to_addr: recipient,
      subject,
      message_id: messageIdHeader ? messageIdHeader.slice(0, 512) : null,
      dmarc,
      size: message.rawSize,
      raw_r2_key: rawKey,
      received_at: nowIso(),
    });
    if (!inserted) {
      await env.MAIL.delete(rawKey);
      return;
    }
    stored = true;
  } catch (error) {
    storeError = error;
    console.error(
      `bmail: failed to store message ${id}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (config.forward_to) {
    const headers = new Headers();
    headers.set("X-BMail-ID", id);
    headers.set("X-BMail-Alias", aliasAddress);
    headers.set("X-BMail-Mail-Domain", parts.mail_domain);
    headers.set("X-BMail-Auth", `dmarc=${dmarc}`);
    try {
      await message.forward(config.forward_to, headers);
    } catch (error) {
      console.error(
        `bmail: mirror failed for ${id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      if (!stored && storeError) throw storeError;
    }
  } else if (!stored && storeError) {
    throw storeError;
  }
}

import type { BmailClient } from "./api.js";
import { loadParsedMessage, type LoadedMessage } from "./message.js";

export interface WaitParameters {
  mail_domain?: string;
  alias_id?: string;
  since?: string;
  timeout_seconds?: number;
  interval_seconds?: number;
}

export interface WaitResult {
  found: boolean;
  next_cursor: string | null;
  message?: LoadedMessage;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function waitForMessage(
  client: BmailClient,
  params: WaitParameters,
): Promise<WaitResult> {
  const timeoutSeconds = clamp(params.timeout_seconds ?? 30, 1, 120);
  const intervalSeconds = clamp(params.interval_seconds ?? 2, 1, 30);

  let cursor = params.since ?? null;
  if (!cursor) {
    const latest = await client.listMessages({
      mail_domain: params.mail_domain,
      alias_id: params.alias_id,
      order: "desc",
      limit: 1,
    });
    cursor = latest.next_cursor;
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const page = await client.listMessages({
      mail_domain: params.mail_domain,
      alias_id: params.alias_id,
      since: cursor ?? undefined,
      order: "asc",
      limit: 50,
    });

    if (page.messages.length > 0) {
      const first = page.messages[0];
      if (first) {
        const message = await loadParsedMessage(client, first.id);
        return { found: true, next_cursor: page.next_cursor, message };
      }
    }

    if (page.next_cursor) cursor = page.next_cursor;
    if (Date.now() >= deadline) break;
    await sleep(intervalSeconds * 1000);
  }

  return { found: false, next_cursor: cursor };
}

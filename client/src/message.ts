import type { BmailClient, Message } from "./api.js";
import { parseRawEmail, type ParsedEmail } from "./parse.js";

export interface LoadedMessage {
  message: Message;
  parsed: ParsedEmail;
}

export async function loadParsedMessage(
  client: BmailClient,
  id: string,
): Promise<LoadedMessage> {
  const message = await client.getMessage(id);
  const raw = await client.getRawMessage(id);
  const parsed = await parseRawEmail(raw);
  return { message, parsed };
}

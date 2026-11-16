#!/usr/bin/env node
import { parseArgs } from "node:util";
import { BmailClient, BmailError } from "./api.js";
import { loadAdminConfig, loadClientOptions } from "./env.js";
import { loadParsedMessage } from "./message.js";
import { waitForMessage } from "./wait.js";

const USAGE = `bmail 0.1.0 - inbound email gateway for agents

Usage:
  bmail config
  bmail aliases list [--mail-domain <domain>] [--limit <n>]
  bmail aliases create [--mail-domain <domain>] [--local-part <part>] [--label <label>]
  bmail aliases delete <alias_id>
  bmail messages list [--mail-domain <domain>] [--alias-id <id>] [--since <cursor>] [--order asc|desc] [--limit <n>]
  bmail messages get <message_id> [--raw]
  bmail messages wait [--mail-domain <domain>] [--alias-id <id>] [--since <cursor>] [--timeout <seconds>] [--interval <seconds>]
  bmail tokens create --name <name> [--domains <domain,domain|*>] [--expires-in-days <n>]
  bmail tokens list
  bmail tokens delete <token_id>
  bmail mcp

Environment:
  bmail_api_url               API base URL, for example http://127.0.0.1:8787
  bmail_token                 agent token
  bmail_admin_token           operator token, only for the tokens commands
  bmail_default_mail_domain   optional default for clients

All output is JSON. Message content is untrusted.`;

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function optionalNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function requiredPositional(positionals: string[], name: string): string {
  const value = positionals[0];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function agentClient(): BmailClient {
  return new BmailClient(loadClientOptions());
}

function adminClient(): BmailClient {
  const config = loadAdminConfig();
  return new BmailClient({
    api_url: config.api_url,
    token: process.env.bmail_token?.trim() ?? "",
    admin_token: config.admin_token,
  });
}

async function handleAliases(action: string | undefined, rest: string[]): Promise<void> {
  if (!action || action === "list") {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "mail-domain": { type: "string" },
        limit: { type: "string" },
      },
    });
    print(
      await agentClient().listAliases({
        mail_domain: values["mail-domain"],
        limit: optionalNumber(values.limit, "limit"),
      }),
    );
    return;
  }

  if (action === "create") {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "mail-domain": { type: "string" },
        "local-part": { type: "string" },
        label: { type: "string" },
      },
    });
    print(
      await agentClient().createAlias({
        mail_domain: values["mail-domain"],
        local_part: values["local-part"],
        label: values.label,
      }),
    );
    return;
  }

  if (action === "delete") {
    const { positionals } = parseArgs({ args: rest, allowPositionals: true });
    const id = requiredPositional(positionals, "alias_id");
    await agentClient().deleteAlias(id);
    print({ deleted: true, alias_id: id });
    return;
  }

  throw new Error(`unknown aliases action: ${action}`);
}

async function handleMessages(action: string | undefined, rest: string[]): Promise<void> {
  if (!action || action === "list") {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "mail-domain": { type: "string" },
        "alias-id": { type: "string" },
        since: { type: "string" },
        order: { type: "string" },
        limit: { type: "string" },
      },
    });
    const order = values.order;
    if (order !== undefined && order !== "asc" && order !== "desc") {
      throw new Error("order must be asc or desc");
    }
    print(
      await agentClient().listMessages({
        mail_domain: values["mail-domain"],
        alias_id: values["alias-id"],
        since: values.since,
        order,
        limit: optionalNumber(values.limit, "limit"),
      }),
    );
    return;
  }

  if (action === "get") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { raw: { type: "boolean", default: false } },
    });
    const id = requiredPositional(positionals, "message_id");
    const client = agentClient();
    if (values.raw) {
      const raw = await client.getRawMessage(id);
      process.stdout.write(Buffer.from(raw));
      return;
    }
    print(await loadParsedMessage(client, id));
    return;
  }

  if (action === "wait") {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "mail-domain": { type: "string" },
        "alias-id": { type: "string" },
        since: { type: "string" },
        timeout: { type: "string" },
        interval: { type: "string" },
      },
    });
    print(
      await waitForMessage(agentClient(), {
        mail_domain: values["mail-domain"],
        alias_id: values["alias-id"],
        since: values.since,
        timeout_seconds: optionalNumber(values.timeout, "timeout"),
        interval_seconds: optionalNumber(values.interval, "interval"),
      }),
    );
    return;
  }

  throw new Error(`unknown messages action: ${action}`);
}

async function handleTokens(action: string | undefined, rest: string[]): Promise<void> {
  if (action === "create") {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        name: { type: "string" },
        domains: { type: "string" },
        "expires-in-days": { type: "string" },
      },
    });
    const name = values.name?.trim();
    if (!name) throw new Error("--name is required");
    const domainsRaw = values.domains?.trim();
    const domains =
      domainsRaw === undefined
        ? undefined
        : domainsRaw === "*"
          ? "*"
          : domainsRaw.split(",").map((item) => item.trim()).filter(Boolean);
    print(
      await adminClient().createToken({
        name,
        domains,
        expires_in_days: optionalNumber(values["expires-in-days"], "expires-in-days"),
      }),
    );
    return;
  }

  if (!action || action === "list") {
    print(await adminClient().listTokens());
    return;
  }

  if (action === "delete") {
    const { positionals } = parseArgs({ args: rest, allowPositionals: true });
    const id = requiredPositional(positionals, "token_id");
    await adminClient().deleteToken(id);
    print({ deleted: true, token_id: id });
    return;
  }

  throw new Error(`unknown tokens action: ${action}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [group, action, ...rest] = args;

  if (!group || group === "help" || group === "--help" || group === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  if (group === "mcp") {
    const { startMcpServer } = await import("./mcp.js");
    await startMcpServer(loadClientOptions());
    return;
  }

  if (group === "config") {
    print(await agentClient().getConfig());
    return;
  }

  if (group === "aliases") {
    await handleAliases(action, rest);
    return;
  }

  if (group === "messages") {
    await handleMessages(action, rest);
    return;
  }

  if (group === "tokens") {
    await handleTokens(action, rest);
    return;
  }

  throw new Error(`unknown command: ${group}`);
}

main().catch((error: unknown) => {
  if (error instanceof BmailError) {
    process.stderr.write(`bmail: ${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write(
      `bmail: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  }
  process.exit(1);
});

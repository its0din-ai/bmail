#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBmailServer, loadOptions } from "./server.js";

async function main(): Promise<void> {
  const server = createBmailServer(
    loadOptions(process.env),
    process.env.bmail_address?.trim() || undefined,
  );
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(
    `bmail-mcp: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exit(1);
});

import { parseConfig } from "./config";
import { deleteExpired } from "./db";
import { handleEmail } from "./email";
import { handleRequest } from "./http";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const config = parseConfig(env);
      await deleteExpired(env.DB, config.retention_days);
    } catch (error) {
      console.error(
        `bmail: cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  },
} satisfies ExportedHandler<Env>;

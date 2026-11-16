#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createBmailServer, loadOptions } from "./server.js";

const options = loadOptions(process.env);
const defaultAddress = process.env.bmail_address?.trim() || undefined;
const host = process.env.bmail_http_host?.trim() || "127.0.0.1";
const port = Number(process.env.bmail_http_port ?? "8788");
const path =
  (process.env.bmail_http_path?.trim() || "/mcp").replace(/\/+$/, "") || "/mcp";
const corsOrigin = process.env.bmail_cors_origin?.trim() || "";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("bmail_http_port must be an integer from 1 to 65535");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function setCors(response: Response): void {
  if (!corsOrigin) return;
  response.setHeader("access-control-allow-origin", corsOrigin);
  response.setHeader("vary", "origin");
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, accept, mcp-session-id, mcp-protocol-version",
  );
  response.setHeader("access-control-expose-headers", "mcp-session-id");
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, Session>();

async function createSession(): Promise<Session> {
  const server = createBmailServer(options, defaultAddress);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) sessions.delete(sessionId);
  };
  await server.connect(transport);
  return { transport, server };
}

function sessionFrom(request: Request): Session | null {
  const sessionId = request.headers["mcp-session-id"];
  if (typeof sessionId !== "string") return null;
  return sessions.get(sessionId) ?? null;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use((request, response, next) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.use(path, (request, response, next) => {
  const authorization = request.headers.authorization ?? "";
  if (!safeEqual(authorization, `Bearer ${options.api_key}`)) {
    response
      .status(401)
      .set("www-authenticate", 'Bearer realm="bmail"')
      .json({ error: { code: "unauthorized" } });
    return;
  }
  next();
});

function mcpError(response: Response, status: number, message: string): void {
  response.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

function internalError(response: Response, error: unknown): void {
  console.error(
    `bmail-mcp-http: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  if (!response.headersSent) {
    response.status(500).json({ error: { code: "internal_error" } });
  } else {
    response.end();
  }
}

async function handlePost(request: Request, response: Response): Promise<void> {
  try {
    const existing = sessionFrom(request);
    if (existing) {
      await existing.transport.handleRequest(request, response, request.body);
      return;
    }

    if (request.headers["mcp-session-id"]) {
      mcpError(response, 404, "Session not found");
      return;
    }

    if (!isInitializeRequest(request.body)) {
      mcpError(response, 400, "Expected an initialize request");
      return;
    }

    const session = await createSession();
    await session.transport.handleRequest(request, response, request.body);
    const sessionId = session.transport.sessionId;
    if (sessionId) sessions.set(sessionId, session);
  } catch (error) {
    internalError(response, error);
  }
}

async function handleSessionRequest(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const sessionId = request.headers["mcp-session-id"];
    if (typeof sessionId !== "string") {
      mcpError(response, 400, "Missing mcp-session-id");
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      mcpError(response, 404, "Session not found");
      return;
    }
    await session.transport.handleRequest(request, response);
  } catch (error) {
    internalError(response, error);
  }
}

app.post(path, handlePost);
app.get(path, handleSessionRequest);
app.delete(path, handleSessionRequest);

app.use(
  (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(
      `bmail-mcp-http: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(400).json({ error: { code: "invalid_request" } });
  },
);

const httpServer = app.listen(port, host, () => {
  process.stderr.write(
    `bmail-mcp-http listening on http://${host}:${port}${path}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}

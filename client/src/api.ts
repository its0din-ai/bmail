export class BmailError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BmailError";
    this.status = status;
    this.code = code;
  }
}

export interface BmailClientOptions {
  api_url: string;
  api_key: string;
  timeout_ms?: number;
}

export interface InboxMessage {
  id: string;
  key: string;
  from: string;
  subject: string;
  received_at: string;
  size: number;
  dmarc: string;
}

export interface InboxPage {
  address: string;
  messages: InboxMessage[];
  next_cursor: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class BmailClient {
  private readonly base: string;
  private readonly options: BmailClientOptions;

  constructor(options: BmailClientOptions) {
    this.options = options;
    this.base = options.api_url.replace(/\/+$/, "");
  }

  private async request(path: string, query: Record<string, string | number | undefined> = {}): Promise<Response> {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.options.api_key}`,
      },
      signal: AbortSignal.timeout(this.options.timeout_ms ?? 30_000),
    });

    if (response.ok) return response;

    let code = "http_error";
    let message = `HTTP ${response.status}`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      const payload: unknown = await response.json();
      if (isRecord(payload) && isRecord(payload.error)) {
        if (typeof payload.error.code === "string") code = payload.error.code;
        if (typeof payload.error.message === "string") {
          message = payload.error.message;
        }
      }
    }
    throw new BmailError(response.status, code, message);
  }

  async listMessages(
    address: string,
    after?: string,
    limit?: number,
  ): Promise<InboxPage> {
    const response = await this.request(
      `/v1/inbox/${encodeURIComponent(address)}`,
      { after, limit },
    );
    return (await response.json()) as InboxPage;
  }

  async getRawMessage(address: string, id: string): Promise<ArrayBuffer> {
    const response = await this.request(
      `/v1/inbox/${encodeURIComponent(address)}/${encodeURIComponent(id)}`,
    );
    return response.arrayBuffer();
  }
}

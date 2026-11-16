export interface MailDomainInfo {
  domain: string;
  mode: "catch_all" | "fixed";
  can_create_aliases: boolean;
}

export interface ConfigResponse {
  mail_domains: MailDomainInfo[];
  default_mail_domain: string | null;
  retention_days: number;
}

export interface Alias {
  id: string;
  mail_domain: string;
  local_part: string;
  address: string;
  label: string;
  created_at: string;
}

export interface Message {
  id: string;
  alias_id: string;
  mail_domain: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  message_id: string | null;
  dmarc: string;
  size: number;
  received_at: string;
  raw_url: string;
}

export interface MessageList {
  messages: Message[];
  next_cursor: string | null;
}

export interface TokenInfo {
  id: string;
  name: string;
  domains: string;
  expires_at: string | null;
  created_at: string;
}

export interface CreatedToken extends TokenInfo {
  token: string;
}

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

export interface ClientOptions {
  api_url: string;
  token: string;
  admin_token?: string;
  timeout_ms?: number;
}

type QueryValue = string | number | undefined;

interface RequestOptions {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  admin?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class BmailClient {
  readonly options: ClientOptions;
  private readonly base: string;

  constructor(options: ClientOptions) {
    this.options = options;
    this.base = options.api_url.replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const token = options.admin
      ? this.options.admin_token
      : this.options.token;
    if (!token) {
      throw new BmailError(
        0,
        "missing_token",
        options.admin ? "bmail_admin_token is not set" : "bmail_token is not set",
      );
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(this.options.timeout_ms ?? 30_000),
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      const code = typeof error.code === "string" ? error.code : "http_error";
      const message =
        typeof error.message === "string"
          ? error.message
          : `HTTP ${response.status}`;
      throw new BmailError(response.status, code, message);
    }

    return payload as T;
  }

  async getConfig(): Promise<ConfigResponse> {
    return this.request<ConfigResponse>("/v1/config");
  }

  async listAliases(params: {
    mail_domain?: string;
    limit?: number;
  } = {}): Promise<{ aliases: Alias[] }> {
    return this.request<{ aliases: Alias[] }>("/v1/aliases", {
      query: { mail_domain: params.mail_domain, limit: params.limit },
    });
  }

  async createAlias(params: {
    mail_domain?: string;
    local_part?: string;
    label?: string;
  }): Promise<Alias> {
    return this.request<Alias>("/v1/aliases", {
      method: "POST",
      body: params,
    });
  }

  async deleteAlias(id: string): Promise<void> {
    await this.request<void>(`/v1/aliases/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async listMessages(params: {
    mail_domain?: string;
    alias_id?: string;
    since?: string;
    order?: "asc" | "desc";
    limit?: number;
  } = {}): Promise<MessageList> {
    return this.request<MessageList>("/v1/messages", {
      query: {
        mail_domain: params.mail_domain,
        alias_id: params.alias_id,
        since: params.since,
        order: params.order,
        limit: params.limit,
      },
    });
  }

  async getMessage(id: string): Promise<Message> {
    return this.request<Message>(`/v1/messages/${encodeURIComponent(id)}`);
  }

  async getRawMessage(id: string): Promise<ArrayBuffer> {
    const url = new URL(
      `${this.base}/v1/messages/${encodeURIComponent(id)}/raw`,
    );
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.options.token}` },
      signal: AbortSignal.timeout(this.options.timeout_ms ?? 30_000),
    });
    if (!response.ok) {
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
    return response.arrayBuffer();
  }

  async createToken(params: {
    name: string;
    domains?: "*" | string[];
    expires_in_days?: number;
  }): Promise<CreatedToken> {
    return this.request<CreatedToken>("/v1/tokens", {
      method: "POST",
      body: params,
      admin: true,
    });
  }

  async listTokens(): Promise<{ tokens: TokenInfo[] }> {
    return this.request<{ tokens: TokenInfo[] }>("/v1/tokens", {
      admin: true,
    });
  }

  async deleteToken(id: string): Promise<void> {
    await this.request<void>(`/v1/tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
      admin: true,
    });
  }
}

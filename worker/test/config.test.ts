import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, stripSubaddress } from "../src/config";
import type { Env } from "../src/types";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    MAIL: {} as R2Bucket,
    bmail_mail_domains:
      "mail.example.com:catch_all,inbound.example.net:fixed",
    bmail_fixed_addresses: "programs@inbound.example.net",
    bmail_default_mail_domain: "mail.example.com",
    bmail_forward_to: "owner@example.org",
    bmail_retention_days: "90",
    bmail_token_pepper: "x".repeat(32),
    bmail_admin_token: "admin-token",
    ...overrides,
  };
}

describe("parseConfig", () => {
  it("parses domains, modes, fixed addresses, and defaults", () => {
    const config = parseConfig(baseEnv());
    expect(config.domains).toEqual([
      { domain: "mail.example.com", mode: "catch_all" },
      { domain: "inbound.example.net", mode: "fixed" },
    ]);
    expect(config.default_mail_domain).toBe("mail.example.com");
    expect(config.fixed_addresses.has("programs@inbound.example.net")).toBe(true);
    expect(config.forward_to).toBe("owner@example.org");
    expect(config.retention_days).toBe(90);
  });

  it("requires a non-empty domain list", () => {
    expect(() => parseConfig(baseEnv({ bmail_mail_domains: "" }))).toThrow(
      ConfigError,
    );
  });

  it("rejects an unknown mode", () => {
    expect(() =>
      parseConfig(baseEnv({ bmail_mail_domains: "mail.example.com:catchall" })),
    ).toThrow(/invalid mode/);
  });

  it("rejects duplicate domains", () => {
    expect(() =>
      parseConfig(
        baseEnv({
          bmail_mail_domains:
            "mail.example.com:catch_all,mail.example.com:fixed",
        }),
      ),
    ).toThrow(/duplicate/);
  });

  it("rejects a default that is not configured", () => {
    expect(() =>
      parseConfig(baseEnv({ bmail_default_mail_domain: "other.example.com" })),
    ).toThrow(/not configured/);
  });

  it("rejects a mirror target on a configured domain", () => {
    expect(() =>
      parseConfig(baseEnv({ bmail_forward_to: "owner@mail.example.com" })),
    ).toThrow(/must not be on a configured mail domain/);
  });

  it("rejects a fixed address on a catch_all domain", () => {
    expect(() =>
      parseConfig(
        baseEnv({ bmail_fixed_addresses: "programs@mail.example.com" }),
      ),
    ).toThrow(/requires a fixed domain/);
  });

  it("rejects an invalid retention window", () => {
    expect(() =>
      parseConfig(baseEnv({ bmail_retention_days: "0" })),
    ).toThrow(/retention/);
  });

  it("rejects a short pepper", () => {
    expect(() =>
      parseConfig(baseEnv({ bmail_token_pepper: "short" })),
    ).toThrow(/pepper/);
  });

  it("allows missing optional secrets", () => {
    const config = parseConfig(
      baseEnv({ bmail_token_pepper: "", bmail_admin_token: "" }),
    );
    expect(config.token_pepper).toBeNull();
    expect(config.admin_token).toBeNull();
  });
});

describe("stripSubaddress", () => {
  it("removes the plus tag and lowercases", () => {
    expect(stripSubaddress("Acme+signup@example.com".split("@")[0]!)).toBe(
      "acme",
    );
  });

  it("keeps a plain local part", () => {
    expect(stripSubaddress("acme-123")).toBe("acme-123");
  });
});

import { describe, expect, it } from "vitest";
import {
  parseForwardTo,
  parseRecipients,
  readDmarc,
  recipientAllowed,
  splitAddress,
  timingSafeEqual,
} from "../src/index";

describe("parseRecipients", () => {
  it("parses domains and exact addresses", () => {
    const config = parseRecipients(
      "mail.example.com, Bbounty@Programs.Example.net",
    );
    expect([...config.domains]).toEqual(["mail.example.com"]);
    expect([...config.addresses]).toEqual(["bbounty@programs.example.net"]);
  });

  it("rejects an empty list", () => {
    expect(() => parseRecipients("")).toThrow(/empty/);
  });

  it("rejects an invalid domain", () => {
    expect(() => parseRecipients("not a domain")).toThrow(/invalid/);
  });

  it("rejects an invalid address entry", () => {
    expect(() => parseRecipients("a/b@mail.example.com")).toThrow(
      /invalid recipient/,
    );
  });

  it("rejects wildcard entries with a clear error", () => {
    expect(() => parseRecipients("*@mail.example.com")).toThrow(/wildcards/);
    expect(() => parseRecipients("*")).toThrow(/wildcards/);
    expect(() => parseRecipients("*.mail.example.com")).toThrow(/wildcards/);
  });
});

describe("parseForwardTo", () => {
  it("normalizes a single destination address", () => {
    expect(parseForwardTo(" Archive@Example.com ")).toBe("archive@example.com");
  });

  it("treats an empty value, none, and off as disabled", () => {
    expect(parseForwardTo(undefined)).toBeNull();
    expect(parseForwardTo("")).toBeNull();
    expect(parseForwardTo("   ")).toBeNull();
    expect(parseForwardTo(" NONE ")).toBeNull();
    expect(parseForwardTo("off")).toBeNull();
  });

  it("rejects a bare domain", () => {
    expect(() => parseForwardTo("mail.example.com")).toThrow(/forward address/);
  });

  it("rejects a malformed address", () => {
    expect(() => parseForwardTo("a/b@mail.example.com")).toThrow(
      /forward address/,
    );
  });
});

describe("recipientAllowed", () => {
  const config = parseRecipients(
    "mail.example.com,bbounty@programs.example.net",
  );

  it("allows any local part on a domain entry", () => {
    expect(recipientAllowed(config, "test@mail.example.com")).toBe(true);
  });

  it("allows the exact address", () => {
    expect(recipientAllowed(config, "bbounty@programs.example.net")).toBe(true);
  });

  it("rejects another address on the same domain", () => {
    expect(recipientAllowed(config, "other@programs.example.net")).toBe(false);
  });

  it("rejects a malformed address", () => {
    expect(recipientAllowed(config, "a/b@mail.example.com")).toBe(false);
  });
});

describe("splitAddress", () => {
  it("splits a valid address", () => {
    expect(splitAddress("Test+tag@mail.example.com")).toEqual({
      local_part: "test+tag",
      mail_domain: "mail.example.com",
    });
  });

  it("rejects path characters", () => {
    expect(splitAddress("../x@mail.example.com")).toBeNull();
    expect(splitAddress("a/b@mail.example.com")).toBeNull();
  });
});

describe("readDmarc", () => {
  it("reads the Cloudflare Authentication-Results header", () => {
    const headers = new Headers();
    headers.set(
      "Authentication-Results",
      "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass",
    );
    expect(readDmarc(headers)).toBe("pass");
  });

  it("ignores a sender header that merely contains the Cloudflare name", () => {
    const headers = new Headers();
    headers.set(
      "Authentication-Results",
      "mx.evil.example; mx.cloudflare.net; dmarc=pass",
    );
    expect(readDmarc(headers)).toBe("none");
  });

  it("ignores a forged header placed before the Cloudflare header", () => {
    const headers = new Headers();
    headers.append("Authentication-Results", "mx.evil.example; dmarc=pass");
    headers.append(
      "Authentication-Results",
      "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=fail",
    );
    expect(readDmarc(headers)).toBe("none");
  });

  it("trusts the first header when Cloudflare prepends it", () => {
    const headers = new Headers();
    headers.append(
      "Authentication-Results",
      "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass",
    );
    headers.append("Authentication-Results", "mx.evil.example; dmarc=fail");
    expect(readDmarc(headers)).toBe("pass");
  });

  it("returns none when the header is absent", () => {
    expect(readDmarc(new Headers())).toBe("none");
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("abcd", "abcd")).toBe(true);
    expect(timingSafeEqual("abcd", "abce")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });
});

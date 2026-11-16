import { describe, expect, it } from "vitest";
import {
  parseDomains,
  readDmarc,
  splitAddress,
  timingSafeEqual,
} from "../src/index";

describe("parseDomains", () => {
  it("parses a comma-separated list", () => {
    const domains = parseDomains("mail.example.com, Programs.Example.net");
    expect([...domains]).toEqual(["mail.example.com", "programs.example.net"]);
  });

  it("rejects an empty list", () => {
    expect(() => parseDomains("")).toThrow(/empty/);
  });

  it("rejects an invalid domain", () => {
    expect(() => parseDomains("not a domain")).toThrow(/invalid/);
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

  it("ignores sender-supplied headers", () => {
    const headers = new Headers();
    headers.set("Authentication-Results", "mx.evil.example; dmarc=pass");
    expect(readDmarc(headers)).toBe("none");
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("abcd", "abcd")).toBe(true);
    expect(timingSafeEqual("abcd", "abce")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });
});

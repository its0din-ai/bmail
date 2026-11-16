import { describe, expect, it } from "vitest";
import {
  hashTokenSecret,
  parseAgentToken,
  parseBearerToken,
} from "../src/auth";
import { randomHex, timingSafeEqual } from "../src/id";

describe("parseBearerToken", () => {
  it("accepts a bearer token", () => {
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer abc" },
    });
    expect(parseBearerToken(request)).toBe("abc");
  });

  it("rejects other schemes and missing headers", () => {
    const basic = new Request("https://example.com", {
      headers: { authorization: "Basic abc" },
    });
    expect(parseBearerToken(basic)).toBeNull();
    expect(parseBearerToken(new Request("https://example.com"))).toBeNull();
  });
});

describe("parseAgentToken", () => {
  it("parses the id and 64-char hex secret", () => {
    const secret = randomHex(32);
    const parsed = parseAgentToken(`bmail_0123456789abcdef_${secret}`);
    expect(parsed).toEqual({ id: "0123456789abcdef", secret });
  });

  it("rejects malformed tokens", () => {
    expect(parseAgentToken("bmail_missing")).toBeNull();
    expect(parseAgentToken("nope_0123456789abcdef_" + randomHex(32))).toBeNull();
    expect(parseAgentToken("bmail_0123456789abcdef_nothex")).toBeNull();
  });
});

describe("hashTokenSecret", () => {
  it("is deterministic per pepper", async () => {
    const secret = randomHex(32);
    const first = await hashTokenSecret(secret, "pepper-one");
    const second = await hashTokenSecret(secret, "pepper-one");
    const third = await hashTokenSecret(secret, "pepper-two");
    expect(first).toBe(second);
    expect(first).not.toBe(third);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("abcd", "abcd")).toBe(true);
    expect(timingSafeEqual("abcd", "abce")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });
});

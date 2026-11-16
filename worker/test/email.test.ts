import { describe, expect, it } from "vitest";
import { hasMirrorHeader, readDmarc } from "../src/email";

describe("readDmarc", () => {
  it("reads dmarc from the Cloudflare Authentication-Results header", () => {
    const headers = new Headers();
    headers.set(
      "Authentication-Results",
      "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass",
    );
    expect(readDmarc(headers)).toBe("pass");
  });

  it("ignores sender-supplied Authentication-Results headers", () => {
    const headers = new Headers();
    headers.set("Authentication-Results", "mx.evil.example; dmarc=pass");
    expect(readDmarc(headers)).toBe("none");
  });

  it("returns none when the header is absent", () => {
    expect(readDmarc(new Headers())).toBe("none");
  });
});

describe("hasMirrorHeader", () => {
  it("detects X-BMail headers", () => {
    const headers = new Headers();
    headers.set("X-BMail-ID", "abc");
    expect(hasMirrorHeader(headers)).toBe(true);
  });

  it("ignores unrelated headers", () => {
    const headers = new Headers();
    headers.set("X-Other", "abc");
    expect(hasMirrorHeader(headers)).toBe(false);
  });
});

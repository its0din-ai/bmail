import { describe, expect, it } from "vitest";
import { htmlToText, parseRawEmail } from "../src/parse";

function rawMessage(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

describe("htmlToText", () => {
  it("drops scripts and styles and keeps readable text", () => {
    const text = htmlToText(
      "<style>p{color:red}</style><p>Hello <b>there</b></p><script>alert(1)</script><p>Code: 123456</p>",
    );
    expect(text).toContain("Hello");
    expect(text).toContain("Code: 123456");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });
});

describe("parseRawEmail", () => {
  it("extracts subject, sender, text, links, and codes", async () => {
    const raw = [
      "From: Security Team <security@example.com>",
      "To: test@mail.example.com",
      "Subject: Your verification code",
      "Message-ID: <abc@example.com>",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Your verification code is 482913.",
      "Open https://example.com/verify?token=abc123 to continue.",
    ].join("\r\n");

    const parsed = await parseRawEmail(rawMessage(raw));
    expect(parsed.subject).toBe("Your verification code");
    expect(parsed.from).toBe("security@example.com");
    expect(parsed.text).toContain("482913");
    expect(parsed.links).toContain(
      "https://example.com/verify?token=abc123",
    );
    expect(parsed.otp_candidates).toContain("482913");
    expect(parsed.untrusted).toBe(true);
    expect(parsed.attachments).toEqual([]);
  });

  it("derives text from an HTML-only message", async () => {
    const raw = [
      "From: Team <team@example.com>",
      "To: test@mail.example.com",
      "Subject: Welcome",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Welcome to <b>Example</b>.</p><p>Your code: 918273</p>",
    ].join("\r\n");

    const parsed = await parseRawEmail(rawMessage(raw));
    expect(parsed.text).toContain("Welcome to Example");
    expect(parsed.text).toContain("918273");
    expect(parsed.has_html).toBe(true);
  });
});

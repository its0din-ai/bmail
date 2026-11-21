// Test stand-in for the Workers-only `cloudflare:email` module.
export class EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream | string;

  constructor(from: string, to: string, raw: ReadableStream | string) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}

export interface Env {
  DB: D1Database;
  MAIL: R2Bucket;
  bmail_mail_domains: string;
  bmail_fixed_addresses?: string;
  bmail_default_mail_domain?: string;
  bmail_forward_to?: string;
  bmail_retention_days?: string;
  bmail_token_pepper?: string;
  bmail_admin_token?: string;
}

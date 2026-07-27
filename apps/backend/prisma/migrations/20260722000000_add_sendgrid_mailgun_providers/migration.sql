-- Add SENDGRID and MAILGUN as new integration providers to support the
-- mailer grouping feature — tenants can choose one email provider (Resend,
-- SendGrid, or Mailgun) at a time. ALTER TYPE ... ADD VALUE is safe here
-- since no existing rows reference these values yet.
ALTER TYPE "IntegrationProvider" ADD VALUE 'SENDGRID';
ALTER TYPE "IntegrationProvider" ADD VALUE 'MAILGUN';

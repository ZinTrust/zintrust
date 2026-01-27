#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-restricted-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Direct email test using Mail service with SMTP
 */

// Manually load .env file first
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Now import after env is loaded
import {
  Logger,
  Mail,
  mailConfig,
  MailDriverRegistry,
  MailTemplateRenderer,
  MailTemplates,
  SmtpDriver,
} from './src/index';

// Parse and load .env file
const envPath = join(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
  Logger.info('✓ Environment loaded from .env');
} catch (error) {
  Logger.error('✗ Failed to load .env:', error);
  process.exit(1);
}

// Fix: Port 587 should use 'starttls', not 'true'
const smtpConfig = mailConfig.drivers.smtp;
if (smtpConfig.port === 587 && smtpConfig.secure === true) {
  Logger.info('⚠️  Adjusting SMTP config: port 587 requires STARTTLS, not implicit TLS');
  smtpConfig.secure = 'starttls';
}

// Register SMTP driver manually
MailDriverRegistry.register('smtp', (config: any, message: any) =>
  SmtpDriver.send(config, message)
);

async function sendTestEmail() {
  Logger.info('📧 Sending templated test email...');
  Logger.info('   To: test@zintrust.com');
  Logger.info('   From: no-reply@engage.vizo.app');
  Logger.info('   Driver: configured via MAIL_DRIVER');
  Logger.info('   SMTP: configured via MAIL_HOST/MAIL_PORT');
  Logger.info('');

  // Use the built-in welcome template from MailTemplates
  const template = MailTemplates.auth.welcome;

  // Render template with test data
  const renderedEmail = MailTemplateRenderer.render(template, {
    name: 'ZinTrust Framework',
  });

  Logger.info('📝 Using template: MailTemplates.auth.welcome');
  Logger.info('   Subject:', renderedEmail.subject);
  Logger.info('');

  try {
    const result = await Mail.send({
      to: 'test@zintrust.com',
      from: {
        address: 'no-reply@engage.vizo.app',
        name: 'ZinTrust Framework',
      },
      subject: renderedEmail.subject,
      text: renderedEmail.text,
      html: renderedEmail.html,
    });

    Logger.info('✅ Templated email sent successfully!');
    Logger.info('   Result:', result);
    Logger.info('');
    Logger.info('📬 Check test@zintrust.com for the email.');
    Logger.info('   Using built-in template system with MailTemplateRenderer');

    process.exit(0);
  } catch (error) {
    Logger.error('❌ Failed to send email:', error);
    process.exit(1);
  }
}

await sendTestEmail();

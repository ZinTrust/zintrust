import { generateUuid } from '@/common/utility';
import { isNonEmptyString } from '@helper/index';

export type MailAddress = {
  email: string;
  name?: string;
};

export type MailAttachment = { filename: string; content: Buffer };

export type MailMessage = {
  to: string | string[];
  from: MailAddress;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const trimMessageIdDomainDecorators = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '<') {
    start += 1;
  }

  while (end > start && value[end - 1] === '>') {
    end -= 1;
  }

  while (end > start && value[end - 1] === '.') {
    end -= 1;
  }

  return value.slice(start, end);
};

const resolveMessageIdDomain = (senderEmail: string): string => {
  const domainCandidate = senderEmail.split('@')[1]?.trim().toLowerCase() ?? '';
  if (!isNonEmptyString(domainCandidate)) return 'localhost';

  const normalizedDomain = trimMessageIdDomainDecorators(domainCandidate);
  if (!isNonEmptyString(normalizedDomain) || !normalizedDomain.includes('.')) {
    return normalizedDomain === '' ? 'localhost' : normalizedDomain;
  }

  return normalizedDomain;
};

export const buildRfc2822Message = (msg: MailMessage): string => {
  const toList = normalizeRecipients(msg.to);

  const fromNameRaw = msg.from.name;
  const fromName = typeof fromNameRaw === 'string' ? fromNameRaw.trim() : '';
  const fromHeader = fromName === '' ? msg.from.email : `${fromName} <${msg.from.email}>`;

  const toHeader = toList.join(', ');
  const subject = msg.subject;
  const messageId = `<${generateUuid().replaceAll('-', '')}@${resolveMessageIdDomain(msg.from.email)}>`;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ];

  const attachParts = (attachments: MailAttachment[], innerBody: string): string => {
    const mixedBoundary = `mixed_${generateUuid().replaceAll('-', '')}`;
    const lines: string[] = [];

    lines.push(
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      innerBody
    );

    for (const attachment of attachments) {
      const b64 = attachment.content.toString('base64');
      lines.push(
        `--${mixedBoundary}`,
        `Content-Type: application/octet-stream; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        ''
      );
      for (let index = 0; index < b64.length; index += 76) {
        lines.push(b64.slice(index, index + 76));
      }
    }

    lines.push(`--${mixedBoundary}--`, '');

    return lines.join('\r\n');
  };

  if (typeof msg.html === 'string' && msg.html !== '') {
    const boundary = `zintrust_${generateUuid().replaceAll('-', '')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      msg.text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      msg.html,
      `--${boundary}--`,
      '',
    ];

    const inner = `${parts.join('\r\n')}`;

    if (msg.attachments && msg.attachments.length > 0) {
      const mixed = attachParts(msg.attachments, inner);
      return `${headers.join('\r\n')}\r\n\r\n${mixed}`;
    }

    return `${headers.join('\r\n')}\r\n\r\n${inner}`;
  }

  if (msg.attachments && msg.attachments.length > 0) {
    const inner = ['Content-Type: text/plain; charset=utf-8', '', msg.text, ''].join('\r\n');
    const mixed = attachParts(msg.attachments, inner);
    return `${headers.join('\r\n')}\r\n\r\n${mixed}`;
  }

  headers.push('Content-Type: text/plain; charset=utf-8');
  return `${headers.join('\r\n')}\r\n\r\n${msg.text}\r\n`;
};

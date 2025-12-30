import { generateUuid } from '@common/uuid';
import { ErrorFactory } from '@exceptions/ZintrustError';

import * as net from '@node-singletons/net';
import * as tls from '@node-singletons/tls';

export type SmtpConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  secure?: boolean | 'starttls';
};

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

export type SendResult = {
  ok: boolean;
  provider: 'smtp';
  messageId?: string;
};

type SmtpResponse = {
  code: number;
  message: string;
};

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const toBase64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' && typeof process.versions?.node === 'string';

const validateConfig = (config: SmtpConfig): void => {
  if (!isNodeRuntime()) {
    throw ErrorFactory.createConfigError('SMTP driver requires Node.js runtime');
  }

  if (config.host.trim() === '') {
    throw ErrorFactory.createConfigError('SMTP: missing MAIL_HOST');
  }

  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw ErrorFactory.createConfigError('SMTP: invalid MAIL_PORT');
  }
};

const createSocket = async (config: SmtpConfig, implicitTls: boolean): Promise<net.Socket> => {
  validateConfig(config);

  return new Promise((resolve, reject) => {
    const onError = (err: unknown): void => {
      reject(
        ErrorFactory.createConnectionError('SMTP connection failed', {
          host: config.host,
          port: config.port,
          secure: implicitTls,
          error: err,
        })
      );
    };

    const socket = implicitTls
      ? (tls.connect({
          host: config.host,
          port: config.port,
          servername: config.host,
        }) as unknown as net.Socket)
      : net.connect({ host: config.host, port: config.port });

    if (implicitTls) {
      (socket as unknown as tls.TLSSocket).once('secureConnect', () => resolve(socket));
    } else {
      socket.once('connect', () => resolve(socket));
    }

    socket.once('error', onError);
  });
};

const upgradeToStartTls = async (socket: net.Socket, host: string): Promise<net.Socket> => {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername: host });

    tlsSocket.once('secureConnect', () => {
      resolve(tlsSocket as unknown as net.Socket);
    });

    tlsSocket.once('error', (err) => {
      reject(
        ErrorFactory.createConnectionError('SMTP STARTTLS upgrade failed', {
          host,
          error: err,
        })
      );
    });
  });
};

const createLineReader = (
  socket: net.Socket
): {
  readResponse: () => Promise<SmtpResponse>;
  close: () => void;
} => {
  let buffer = '';
  const waiters: Array<() => void> = [];

  const wake = (): void => {
    while (waiters.length > 0) {
      const w = waiters.shift();
      if (w) w();
    }
  };

  const onData = (data: Buffer): void => {
    buffer += data.toString('utf8');
    wake();
  };

  socket.on('data', onData);

  const tryReadLineFromBuffer = (): string | undefined => {
    const idx = buffer.indexOf('\n');
    if (idx < 0) return undefined;
    const line = buffer.slice(0, idx + 1);
    buffer = buffer.slice(idx + 1);
    return line.replaceAll(/\r?\n$/, '');
  };

  const readLine = async (): Promise<string> => {
    const immediate = tryReadLineFromBuffer();
    if (typeof immediate === 'string') return immediate;
    await new Promise<void>((resolve) => waiters.push(resolve));
    return readLine();
  };

  const readMultiline = async (code: number, message: string): Promise<string> => {
    const line = await readLine();
    const nextCodeStr = line.slice(0, 3);
    const nextCode = Number.parseInt(nextCodeStr, 10);
    const nextMsg = line.length > 4 ? line.slice(4) : '';
    const nextMessage = `${message}\n${nextMsg}`.trim();

    if (Number.isFinite(nextCode) && nextCode === code && line[3] === ' ') return nextMessage;
    return readMultiline(code, nextMessage);
  };

  const readResponse = async (): Promise<SmtpResponse> => {
    const first = await readLine();
    const codeStr = first.slice(0, 3);
    const code = Number.parseInt(codeStr, 10);
    if (!Number.isFinite(code)) {
      throw ErrorFactory.createConnectionError('SMTP: invalid response code', { first });
    }

    let message = first.length > 4 ? first.slice(4) : '';

    // Multiline response: "250-..." then "250 ..."
    if (first[3] === '-') {
      message = await readMultiline(code, message);
    }

    return { code, message };
  };

  const close = (): void => {
    socket.off('data', onData);
  };

  return { readResponse, close };
};

const writeLine = async (socket: net.Socket, line: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\r\n`, (err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const assertCode = (res: SmtpResponse, expected: number | number[], context: string): void => {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(res.code)) {
    throw ErrorFactory.createConnectionError(`SMTP: unexpected response for ${context}`, {
      expected: allowed,
      got: res.code,
      message: res.message,
    });
  }
};

const hasCapability = (res: SmtpResponse, capability: string): boolean => {
  const cap = capability.trim().toUpperCase();
  if (cap === '') return false;
  return res.message
    .split('\n')
    .some(
      (line) => line.trim().toUpperCase().startsWith(cap) || line.trim().toUpperCase().includes(cap)
    );
};

const doEhlo = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>
): Promise<SmtpResponse> => {
  await writeLine(socket, 'EHLO zintrust');
  const res = await reader.readResponse();
  assertCode(res, 250, 'EHLO');
  return res;
};

const doAuthLoginIfNeeded = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>,
  config: SmtpConfig
): Promise<void> => {
  const username = config.username ?? '';
  const password = config.password ?? '';

  const wantsAuth = username.trim() !== '' || password.trim() !== '';
  if (!wantsAuth) return;

  if (username.trim() === '' || password.trim() === '') {
    throw ErrorFactory.createConfigError('SMTP: both MAIL_USERNAME and MAIL_PASSWORD are required');
  }

  await writeLine(socket, 'AUTH LOGIN');
  const auth1 = await reader.readResponse();
  assertCode(auth1, 334, 'AUTH LOGIN');

  await writeLine(socket, toBase64(username));
  const auth2 = await reader.readResponse();
  assertCode(auth2, 334, 'AUTH username');

  await writeLine(socket, toBase64(password));
  const auth3 = await reader.readResponse();
  assertCode(auth3, 235, 'AUTH password');
};

const doMailFrom = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>,
  fromEmail: string
): Promise<void> => {
  await writeLine(socket, `MAIL FROM:<${fromEmail}>`);
  const mailFrom = await reader.readResponse();
  assertCode(mailFrom, [250, 251], 'MAIL FROM');
};

const doRcptToAll = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>,
  recipients: string[]
): Promise<void> => {
  if (recipients.length === 0) {
    throw ErrorFactory.createValidationError('SMTP: missing recipients');
  }

  await recipients.reduce(async (prev, rcpt) => {
    await prev;
    await writeLine(socket, `RCPT TO:<${rcpt}>`);
    const rcptRes = await reader.readResponse();
    assertCode(rcptRes, [250, 251], 'RCPT TO');
  }, Promise.resolve());
};

const doData = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>,
  message: MailMessage
): Promise<void> => {
  await writeLine(socket, 'DATA');
  const dataRes = await reader.readResponse();
  assertCode(dataRes, 354, 'DATA');

  const raw = buildRfc2822Message(message);
  const stuffed = dotStuff(raw);

  await new Promise<void>((resolve, reject) => {
    socket.write(`${stuffed}\r\n.\r\n`, (err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const queued = await reader.readResponse();
  assertCode(queued, 250, 'message body');
};

const doQuit = async (
  socket: net.Socket,
  reader: ReturnType<typeof createLineReader>
): Promise<void> => {
  await writeLine(socket, 'QUIT');
  const quit = await reader.readResponse();
  assertCode(quit, [221, 250], 'QUIT');
};

const buildRfc2822Message = (msg: MailMessage): string => {
  const toList = normalizeRecipients(msg.to);

  const fromNameRaw = msg.from.name;
  const fromName = typeof fromNameRaw === 'string' ? fromNameRaw.trim() : '';
  const fromHeader = fromName === '' ? msg.from.email : `${fromName} <${msg.from.email}>`;

  const toHeader = toList.join(', ');
  const subject = msg.subject;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
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

    // attachments
    for (const a of attachments) {
      const b64 = a.content.toString('base64');
      lines.push(
        `--${mixedBoundary}`,
        `Content-Type: application/octet-stream; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`,
        ''
      );
      // break base64 into 76 char lines per RFC
      for (let i = 0; i < b64.length; i += 76) {
        lines.push(b64.slice(i, i + 76));
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
      // wrap in multipart/mixed
      const mixed = attachParts(msg.attachments, inner);
      return `${headers.join('\r\n')}\r\n\r\n${mixed}`;
    }

    return `${headers.join('\r\n')}\r\n\r\n${inner}`;
  }

  // plain text
  if (msg.attachments && msg.attachments.length > 0) {
    const inner = ['Content-Type: text/plain; charset=utf-8', '', msg.text, ''].join('\r\n');
    const mixed = attachParts(msg.attachments, inner);
    return `${headers.join('\r\n')}\r\n\r\n${mixed}`;
  }

  headers.push('Content-Type: text/plain; charset=utf-8');
  return `${headers.join('\r\n')}\r\n\r\n${msg.text}\r\n`;
};

const dotStuff = (data: string): string =>
  data
    .replaceAll(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');

export const SmtpDriver = Object.freeze({
  /**
   * NOTE: This is a minimal SMTP implementation intended for Node.js runtimes.
   * - `secure=true` means TLS from the start (SMTPS).
   * - `secure='starttls'` performs STARTTLS after EHLO.
   */
  async send(config: SmtpConfig, message: MailMessage): Promise<SendResult> {
    let mode: 'none' | 'tls' | 'starttls' = 'none';
    if (config.secure === true) mode = 'tls';
    if (config.secure === 'starttls') mode = 'starttls';

    let socket = await createSocket(config, mode === 'tls');
    let reader = createLineReader(socket);

    try {
      const greeting = await reader.readResponse();
      assertCode(greeting, 220, 'greeting');

      const ehlo = await doEhlo(socket, reader);

      if (mode === 'starttls') {
        const supportsStartTls = hasCapability(ehlo, 'STARTTLS');

        if (!supportsStartTls) {
          throw ErrorFactory.createConnectionError('SMTP server does not support STARTTLS');
        }

        await writeLine(socket, 'STARTTLS');
        const startTls = await reader.readResponse();
        assertCode(startTls, 220, 'STARTTLS');

        // Swap reader/socket to the upgraded TLS stream
        reader.close();
        socket = await upgradeToStartTls(socket, config.host);
        reader = createLineReader(socket);

        // RFC: EHLO again after STARTTLS
        await doEhlo(socket, reader);
      }

      await doAuthLoginIfNeeded(socket, reader, config);
      await doMailFrom(socket, reader, message.from.email);
      await doRcptToAll(socket, reader, normalizeRecipients(message.to));
      await doData(socket, reader, message);
      await doQuit(socket, reader);

      return { ok: true, provider: 'smtp' };
    } catch (err: unknown) {
      throw ErrorFactory.createConnectionError('SMTP send failed', { error: err });
    } finally {
      reader.close();
      socket.end();
    }
  },
});

export default SmtpDriver;

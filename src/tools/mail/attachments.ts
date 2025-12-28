import { ErrorFactory } from '@exceptions/ZintrustError';

export type DiskAttachment = { disk: string; path: string; filename?: string };
export type InlineAttachment = { content: Buffer | string; filename: string };
export type AttachmentInput = DiskAttachment | InlineAttachment;

export type ResolvedAttachment = { filename: string; content: Buffer };

export type StorageLike = {
  get: (disk: string, path: string) => Promise<Buffer> | Buffer;
  exists?: (disk: string, path: string) => Promise<boolean> | boolean;
  url?: (disk: string, path: string) => string;
};

export async function resolveAttachments(
  attachments: Array<AttachmentInput> | undefined,
  options: { storage?: StorageLike } = {}
): Promise<ResolvedAttachment[]> {
  if (!attachments || attachments.length === 0) return [];

  const storage = options.storage;
  const resolved: ResolvedAttachment[] = [];

  for (const att of attachments) {
    if ('content' in (att as InlineAttachment)) {
      const a = att as InlineAttachment;
      const content = typeof a.content === 'string' ? Buffer.from(a.content) : a.content;
      resolved.push({ filename: a.filename, content });
      continue;
    }

    // Disk-based attachment
    const d = att as DiskAttachment;
    if (!storage) {
      throw ErrorFactory.createValidationError('Storage is required to resolve disk attachments');
    }

    const exists = storage.exists ? await storage.exists(d.disk, d.path) : true;
    if (!exists)
      throw ErrorFactory.createNotFoundError(`Attachment not found: ${d.disk}:${d.path}`);

    const content = await storage.get(d.disk, d.path);
    const filename = d.filename ?? d.path.split('/').pop() ?? 'attachment';
    resolved.push({ filename, content });
  }

  return resolved;
}

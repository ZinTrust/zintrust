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

  const resolveOne = async (att: AttachmentInput): Promise<ResolvedAttachment> => {
    if ('content' in (att as InlineAttachment)) {
      const a = att as InlineAttachment;
      const content = typeof a.content === 'string' ? Buffer.from(a.content) : a.content;
      return { filename: a.filename, content };
    }

    // Disk-based attachment
    const d = att as DiskAttachment;
    if (!storage) {
      throw ErrorFactory.createValidationError('Storage is required to resolve disk attachments');
    }

    const exists = storage.exists ? await Promise.resolve(storage.exists(d.disk, d.path)) : true;
    if (!exists) {
      throw ErrorFactory.createNotFoundError(`Attachment not found: ${d.disk}:${d.path}`);
    }

    const content = await Promise.resolve(storage.get(d.disk, d.path));
    const filename = d.filename ?? d.path.split('/').pop() ?? 'attachment';
    return { filename, content };
  };

  return Promise.all(attachments.map(resolveOne));
}

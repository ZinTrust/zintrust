import type { UploadedFile } from '@http/FileUpload';
import { Request } from '@http/Request';
import { describe, expect, it } from 'vitest';

describe('patch coverage: Request file helpers', () => {
  it('delegates file/files/hasFile/fileUpload to FileUpload handler', () => {
    const rawReq = {
      method: 'POST',
      url: '/upload',
      headers: {
        'content-type': 'multipart/form-data',
      },
    } as any;

    const req = Request.create(rawReq);

    const file: UploadedFile = {
      fieldName: 'avatar',
      originalName: 'a.png',
      mimeType: 'image/png',
      size: 1,
      buffer: Buffer.from('x'),
    };

    req.setBody({ __files: { avatar: [file] } });

    expect(req.hasFile('avatar')).toBe(true);
    expect(req.file('avatar')?.originalName).toBe('a.png');
    expect(req.files('avatar')).toHaveLength(1);

    const handler = req.fileUpload();
    expect(handler.hasFile('avatar')).toBe(true);
  });
});

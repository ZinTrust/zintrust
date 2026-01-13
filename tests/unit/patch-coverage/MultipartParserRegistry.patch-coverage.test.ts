import { MultipartParserRegistry } from '@http/parsers/MultipartParserRegistry';
import { describe, expect, it } from 'vitest';

describe('patch coverage: MultipartParserRegistry', () => {
  it('registers, returns, and clears the provider', async () => {
    MultipartParserRegistry.clear();
    expect(MultipartParserRegistry.has()).toBe(false);
    expect(MultipartParserRegistry.get()).toBeNull();

    const provider = async () => ({ fields: {}, files: {} });
    MultipartParserRegistry.register(provider);

    expect(MultipartParserRegistry.has()).toBe(true);
    expect(MultipartParserRegistry.get()).toBe(provider);

    // sanity: calling provider through get works
    const parsed = await MultipartParserRegistry.get()?.({
      req: {} as any,
      contentType: 'multipart/form-data; boundary=x',
      limits: { maxFileSizeBytes: 1, maxFiles: 1, maxFields: 1, maxFieldSizeBytes: 1 },
    });
    expect(parsed).toEqual({ fields: {}, files: {} });

    MultipartParserRegistry.clear();
    expect(MultipartParserRegistry.has()).toBe(false);
    expect(MultipartParserRegistry.get()).toBeNull();
  });
});

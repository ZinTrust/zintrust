import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ErrorPageRenderer } from '../../src/http/error-pages/ErrorPageRenderer';

const makeReq = (p: string, accept?: string) =>
  ({
    getPath: () => p,
    getHeader: (h: string) => (h === 'accept' ? accept : undefined),
  }) as any;

describe('ErrorPageRenderer', () => {
  it('decides sendHtml correctly for HTML-preferring requests', () => {
    const req = makeReq('/docs', 'text/html');
    expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(true);
  });

  it('does not prefer HTML for API paths', () => {
    const req = makeReq('/api/foo', 'text/html');
    expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(false);
  });

  it('prefers JSON when Accept contains application/json or is empty', () => {
    const req1 = makeReq('/foo', 'application/json');
    expect(ErrorPageRenderer.shouldSendHtml(req1)).toBe(false);

    const req2 = makeReq('/foo', '');
    expect(ErrorPageRenderer.shouldSendHtml(req2)).toBe(false);

    const req3 = makeReq('/foo', '*/*');
    expect(ErrorPageRenderer.shouldSendHtml(req3)).toBe(false);
  });

  it('renders HTML template when template exists', () => {
    const publicRoot = path.join(__dirname, '../fixtures/public');
    const filePath = path.join(publicRoot, 'error-pages', '404.html');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      '<html><body>{{statusCode}} {{errorName}} {{errorMessage}} {{requestPath}}</body></html>'
    );

    const html = ErrorPageRenderer.renderHtml(publicRoot, {
      statusCode: 404,
      errorName: 'Not Found',
      errorMessage: 'Nope',
      requestPath: '/docs',
    });

    expect(typeof html).toBe('string');
    expect(html).toContain('404');
    expect(html).toContain('Not Found');
    expect(html).toContain('Nope');
    expect(html).toContain('/docs');
  });
});

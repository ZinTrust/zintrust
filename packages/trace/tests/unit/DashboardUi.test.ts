import { describe, expect, it } from 'vitest';

import { buildDashboardHtml } from '../../src/dashboard/ui';

describe('buildDashboardHtml', () => {
  it('renders wrapped payload blocks and collapsed html source markup', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain(
      '.code-block.wrap{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}'
    );
    expect(html).toContain('View raw HTML source');
    expect(html.indexOf('html-preview-wrap')).toBeLessThan(html.indexOf('View raw HTML source'));
  });

  it('renders request query entries as collapsible trace items', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain('trace-disclosure');
    expect(html).toContain(
      "renderTraceItems(batchEntriesByType('query'), { collapsible: true, collapsed: true })"
    );
  });

  it('renders mail html before mail text in detail stacks', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');
    const htmlIndex = html.indexOf("renderPayload('Mail Html', content.html)");
    const textIndex = html.indexOf("renderPayload('Mail Text', content.text)");

    expect(htmlIndex).toBeGreaterThan(-1);
    expect(textIndex).toBeGreaterThan(-1);
    expect(htmlIndex).toBeLessThan(textIndex);
  });
});

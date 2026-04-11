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
    expect(html).toContain("queries: renderTraceItems(batchEntriesByType('query'))");
  });

  it('renders request middleware and model tabs with collapsed related entries', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain(
      "{ id: 'middleware', label: 'Middleware', count: batchEntriesByType('middleware').length }"
    );
    expect(html).toContain(
      "{ id: 'models', label: 'Models', count: batchEntriesByType('model').length }"
    );
    expect(html).toContain("middleware: renderTraceItems(batchEntriesByType('middleware'))");
    expect(html).toContain("models: renderTraceItems(batchEntriesByType('model'))");
    expect(html).toContain("renderMetricBox('Route middleware'");
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

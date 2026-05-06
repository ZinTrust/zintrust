import { describe, expect, it } from 'vitest';

import { buildDashboardHtml } from '../../src/dashboard/ui';

describe('buildDashboardHtml', () => {
  it('renders wrapped payload blocks and collapsed html source markup', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain(
      '.code-block.wrap{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}'
    );
    expect(html).toContain('View raw HTML source');
    expect(html).toContain(
      'HTML preview unavailable. The captured payload is plain text, so markup was stripped before trace capture.'
    );
    expect(html.indexOf('html-preview-wrap')).toBeLessThan(html.indexOf('View raw HTML source'));
  });

  it('renders request query entries as collapsible trace items', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain('trace-disclosure');
    expect(html).toContain('trace-summary-icon');
    expect(html).toContain("queries: renderDetailBatchPanel('queries')");
  });

  it('keeps dashboard css out of the runtime script block', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');
    const disclosureIndex = html.indexOf('const DISCLOSURE_ICON = ');
    const jsonPatternIndex = html.indexOf('const JSON_HIGHLIGHT_PATTERN = ');

    expect(html).not.toContain('const DISCLOSURE_ICON = ".panel{');
    expect(disclosureIndex).toBeGreaterThan(-1);
    expect(jsonPatternIndex).toBeGreaterThan(disclosureIndex);
  });

  it('renders request middleware and model tabs with collapsed related entries', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain(
      "{ id: 'middleware', label: 'Middleware', count: resolveDetailBatchCount('middleware') }"
    );
    expect(html).toContain(
      "{ id: 'models', label: 'Models', count: resolveDetailBatchCount('models') }"
    );
    expect(html).toContain("middleware: renderDetailBatchPanel('middleware')");
    expect(html).toContain("models: renderDetailBatchPanel('models')");
    expect(html).toContain("renderMetricBox('Route middleware'");
  });

  it('loads request batch counts first and pages related entries by tab', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain('?countsOnly=true');
    expect(html).toContain('const loadDetailBatchTab = async (tab, page = 1) =>');
    expect(html).toContain('data-action="detail-batch-next"');
  });

  it('renders mail html before mail text in detail stacks', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');
    const htmlIndex = html.indexOf("renderPayload('Mail Html', content.html)");
    const textIndex = html.indexOf("renderPayload('Mail Text', content.text)");

    expect(htmlIndex).toBeGreaterThan(-1);
    expect(textIndex).toBeGreaterThan(-1);
    expect(htmlIndex).toBeLessThan(textIndex);
  });

  it('renders response-status badge classes for request traces', () => {
    const html = buildDashboardHtml('/trace', 'ZinTrust Test App');

    expect(html).toContain('.status-pill.status-2xx');
    expect(html).toContain('.status-pill.status-4xx');
    expect(html).toContain('.status-pill.status-5xx');
    expect(html).toContain('const statusBadgeHtml = (value) =>');
  });
});

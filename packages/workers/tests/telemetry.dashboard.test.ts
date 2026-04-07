import { describe, expect, it } from 'vitest';
import { getDashboardHtml } from '../src/telemetry/routes/dashboard';

describe('workers telemetry dashboard UI', () => {
  it('renders APP_NAME in the title and primary heading', () => {
    const html = getDashboardHtml({
      basePath: '/telemetry',
      autoRefresh: true,
      refreshIntervalMs: 5000,
      appName: 'ZinTrust App',
    });

    expect(html).toContain("<title>ZinTrust ZinTrust App's Telemetry Dashboard</title>");
    expect(html).toContain('<p class="zt-kicker">ZinTrust</p>');
    expect(html).toContain('<h1 class="zt-title">ZinTrust App Telemetry Dashboard</h1>');
  });
});

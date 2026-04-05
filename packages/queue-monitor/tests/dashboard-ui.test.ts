import { describe, expect, it } from 'vitest';
import { getDashboardHtml } from '../src/dashboard-ui';

describe('queue monitor dashboard UI', () => {
  it('includes SSE recovery that resets the page after the stream stays stale', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain('window.location.reload();');
    expect(html).toContain('scheduleDashboardReset');
    expect(html).toContain('markStreamHealthy');
  });

  it('resolves queue selection from the existing queue list instead of blindly trusting the payload queue', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain('const nextQueue = updateQueueSelect(payload.snapshot.queues || []);');
    expect(html).not.toContain('if (payload.queue && payload.queue !== currentQueue)');
  });

  it('includes an All queues selector option and sentinel value in the dashboard script', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain("const ALL_QUEUES = '__all__';");
    expect(html).toContain(
      "text: 'All queues (' + totalWaiting + ' waiting, ' + totalFailed + ' failed)'"
    );
    expect(html).toContain('preferredQueue === ALL_QUEUES');
  });
});

import { describe, expect, it } from 'vitest';
import { getDashboardHtml } from '../src/dashboard-ui';

describe('queue monitor dashboard UI', () => {
  it('renders APP_NAME in the dashboard title and brand block', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
      appName: 'ZinTrust App',
    });

    expect(html).toContain('<title>ZinTrust App Queue Monitor</title>');
    expect(html).toContain("<b>ZinTrust ZinTrust App's</b>");
    expect(html).toContain('<span>Queue Monitor</span>');
  });

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
      "text: 'All queues (' + totalWaiting + ' waiting, ' + totalFailed + ' failed, ' + totalCompleted + ' completed)'"
    );
    expect(html).toContain("text: q.name + ' (' + formatQueueOptionCounts(q.counts) + ')'");
    expect(html).toContain('preferredQueue === ALL_QUEUES');
  });

  it('avoids mutating the queue select while the control has focus', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain('if (document.activeElement === select) {');
    expect(html).not.toContain('option.selected = item.value === nextQueue;');
  });

  it('rebuilds the jobs table from reused row and detail nodes to avoid duplicate expanders', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain('const existingDetailRows = getExistingJobDetailRows(tbody);');
    expect(html).toContain(
      'fragment.appendChild(buildOrUpdateJobDetailRow(job, existingDetailRows.get(jobId)));'
    );
    expect(html).toContain('tbody.replaceChildren(fragment);');
    expect(html).not.toContain('tbody.appendChild(row);');
  });

  it('keys rendered jobs by queue, id, and timestamp so SSE updates do not collapse distinct history entries with the same job id', () => {
    const html = getDashboardHtml({
      basePath: '/queue-monitor',
      autoRefresh: true,
      refreshIntervalMs: 5000,
    });

    expect(html).toContain("const queue = job.queue || currentQueue || '';");
    expect(html).toContain("const id = job.id == null ? '' : String(job.id);");
    expect(html).toContain(
      "const timestamp = Number.isFinite(job.timestamp) ? String(job.timestamp) : '';"
    );
    expect(html).toContain("return queue + '::' + id + '::' + timestamp;");
    expect(html).not.toContain('return String(job.id);');
  });
});

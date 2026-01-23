import { beforeEach, describe, expect, it, vi } from 'vitest';

const add = vi.fn(async () => 'job-id');
const info = vi.fn();

vi.mock('@app/Workers/EmailWorker', () => ({
  EmailQueue: { add },
}));

vi.mock('@config/logger', () => ({
  Logger: { info },
  default: { info },
}));

describe('app/Jobs/EmailJobService', () => {
  beforeEach(() => {
    add.mockClear();
    info.mockClear();
  });

  it('queues password reset emails', async () => {
    const { default: EmailJobService } = await import('@app/Jobs/EmailJobService');

    const jobId = await EmailJobService.sendPasswordReset('alice@example.com', 'token-123');

    expect(jobId).toBe('job-id');
    expect(add).toHaveBeenCalledWith({
      to: 'alice@example.com',
      subject: 'Reset Your Password',
      template: 'password-reset',
      templateData: {
        name: 'alice',
        reset_link: 'https://app.zintrust.com/reset-password?token=token-123',
        action_text: 'Reset Password',
      },
    });
    expect(info).toHaveBeenCalledWith('Password reset email job queued and processed', {
      jobId: 'job-id',
      to: 'alice@example.com',
    });
  });

  it('queues worker alert emails with fallback job id', async () => {
    const { default: EmailJobService } = await import('@app/Jobs/EmailJobService');

    const queueJobId = await EmailJobService.sendWorkerAlert(
      'ops@zintrust.com',
      'email-worker',
      'Boom'
    );

    expect(queueJobId).toBe('job-id');
    expect(add).toHaveBeenCalledWith(
      {
        to: 'ops@zintrust.com',
        subject: 'Worker Alert: email-worker',
        template: 'worker-alert',
        templateData: {
          name: 'ops',
          alert_level: 'ERROR',
          alert_message: 'Worker email-worker encountered an error',
          worker_name: 'email-worker',
          queue_name: 'default',
          job_id: 'unknown',
          error_message: 'Boom',
          dashboard_url: 'https://app.zintrust.com/admin/workers',
        },
      },
      'worker-alerts'
    );
    expect(info).toHaveBeenCalledWith('Worker alert email job queued', {
      queueJobId: 'job-id',
      to: 'ops@zintrust.com',
      workerName: 'email-worker',
    });
  });

  it('queues general emails with custom options', async () => {
    const { default: EmailJobService } = await import('@app/Jobs/EmailJobService');

    const jobId = await EmailJobService.sendGeneral('bob@example.com', 'Heads up', 'Hello', {
      actionUrl: 'https://example.com/action',
      actionText: 'Review',
      primaryColor: '#111111',
    });

    expect(jobId).toBe('job-id');
    expect(add).toHaveBeenCalledWith({
      to: 'bob@example.com',
      subject: 'Heads up',
      template: 'general',
      templateData: {
        name: 'bob',
        headline: 'Heads up',
        message: 'Hello',
        primary_color: '#111111',
        action_url: 'https://example.com/action',
        action_text: 'Review',
      },
    });
    expect(info).toHaveBeenCalledWith('General email job queued', {
      jobId: 'job-id',
      to: 'bob@example.com',
      subject: 'Heads up',
    });
  });

  it('queues custom emails and injects name', async () => {
    const { default: EmailJobService } = await import('@app/Jobs/EmailJobService');

    const jobId = await EmailJobService.sendCustom('sam@example.com', 'Custom', 'custom', {
      topic: 'updates',
    });

    expect(jobId).toBe('job-id');
    expect(add).toHaveBeenCalledWith({
      to: 'sam@example.com',
      subject: 'Custom',
      template: 'custom',
      templateData: {
        topic: 'updates',
        name: 'sam',
      },
    });
    expect(info).toHaveBeenCalledWith('Custom email job queued', {
      jobId: 'job-id',
      to: 'sam@example.com',
      subject: 'Custom',
      template: 'custom',
    });
  });
});

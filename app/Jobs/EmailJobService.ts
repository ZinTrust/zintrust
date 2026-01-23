import { EmailQueue, type EmailJobPayload } from '@app/Workers/EmailWorker';
import Logger from '@config/logger';

const EmailJobService = Object.freeze({
  /**
   * Send a welcome email using worker queue
   */
  async sendWelcome(to: string, userName: string, _queueName: string = 'default'): Promise<string> {
    const payload: EmailJobPayload = {
      to,
      subject: 'Welcome to ZinTrust!',
      template: 'welcome',
      templateData: {
        name: userName,
        action_url: 'https://app.zintrust.com/dashboard',
        action_text: 'Get Started',
      },
    };

    // Queue job for persistence and monitoring
    const jobId = await EmailQueue.add(payload, _queueName);

    // Process immediately for fast delivery
    Logger.info('Welcome email job queued and waiting to be processed', { jobId, to, userName });
    return jobId;
  },

  /**
   * Send a password reset email using the worker queue
   */
  async sendPasswordReset(to: string, resetToken: string): Promise<string> {
    const payload: EmailJobPayload = {
      to,
      subject: 'Reset Your Password',
      template: 'password-reset',
      templateData: {
        name: to.split('@')[0], // Extract username from email
        reset_link: `https://app.zintrust.com/reset-password?token=${resetToken}`,
        action_text: 'Reset Password',
      },
    };

    // Queue job for persistence and monitoring
    const jobId = await EmailQueue.add(payload);

    // Process immediately for fast delivery

    Logger.info('Password reset email job queued and processed', { jobId, to });
    return jobId;
  },

  /**
   * Send a worker alert email using the worker queue
   */
  async sendWorkerAlert(
    to: string,
    workerName: string,
    error: string,
    jobId?: string
  ): Promise<string> {
    const payload: EmailJobPayload = {
      to,
      subject: `Worker Alert: ${workerName}`,
      template: 'worker-alert',
      templateData: {
        name: to.split('@')[0],
        alert_level: 'ERROR',
        alert_message: `Worker ${workerName} encountered an error`,
        worker_name: workerName,
        queue_name: 'default',
        job_id: jobId ?? 'unknown',
        error_message: error,
        dashboard_url: 'https://app.zintrust.com/admin/workers',
      },
    };

    const queueJobId = await EmailQueue.add(payload, 'worker-alerts');
    Logger.info('Worker alert email job queued', { queueJobId, to, workerName });
    return queueJobId;
  },

  /**
   * Send a general notification email using the worker queue
   */
  async sendGeneral(
    to: string,
    subject: string,
    message: string,
    options: {
      actionUrl?: string;
      actionText?: string;
      primaryColor?: string;
    } = {}
  ): Promise<string> {
    const payload: EmailJobPayload = {
      to,
      subject,
      template: 'general',
      templateData: {
        name: to.split('@')[0],
        headline: subject,
        message,
        primary_color: options.primaryColor ?? '#3b82f6',
        action_url: options.actionUrl ?? null,
        action_text: options.actionText ?? 'View Details',
      },
    };

    const jobId = await EmailQueue.add(payload);
    Logger.info('General email job queued', { jobId, to, subject });
    return jobId;
  },

  /**
   * Send a custom email with any template
   */
  async sendCustom(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>
  ): Promise<string> {
    const payload: EmailJobPayload = {
      to,
      subject,
      template,
      templateData: {
        ...templateData,
        name: Object.hasOwn(templateData, 'name') ? String(templateData['name']) : to.split('@')[0],
      },
    };

    const jobId = await EmailQueue.add(payload);
    Logger.info('Custom email job queued', { jobId, to, subject, template });
    return jobId;
  },
});

export default EmailJobService;

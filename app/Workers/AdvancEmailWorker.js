import { generateUuid, Logger, Mail, Queue } from '@zintrust/core';
import { createQueueWorker } from '@zintrust/workers';

const isJob = (arg) => 'data' in arg && typeof arg.data !== 'undefined';

const buildBaseVariables = (payload, jobId) => {
  const { to, subject } = payload;

  return {
    email: to ?? 'test@zintrust.com',
    subject: subject ?? 'Worker Notification',
    processed_at: new Date().toISOString(),
    job_id: jobId,
    timestamp: new Date().toISOString(),
    status: 'success',
  };
};

const buildTemplateWithCustomData = (payload, baseVars) => ({
  template: payload.template || 'general',
  variables: {
    ...baseVars,
    ...payload.templateData,
  },
});

const buildTemplateWithDefaultData = (payload, baseVars) => {
  const { subject, body } = payload;

  return {
    template: payload.template || 'general',
    variables: {
      ...baseVars,
      headline: subject ?? 'Worker Notification',
      message: body ?? 'Worker job completed successfully.',
      primary_color: '#3b82f6',
    },
  };
};

const buildGeneralTemplate = (payload, baseVars) => {
  const { subject, body } = payload;

  return {
    template: 'general',
    variables: {
      ...baseVars,
      headline: subject ?? 'Worker Job Completed',
      message: body ?? 'Worker job has been processed successfully.',
      primary_color: '#3b82f6',
      action_url: payload.templateData?.['action_url'] ?? null,
      action_text: payload.templateData?.['action_text'] ?? 'View Details',
    },
  };
};

const buildTemplateVariables = (payload, jobId) => {
  const baseVars = buildBaseVariables(payload, jobId);

  if (payload.template !== null && payload.template !== undefined && payload.templateData) {
    return buildTemplateWithCustomData(payload, baseVars);
  }

  if (payload.template !== null && payload.template !== undefined) {
    return buildTemplateWithDefaultData(payload, baseVars);
  }

  return buildGeneralTemplate(payload, baseVars);
};

const sendEmail = async (payload, selectedTemplate, templateVars) => {
  const { to, subject, body } = payload;

  const htmlContent = await Mail.render({
    template: selectedTemplate,
    variables: templateVars,
  });

  const result = await Mail.send({
    to: to ?? 'test@zintrust.com',
    subject: subject ?? 'Worker Notification from ZinTrust',
    text: body ?? 'Worker job completed successfully.',
    html: htmlContent,
    from: {
      address: 'no-reply@engage.vizo.app',
      name: 'ZinTrust Advanced Worker',
    },
  });

  Logger.info('Advanced email sent', {
    template: selectedTemplate,
    to: to ?? 'test@zintrust.com',
    messageId: result.messageId,
    driver: result.driver,
    ok: result.ok,
  });
};

const processAdvancedEmailJob = async (arg) => {
  const payload = isJob(arg) ? arg.data : arg;

  const jobId =
    'id' in arg && typeof arg.id === 'string'
      ? arg.id
      : `adv-email-${Date.now()}-${generateUuid()}`;

  Logger.info('Processing advanced email job', {
    jobId,
    to: payload.to,
    subject: payload.subject,
    template: payload.template,
  });

  try {
    const { template: selectedTemplate, variables: templateVars } = buildTemplateVariables(
      payload,
      jobId
    );

    if (payload.uniqueId !== undefined) {
      Logger.info('Advanced job uniqueId provided', {
        uniqueId: payload.uniqueId,
        uniqueVia: payload.uniqueVia,
        deduplication: payload.deduplication,
      });
    }

    await sendEmail(payload, selectedTemplate, templateVars);
  } catch (error) {
    Logger.error('Advanced email send failed', {
      jobId,
      to: payload.to ?? 'test@zintrust.com',
      template: payload.template ?? 'general',
      error,
    });

    throw error;
  }
};

const advancedWorkerOptions = {
  kindLabel: 'Advanced Email Job',
  defaultQueueName: 'advanced-queue',
  maxAttempts: 3,
  getLogFields: (payload) => ({
    to: payload.to,
    subject: payload.subject,
    template: payload.template ?? 'general',
  }),
  handle: processAdvancedEmailJob,
};

export const AdvancEmailWorker = createQueueWorker(advancedWorkerOptions);

export const AdvancEmailQueue = {
  async add(payload, queueName = 'advanced-queue', options) {
    const queuePayload = {
      ...payload,
      ...options,
      timestamp: Date.now(),
      attempts: 0,
    };
    Logger.info('queuePayload :', queuePayload);

    return Queue.enqueue(queueName, queuePayload);
  },

  async processOne(queueName = 'advanced-queue') {
    return AdvancEmailWorker.processOne(queueName);
  },

  async processAll(queueName = 'advanced-queue') {
    return AdvancEmailWorker.processAll(queueName);
  },

  async start(queueName = 'advanced-queue') {
    void AdvancEmailWorker.startWorker({ queueName });
  },
};

export const AdvancEmailWorkerInstance = AdvancEmailWorker;

export default async function advancedEmailJobProcessor(job) {
  await processAdvancedEmailJob(job);
}

export const ZinTrustProcessor = async (job) => {
  await processAdvancedEmailJob(job);
};

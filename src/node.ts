import process from '@node-singletons/process';

export { cleanOnce, FileLogWriter } from '@config/FileLogWriter';

export { listTemplates, loadTemplate, renderTemplate } from '@mail/templates/markdown';
export { MailFake } from '@mail/testing';

export { FakeStorage } from '@tools/storage/testing';

export {
  listTemplates as listNotificationTemplates,
  loadTemplate as loadNotificationTemplate,
  renderTemplate as renderNotificationTemplate,
} from '@notification/templates/markdown';

export { process };
export default process;

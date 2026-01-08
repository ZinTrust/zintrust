// Runtime marker to make this re-export-only module coverable in V8 coverage.
const __coverageMarker = true;
void __coverageMarker;

export { default, default as process } from '@node-singletons/process';

export { FileLogWriter, cleanOnce } from '@config/FileLogWriter';

export { listTemplates, loadTemplate, renderTemplate } from '@mail/templates/markdown';
export { MailFake } from '@mail/testing';

export { FakeStorage } from '@tools/storage/testing';

export {
  listTemplates as listNotificationTemplates,
  loadTemplate as loadNotificationTemplate,
  renderTemplate as renderNotificationTemplate,
} from '@notification/templates/markdown';

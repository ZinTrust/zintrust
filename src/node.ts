import { Logger } from '@config/logger';
// Runtime marker to make this re-export-only module coverable in V8 coverage.
const __coverageMarker = true;
if (__coverageMarker !== true) {
  throw Logger.error('Unreachable');
}

export { default, default as process } from '@node-singletons/process';

export { cleanOnce, FileLogWriter } from '@config/FileLogWriter';

export { listTemplates, loadTemplate, renderTemplate } from '@mail/templates/markdown';
export { MailFake } from '@mail/testing';

export { FakeStorage } from '@tools/storage/testing';

export { TestEnvironment, TestHttp } from '@/testing/index';
export type {
  ITestEnvironment,
  TestEnvironmentOptions,
  TestHeaders,
  TestHttpRequestInput,
  TestHttpResponseRecorder,
  TestRequestInput,
  TestResponse,
} from '@/testing/index';

export {
  listTemplates as listNotificationTemplates,
  loadTemplate as loadNotificationTemplate,
  renderTemplate as renderNotificationTemplate,
} from '@notification/templates/markdown';

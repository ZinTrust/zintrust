import { Logger } from '@config/logger';
// Runtime marker to make this re-export-only module coverable in V8 coverage.
const __coverageMarker = true;
if (__coverageMarker !== true) {
  throw Logger.error('Unreachable');
}

export * as crypto from '@node-singletons/crypto';
export * as fs from '@node-singletons/fs';
export * as path from '@node-singletons/path';
export { performance } from '@node-singletons/perf-hooks';
export { default, default as process } from '@node-singletons/process';
export * as url from '@node-singletons/url';

export { cleanOnce, FileLogWriter } from '@config/FileLogWriter';

export { listTemplates, loadTemplate, renderTemplate } from '@mail/templates';
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

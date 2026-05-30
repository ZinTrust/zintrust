/**
 * HTTP Runtime Exports
 * Provides HTTP request/response types and routing utilities
 */

export type {
  FileUploadOptions,
  IFileUploadHandler,
  IRequest,
  IResponse,
  IRouter,
  Middleware,
  MultipartParserProvider,
  RouteMeta,
  RouteOptions,
  RouteRegistration,
  ValidatedRequest,
} from '@zintrust/core/runtime';

export { Router } from '@core-routes/Router';

export type { IRouter as IRouterType } from '@core-routes/Router';

export type { UploadedFile } from '@http/FileUpload';
export { MultipartParserRegistry } from '@http/parsers/MultipartParserRegistry';
export type {
  MultipartFieldValue,
  MultipartParseInput,
  ParsedMultipartData,
} from '@http/parsers/MultipartParserRegistry';

export { MIME_TYPES } from '@config/constants';
export { AssetsBinding } from '@config/type';

export { getValidatedBody } from '@http/ValidationHelper';

/**
 * ZinTrust Security - Security primitives and crypto utilities
 * Contains authentication, encryption, hashing, JWT, and security helpers
 */

// Device store for bulletproof auth
export { BulletproofDeviceStore } from '@security/BulletproofDeviceStore';

// CSRF protection
export { CsrfTokenManager } from '@security/CsrfTokenManager';
export type {
  CsrfTokenData,
  CsrfTokenManagerType,
  ICsrfTokenManager,
} from '@security/CsrfTokenManager';

// Encryption
export { EncryptedEnvelope } from '@security/EncryptedEnvelope';
export { Encryptor } from '@security/Encryptor';

// Hashing
export { Hash } from '@security/Hash';

// JWT management
export { JwtManager } from '@security/JwtManager';
export type {
  IJwtManager,
  JwtAlgorithm,
  JwtManagerType,
  JwtOptions,
  JwtPayload,
} from '@security/JwtManager';
export { JwtSessions } from '@security/JwtSessions';
export { JwtVerifier } from '@security/JwtVerifier';
export type {
  JwtVerifierAlgorithm,
  JwtVerifierFailure,
  JwtVerifierFailureReason,
  JwtVerifierJwk,
  JwtVerifierJwksDocument,
  JwtVerifierResult,
  JwtVerifierSuccess,
  JwtVerifierWithJwkInput,
  JwtVerifierWithJwksInput,
} from '@security/JwtVerifier';

// Password reset tokens
export { PasswordResetTokenBroker } from '@security/PasswordResetTokenBroker';
export type {
  IPasswordResetTokenBroker,
  IPasswordResetTokenStore,
  PasswordResetTokenBrokerOptions,
  PasswordResetTokenBrokerType,
  PasswordResetTokenRecord,
} from '@security/PasswordResetTokenBroker';

// Sanitization
export { createSanitizer, Sanitizer, type SanitizerType } from '@security/Sanitizer';

// Token revocation
export { TokenRevocation } from '@security/TokenRevocation';

// XSS protection
export { Xss } from '@security/Xss';
export { XssProtection } from '@security/XssProtection';

// Secure payload handling
export {
  SecurePayload,
  type SecurePayloadCoercionShape,
  type SecurePayloadCoercionType,
  type SecurePayloadDecodeOptions,
  type SecurePayloadDecryptor,
  type SecurePayloadPipeline,
  type SecurePayloadPipelineIssue,
  type SecurePayloadPipelineStage,
} from '@security/SecurePayload';

export { RemoteSignedJson } from '@common/RemoteSignedJson';
export type { RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
export type { SanitizerError } from '@exceptions/ZintrustError';
export { SignedRequest } from '@security/SignedRequest';

import { describe, expect, it } from 'vitest';

import {
  CsrfTokenManager,
  type CsrfTokenManagerType,
  type ICsrfTokenManager,
  type IJwtManager,
  type ISchema,
  type JwtAlgorithm,
  JwtManager,
  type JwtManagerType,
  Schema,
  type SchemaType,
  Validator,
  XssProtection,
} from '@/index';

describe('core public exports (security + validation)', () => {
  it('exports CSRF types and namespace', () => {
    expect(CsrfTokenManager).toBeDefined();
    expect(typeof CsrfTokenManager.create).toBe('function');

    // Type-level assertions: compile-time only.
    const _csrfNs: CsrfTokenManagerType = CsrfTokenManager;
    const _csrfMgr: ICsrfTokenManager = _csrfNs.create();
    expect(typeof _csrfMgr.generateToken).toBe('function');
  });

  it('exports JWT types and namespace', () => {
    expect(JwtManager).toBeDefined();
    expect(typeof JwtManager.create).toBe('function');

    const _jwtNs: JwtManagerType = JwtManager;
    const _jwtMgr: IJwtManager = _jwtNs.create();
    expect(typeof _jwtMgr.sign).toBe('function');

    const _alg: JwtAlgorithm = 'HS256';
    expect(_alg).toBe('HS256');
  });

  it('exports Schema/Validator types and namespaces', () => {
    expect(Schema).toBeDefined();
    expect(typeof Schema.create).toBe('function');

    const _schemaNs: SchemaType = Schema;
    const _schema: ISchema = _schemaNs.create();
    expect(typeof _schema.required).toBe('function');

    expect(Validator).toBeDefined();
    expect(typeof Validator.validate).toBe('function');
  });

  it('exports XssProtection namespace', () => {
    expect(XssProtection).toBeDefined();
    expect(typeof XssProtection.escape).toBe('function');
    expect(typeof XssProtection.sanitize).toBe('function');
  });
});

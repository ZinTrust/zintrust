import { describe, expect, it } from 'vitest';
import { ErrorResponse } from '@/http/ErrorResponse';

describe('ErrorResponse', () => {
  it('creates error objects with and without stack', () => {
    const e1 = ErrorResponse.internalServerError('Oops', 'rid');
    expect(e1.statusCode).toBe(500);
    expect(e1.code).toBe('INTERNAL_SERVER_ERROR');
    expect(e1.requestId).toBe('rid');
    expect(typeof e1.timestamp).toBe('string');

    const e2 = ErrorResponse.internalServerError('Oops', 'rid', 'stacktrace');
    expect(e2.stack).toBe('stacktrace');

    const nf = ErrorResponse.notFound('User', 'rid2');
    expect(nf.statusCode).toBe(404);
    expect(nf.message).toContain('User');

    const br = ErrorResponse.badRequest('bad', 'rid3', { field: 'x' });
    expect(br.details).toEqual({ field: 'x' });

    expect(ErrorResponse.unauthorized('nope', 'rid4').statusCode).toBe(401);
    expect(ErrorResponse.forbidden('nope', 'rid5').statusCode).toBe(403);
    expect(ErrorResponse.conflict('nope', 'rid6').statusCode).toBe(409);
    expect(ErrorResponse.serviceUnavailable(undefined, 'rid7').statusCode).toBe(503);
  });
});

import { describe, expect, it } from 'vitest';

describe('mail templates coverage', () => {
  it('should import auth-password-reset template', async () => {
    const template = await import('@/tools/mail/templates/auth-password-reset');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import auth-welcome template', async () => {
    const template = await import('@/tools/mail/templates/auth-welcome');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import general template', async () => {
    const template = await import('@/tools/mail/templates/general');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import job-completed template', async () => {
    const template = await import('@/tools/mail/templates/job-completed');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import notifications-new-comment template', async () => {
    const template = await import('@/tools/mail/templates/notifications-new-comment');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import password-reset template', async () => {
    const template = await import('@/tools/mail/templates/password-reset');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import performance-report template', async () => {
    const template = await import('@/tools/mail/templates/performance-report');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import welcome template', async () => {
    const template = await import('@/tools/mail/templates/welcome');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });

  it('should import worker-alert template', async () => {
    const template = await import('@/tools/mail/templates/worker-alert');
    expect(template.default).toBeDefined();
    expect(typeof template.default).toBe('string');
  });
});

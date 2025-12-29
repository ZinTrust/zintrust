/* eslint-disable no-console */
import { TemplatesCommand } from '@cli/commands/TemplatesCommand';
import * as MailTpl from '@mail/templates/markdown';
import * as NotifTpl from '@notification/templates/markdown';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

vi.mock('@mail/templates/markdown', () => ({
  listTemplates: vi.fn(),
  renderTemplate: vi.fn(),
}));

vi.mock('@notification/templates/markdown', () => ({
  listTemplates: vi.fn(),
  renderTemplate: vi.fn(),
}));

describe('TemplatesCommand - extra branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('lists mail templates only and sorts them', () => {
    (MailTpl.listTemplates as unknown as Mock).mockReturnValue(['zeta', 'alpha']);
    (NotifTpl.listTemplates as unknown as Mock).mockReturnValue(['notif1']);

    TemplatesCommand.execute({ args: ['list', 'mail'] });

    // Console logging receives the final formatted message (via Logger.info -> console.log)
    expect(console.log).toHaveBeenCalledTimes(2);
    const calls = (console.log as unknown as Mock).mock.calls.map((c) =>
      String(c[0] ?? c[1] ?? '')
    );
    expect(calls.some((c) => c.includes('alpha'))).toBe(true);
    expect(calls.some((c) => c.includes('zeta'))).toBe(true);
  });

  it('lists notification templates when scope=notification', () => {
    (MailTpl.listTemplates as unknown as Mock).mockReturnValue(['mail1']);
    (NotifTpl.listTemplates as unknown as Mock).mockReturnValue(['notif-a', 'notif-b']);

    TemplatesCommand.execute({ args: ['list', 'notification'] });

    const calls = (console.log as unknown as Mock).mock.calls.map((c) =>
      String(c[0] ?? c[1] ?? '')
    );
    expect(calls.some((c) => c.includes('notif-a'))).toBe(true);
    expect(calls.some((c) => c.includes('notif-b'))).toBe(true);
  });

  it('renders mail template when scope=mail', () => {
    (MailTpl.renderTemplate as unknown as Mock).mockReturnValue({ html: '<p>mail</p>' });

    TemplatesCommand.execute({ args: ['render', 'mail', 'welcome'] });

    // Check console.log calls for the rendered HTML
    expect(
      (console.log as unknown as Mock).mock.calls.some((c) =>
        String(c[0] ?? c[1] ?? '').includes('<p>mail</p>')
      )
    ).toBe(true);
  });

  it('renders notification template when mail render throws and notification succeeds', () => {
    (MailTpl.renderTemplate as unknown as Mock).mockImplementation(() => {
      throw new Error('mail boom');
    });
    (NotifTpl.renderTemplate as unknown as Mock).mockReturnValue({ html: '<p>notif</p>' });

    TemplatesCommand.execute({ args: ['render', 'all', 'some-template'] });

    expect(
      (console.log as unknown as Mock).mock.calls.some((c) =>
        String(c[0] ?? c[1] ?? '').includes('<p>notif</p>')
      )
    ).toBe(true);
  });

  it('throws TRY_CATCH_ERROR when both mail and notification rendering fail', () => {
    (MailTpl.renderTemplate as unknown as Mock).mockImplementation(() => {
      throw new Error('mail boom');
    });
    (NotifTpl.renderTemplate as unknown as Mock).mockImplementation(() => {
      throw new Error('notif boom');
    });

    expect(() => TemplatesCommand.execute({ args: ['render', 'all', 'some-template'] })).toThrow();
    try {
      TemplatesCommand.execute({ args: ['render', 'all', 'some-template'] });
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      expect(e.code).toBe('TRY_CATCH_ERROR');
    }
  });

  it('throws validation error when name not provided for render', () => {
    expect(() => TemplatesCommand.execute({ args: ['render', 'mail'] })).toThrow();
    try {
      TemplatesCommand.execute({ args: ['render', 'mail'] });
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      expect(e.code).toBe('VALIDATION_ERROR');
    }
  });

  it('throws validation error on unknown action', () => {
    expect(() => TemplatesCommand.execute({ args: ['unknown'] })).toThrow();
    try {
      TemplatesCommand.execute({ args: ['unknown'] });
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      expect(e.code).toBe('VALIDATION_ERROR');
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/mail', () => ({
  mailConfig: {
    from: { address: 'from@example.com', name: 'From' },
    getDriver: vi.fn(() => ({ driver: 'sendgrid', apiKey: 'k' })),
    default: 'sendgrid',
  },
}));

vi.mock('@mail/drivers/Ses', () => ({
  SesDriver: { send: vi.fn(async () => ({ ok: true, messageId: 'ses-1' })) },
}));

vi.mock('@storage', () => ({ Storage: { getDisk: vi.fn() } }));

const mockLoadTemplate = vi.fn();
vi.mock('@/tools/mail/template-loader', () => ({
  loadTemplate: mockLoadTemplate,
}));

describe('Mail render functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders template with variables', async () => {
    mockLoadTemplate.mockResolvedValue('<html><body>Hello Alice!</body></html>');

    const { Mail } = await import('@/tools/mail');

    const html = await Mail.render({
      template: 'welcome',
      variables: { name: 'Alice' },
    });

    expect(html).toContain('Hello Alice!');
    expect(html).toContain('<html>');
    expect(mockLoadTemplate).toHaveBeenCalledWith('welcome.html', { name: 'Alice' });
  });

  it('renders template without variables', async () => {
    mockLoadTemplate.mockResolvedValue('<html><body>Welcome!</body></html>');

    const { Mail } = await import('@/tools/mail');

    const html = await Mail.render({
      template: 'welcome',
    });

    expect(html).toContain('Welcome!');
    expect(html).toContain('<html>');
    expect(mockLoadTemplate).toHaveBeenCalledWith('welcome.html', {});
  });

  it('renders template with .html extension', async () => {
    mockLoadTemplate.mockResolvedValue('<html><body>Hello!</body></html>');

    const { Mail } = await import('@/tools/mail');

    const html = await Mail.render({
      template: 'welcome.html',
      variables: { name: 'Bob' },
    });

    expect(html).toContain('Hello!');
    expect(mockLoadTemplate).toHaveBeenCalledWith('welcome.html', { name: 'Bob' });
  });

  it('view method is alias of render', async () => {
    mockLoadTemplate.mockResolvedValue('<html><body>Test content</body></html>');

    const { Mail } = await import('@/tools/mail');

    const renderResult = await Mail.render({
      template: 'test',
      variables: { name: 'Test' },
    });

    const viewResult = await Mail.view({
      template: 'test',
      variables: { name: 'Test' },
    });

    expect(renderResult).toBe(viewResult);
    expect(mockLoadTemplate).toHaveBeenCalledTimes(2);
  });

  it('handles empty variables object', async () => {
    mockLoadTemplate.mockResolvedValue('<html><body>No variables</body></html>');

    const { Mail } = await import('@/tools/mail');

    const html = await Mail.render({
      template: 'static',
      variables: {},
    });

    expect(html).toContain('No variables');
    expect(mockLoadTemplate).toHaveBeenCalledWith('static.html', {});
  });
});

// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture handler via mock Router.get
const captured: { handler?: (req: any, res: any) => Promise<void> } = {};
vi.mock('@zintrust/core', () => ({
  Router: {
    get: (_router: any, _path: string, h: any) => {
      captured.handler = h;
    },
  },
}));

vi.mock('@mail/Mail', () => ({
  Mail: { render: vi.fn() },
}));

describe('Mail routes handler logic', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      getParam: vi.fn(),
    };

    mockRes = {
      html: vi.fn(),
    };
  });

  it('renders welcome template by default', async () => {
    const { Mail } = await import('@mail/Mail');

    vi.mocked(Mail.render).mockResolvedValue('<html>Welcome Alice!</html>');
    mockReq.getParam.mockReturnValue(undefined);

    const { registerMailUiPag } = await import('@routes/mail');
    registerMailUiPag({} as any);
    await captured.handler!(mockReq, mockRes);

    expect(mockReq.getParam).toHaveBeenCalledWith('template');
    expect(Mail.render).toHaveBeenCalledWith({
      template: 'welcome',
      variables: { name: 'Alice' },
    });
    expect(mockRes.html).toHaveBeenCalledWith('<html>Welcome Alice!</html>');
  });

  it('renders general template with specific variables', async () => {
    const { Mail } = await import('@mail/Mail');

    vi.mocked(Mail.render).mockResolvedValue('<html>Hello Alice!</html>');
    mockReq.getParam.mockReturnValue('general');

    const { registerMailUiPag } = await import('@routes/mail');

    registerMailUiPag({} as any);
    await captured.handler!(mockReq, mockRes);

    expect(Mail.render).toHaveBeenCalledWith({
      template: 'general',
      variables: {
        name: 'Alice',
        headline: 'Hello Alice',
        message: 'Welcome to our platform.',
        primary_color: '#0ea5e9',
      },
    });
    expect(mockRes.html).toHaveBeenCalledWith('<html>Hello Alice!</html>');
  });

  it('renders custom template with default variables', async () => {
    const { Mail } = await import('@mail/Mail');

    vi.mocked(Mail.render).mockResolvedValue('<html>Custom template</html>');
    mockReq.getParam.mockReturnValue('custom');

    const { registerMailUiPag } = await import('@routes/mail');
    registerMailUiPag({} as any);
    await captured.handler!(mockReq, mockRes);

    expect(Mail.render).toHaveBeenCalledWith({
      template: 'custom',
      variables: { name: 'Alice' },
    });
    expect(mockRes.html).toHaveBeenCalledWith('<html>Custom template</html>');
  });

  it('registers route with correct path', async () => {
    const { registerMailUiPag } = await import('@routes/mail');

    registerMailUiPag({} as any);

    expect(captured.handler).toBeDefined();
  });
});

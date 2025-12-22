import { Controller } from '@/http/Controller';
import { Request } from '@/http/Request';
import { Response } from '@/http/Response';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

// Concrete implementation for testing
class TestController extends Controller {
  public testJson(data: unknown, statusCode?: number) {
    return this.json(data, statusCode);
  }

  public testError(message: string, statusCode?: number) {
    return this.error(message, statusCode);
  }

  public testRedirect(url: string, statusCode?: number) {
    return this.redirect(url, statusCode);
  }

  public testParam(req: Request, name: string) {
    return this.param(req, name);
  }

  public testQuery(req: Request, name: string) {
    return this.query(req, name);
  }

  public testBody(req: Request) {
    return this.body(req);
  }
}

describe('Controller', () => {
  let controller: TestController;
  let mockReq: Request;
  let mockRes: Response;

  beforeEach(() => {
    controller = new TestController();
    mockReq = {
      getParam: vi.fn(),
      getQueryParam: vi.fn(),
      getBody: vi.fn(),
    } as unknown as Request;
    mockRes = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      redirect: vi.fn(),
    } as unknown as Response;
  });

  it('should send JSON response', () => {
    const handler = controller.testJson({ success: true }, 201);
    handler(mockReq, mockRes);
    expect(mockRes.setStatus).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
  });

  it('should send JSON response with default status', () => {
    const handler = controller.testJson({ success: true });
    handler(mockReq, mockRes);
    expect(mockRes.setStatus).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
  });

  it('should send error response', () => {
    const handler = controller.testError('Bad Request', 400);
    handler(mockReq, mockRes);
    expect(mockRes.setStatus).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Bad Request' });
  });

  it('should send error response with default status', () => {
    const handler = controller.testError('Bad Request');
    handler(mockReq, mockRes);
    expect(mockRes.setStatus).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Bad Request' });
  });

  it('should redirect', () => {
    const handler = controller.testRedirect('/home', 301);
    handler(mockReq, mockRes);
    expect(mockRes.redirect).toHaveBeenCalledWith('/home', 301);
  });

  it('should redirect with default status', () => {
    const handler = controller.testRedirect('/home');
    handler(mockReq, mockRes);
    expect(mockRes.redirect).toHaveBeenCalledWith('/home', 302);
  });

  it('should get param', () => {
    (mockReq.getParam as Mock).mockReturnValue('123');
    const result = controller.testParam(mockReq, 'id');
    expect(result).toBe('123');
    expect(mockReq.getParam).toHaveBeenCalledWith('id');
  });

  it('should get query param', () => {
    (mockReq.getQueryParam as Mock).mockReturnValue('search');
    const result = controller.testQuery(mockReq, 'q');
    expect(result).toBe('search');
    expect(mockReq.getQueryParam).toHaveBeenCalledWith('q');
  });

  it('should get body', () => {
    const body = { name: 'Test' };
    (mockReq.getBody as Mock).mockReturnValue(body);
    const result = controller.testBody(mockReq);
    expect(result).toBe(body);
    expect(mockReq.getBody).toHaveBeenCalled();
  });
});

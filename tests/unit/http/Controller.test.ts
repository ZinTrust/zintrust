import { Controller } from '@/http/Controller';
import { type IRequest } from '@/http/Request';
import { type IResponse } from '@/http/Response';
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('Controller', () => {
  let mockReq: IRequest;
  let mockRes: IResponse;

  beforeEach(() => {
    mockReq = {
      getParam: vi.fn(),
      getQueryParam: vi.fn(),
      getBody: vi.fn(),
    } as unknown as IRequest;
    
    mockRes = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      redirect: vi.fn(),
    } as unknown as IResponse;
  });

  it('should send JSON response', () => {
    const data = { foo: 'bar' };
    Controller.json(mockRes, data, 201);
    expect(mockRes.setStatus).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(data);
  });

  it('should send error response', () => {
    const message = 'Error message';
    Controller.error(mockRes, message, 404);
    expect(mockRes.setStatus).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: message });
  });

  it('should redirect', () => {
    const url = '/new-url';
    Controller.redirect(mockRes, url, 301);
    expect(mockRes.redirect).toHaveBeenCalledWith(url, 301);
  });

  it('should get route parameter', () => {
    vi.mocked(mockReq.getParam).mockReturnValue('value');
    const result = Controller.param(mockReq, 'id');
    expect(mockReq.getParam).toHaveBeenCalledWith('id');
    expect(result).toBe('value');
  });

  it('should get query parameter', () => {
    vi.mocked(mockReq.getQueryParam).mockReturnValue('value');
    const result = Controller.query(mockReq, 'search');
    expect(mockReq.getQueryParam).toHaveBeenCalledWith('search');
    expect(result).toBe('value');
  });

  it('should get request body', () => {
    const body = { foo: 'bar' };
    vi.mocked(mockReq.getBody).mockReturnValue(body);
    const result = Controller.body(mockReq);
    expect(mockReq.getBody).toHaveBeenCalled();
    expect(result).toBe(body);
  });
});

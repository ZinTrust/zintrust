import { Response } from '@/http/Response';
import * as http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Response', () => {
  let mockRes: http.ServerResponse;
  let response: Response;

  beforeEach(() => {
    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    response = new Response(mockRes);
  });

  it('should set default content type to JSON', () => {
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });

  it('should set status code', () => {
    response.setStatus(201);
    expect(response.getStatus()).toBe(201);
    expect(response.statusCode).toBe(201);
    expect(mockRes.statusCode).toBe(201);
  });

  it('should set and get header', () => {
    response.setHeader('X-Custom', 'Value');
    expect(response.getHeader('X-Custom')).toBe('Value');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Custom', 'Value');
  });

  it('should send JSON response', () => {
    const data = { message: 'success' };
    response.json(data);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(data));
  });

  it('should send text response', () => {
    const text = 'Hello World';
    response.text(text);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.end).toHaveBeenCalledWith(text);
  });

  it('should send HTML response', () => {
    const html = '<h1>Hello</h1>';
    response.html(html);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
    expect(mockRes.end).toHaveBeenCalledWith(html);
  });

  it('should send raw response', () => {
    const data = 'raw data';
    response.send(data);
    expect(mockRes.end).toHaveBeenCalledWith(data);
  });

  it('should redirect', () => {
    response.redirect('/new-location');
    expect(response.getStatus()).toBe(302);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Location', '/new-location');
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should redirect with custom status code', () => {
    response.redirect('/new-location', 301);
    expect(response.getStatus()).toBe(301);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Location', '/new-location');
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should get raw response object', () => {
    expect(response.getRaw()).toBe(mockRes);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@config/logger');
vi.mock('@security/UrlValidator', () => ({
  validateUrl: vi.fn(),
}));

import { HealthCheckHandler } from '@/microservices/ServiceHealthMonitor';

describe('ServiceHealthMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('HealthCheckHandler', () => {
    let handler: any;
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      handler = HealthCheckHandler.create('test-service', '1.0.0', 3000, 'localhost');
      mockReq = {} as any;
      mockRes = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as any;
    });

    it('should return 200 status for healthy service', async () => {
      await handler.handle(mockReq, mockRes);

      expect(mockRes.setStatus).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});

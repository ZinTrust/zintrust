import { microservicesConfig } from '@/config/microservices';
import { describe, expect, it } from 'vitest';

describe('Microservices Config', () => {
  it('should have correct properties', () => {
    expect(microservicesConfig.enabled).toBeDefined();
    expect(microservicesConfig.services).toBeInstanceOf(Array);
    expect(microservicesConfig.discovery).toBeDefined();
    expect(microservicesConfig.registry).toBeDefined();
    expect(microservicesConfig.auth).toBeDefined();
    expect(microservicesConfig.tracing).toBeDefined();
    expect(microservicesConfig.database).toBeDefined();
    expect(microservicesConfig.healthCheck).toBeDefined();
    expect(microservicesConfig.communication).toBeDefined();
    expect(microservicesConfig.mesh).toBeDefined();
  });
});

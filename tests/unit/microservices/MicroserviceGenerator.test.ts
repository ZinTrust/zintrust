import { generate } from '@/microservices/MicroserviceGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');
vi.mock('@config/logger');

describe('MicroserviceGenerator', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should generate microservices structure', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    await generate({
      domain: 'test-domain',
      services: ['service1', 'service2'],
      basePort: 4000,
      version: '1.0.0',
    });

    // Check if directories were created
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('services/test-domain/service1'),
      expect.any(Object)
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('services/test-domain/service2'),
      expect.any(Object)
    );

    // Check if files were created (checking a few key files)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('service.config.json'),
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('docker-compose.yml'),
      expect.any(String)
    );

    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Generating microservices for domain: test-domain')
    );
  });
});

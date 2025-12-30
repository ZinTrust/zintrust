import { generateController } from '@cli/scaffolding/ControllerGenerator';
import { fsPromises } from '@node-singletons/fs';
import path from '@node-singletons/path';
import { describe, expect, it } from 'vitest';

describe('ControllerGenerator type outputs', () => {
  it('generates a crud controller file successfully', async () => {
    const tmp = path.join(process.cwd(), `tests/tmp/cg-crud-${Date.now()}`);
    await fsPromises.mkdir(tmp, { recursive: true });

    const res = await generateController({
      name: 'CrudTestController',
      controllerPath: tmp,
      type: 'crud',
    });
    expect(res.success).toBe(true);
    const file = path.join(tmp, 'CrudTestController.ts');
    const txt = await fsPromises.readFile(file, 'utf8');
    expect(txt).toContain('CrudTestController');

    // cleanup
    await fsPromises.rm(tmp, { recursive: true, force: true });
  });

  it('generates a webhook controller file successfully', async () => {
    const tmp = path.join(process.cwd(), `tests/tmp/cg-webhook-${Date.now()}`);
    await fsPromises.mkdir(tmp, { recursive: true });

    const res = await generateController({
      name: 'WebhookController',
      controllerPath: tmp,
      type: 'webhook',
    });
    expect(res.success).toBe(true);
    const file = path.join(tmp, 'WebhookController.ts');
    const txt = await fsPromises.readFile(file, 'utf8');
    expect(txt).toContain('WebhookController');

    await fsPromises.rm(tmp, { recursive: true, force: true });
  });
});

import { SimulateCommand } from '@cli/commands/SimulateCommand';
import { ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import { DistPackager } from '@cli/utils/DistPackager';
import { Logger } from '@config/logger';
import fs from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/scaffolding/ProjectScaffolder', () => ({
  ProjectScaffolder: {
    scaffold: vi.fn(),
  },
}));

vi.mock('@cli/utils/DistPackager', () => ({
  DistPackager: {
    prepare: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

describe('SimulateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  it('should have correct name and description', () => {
    expect(SimulateCommand.name).toBe('simulate');
    expect(SimulateCommand.description).toBeDefined();
  });

  it('should create simulated app successfully', async () => {
    const command = SimulateCommand.getCommand();
    command.exitOverride();

    vi.mocked(ProjectScaffolder.scaffold).mockResolvedValue({
      success: true,
      message: 'Success',
      projectPath: '/path/to/app',
      filesCreated: 10,
      directoriesCreated: 5,
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ dependencies: {} }));

    await command.parseAsync(['node', 'test', 'my-app']);

    expect(ProjectScaffolder.scaffold).toHaveBeenCalledWith(
      expect.stringContaining('simulate'),
      expect.objectContaining({ name: 'my-app' })
    );
    expect(DistPackager.prepare).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('file:')
    );
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Simulated app created successfully')
    );
  });

  it('should handle scaffold failure', async () => {
    const command = SimulateCommand.getCommand();
    command.exitOverride();

    vi.mocked(ProjectScaffolder.scaffold).mockResolvedValue({
      success: false,
      message: 'Scaffold failed',
      projectPath: '',
      filesCreated: 0,
      directoriesCreated: 0,
    });

    await expect(command.parseAsync(['node', 'test', 'my-app'])).rejects.toThrow('process.exit');
    expect(Logger.error).toHaveBeenCalledWith('Failed to create simulated app', expect.any(Error));
  });

  it('should handle missing package.json in simulated app', async () => {
    const command = SimulateCommand.getCommand();
    command.exitOverride();

    vi.mocked(ProjectScaffolder.scaffold).mockResolvedValue({
      success: true,
      message: 'Success',
      projectPath: '/path/to/app',
      filesCreated: 10,
      directoriesCreated: 5,
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(command.parseAsync(['node', 'test', 'my-app'])).rejects.toThrow('process.exit');
    expect(Logger.error).toHaveBeenCalledWith('Failed to create simulated app', expect.any(Error));
  });

  it('should handle empty app name', async () => {
    const command = SimulateCommand.getCommand();
    command.exitOverride();

    // Commander might catch missing argument before action, but let's test the logic
    await expect(command.parseAsync(['node', 'test', ' '])).rejects.toThrow('process.exit');
    expect(Logger.error).toHaveBeenCalledWith('Failed to create simulated app', expect.any(Error));
  });
});

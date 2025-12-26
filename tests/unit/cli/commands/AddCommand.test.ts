import { AddCommand } from '@cli/commands/AddCommand';
import * as fs from '@node-singletons/fs';
import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all generators
vi.mock('@cli/scaffolding/ServiceScaffolder', () => ({
  ServiceScaffolder: { scaffold: vi.fn() },
}));
vi.mock('@cli/scaffolding/FeatureScaffolder', () => ({
  FeatureScaffolder: {
    getAvailableFeatures: vi.fn().mockReturnValue(['auth', 'cache']),
    addFeature: vi.fn(),
  },
}));
vi.mock('@cli/scaffolding/MigrationGenerator', () => ({
  MigrationGenerator: { generateMigration: vi.fn() },
}));
vi.mock('@cli/scaffolding/ModelGenerator', () => ({
  ModelGenerator: { generateModel: vi.fn() },
}));
vi.mock('@cli/scaffolding/ControllerGenerator', () => ({
  ControllerGenerator: { generateController: vi.fn() },
}));
vi.mock('@cli/scaffolding/RouteGenerator', () => ({
  RouteGenerator: { generateRoutes: vi.fn() },
}));
vi.mock('@cli/scaffolding/FactoryGenerator', () => ({
  FactoryGenerator: { generateFactory: vi.fn() },
}));
vi.mock('@cli/scaffolding/SeederGenerator', () => ({
  SeederGenerator: { generateSeeder: vi.fn() },
}));
vi.mock('@cli/scaffolding/RequestFactoryGenerator', () => ({
  RequestFactoryGenerator: { generateRequestFactory: vi.fn() },
}));
vi.mock('@cli/scaffolding/ResponseFactoryGenerator', () => ({
  ResponseFactoryGenerator: { generate: vi.fn() },
}));
vi.mock('@cli/scaffolding/WorkflowGenerator', () => ({
  WorkflowGenerator: { generate: vi.fn() },
}));

vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

import { ControllerGenerator } from '@cli/scaffolding/ControllerGenerator';
import { FactoryGenerator } from '@cli/scaffolding/FactoryGenerator';
import { FeatureScaffolder } from '@cli/scaffolding/FeatureScaffolder';
import { MigrationGenerator } from '@cli/scaffolding/MigrationGenerator';
import { ModelGenerator } from '@cli/scaffolding/ModelGenerator';
import { RequestFactoryGenerator } from '@cli/scaffolding/RequestFactoryGenerator';
import { ResponseFactoryGenerator } from '@cli/scaffolding/ResponseFactoryGenerator';
import { RouteGenerator } from '@cli/scaffolding/RouteGenerator';
import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import { ServiceScaffolder } from '@cli/scaffolding/ServiceScaffolder';
import { WorkflowGenerator } from '@cli/scaffolding/WorkflowGenerator';

const findQuestion = (questions: any[], name: string) => {
  for (const q of questions) {
    if (q?.name === name) return q;
  }
  return undefined;
};

describe('AddCommand', () => {
  let command: any;

  beforeEach(() => {
    command = AddCommand.create();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  describe('execute', () => {
    it('should handle service creation', async () => {
      vi.mocked(ServiceScaffolder.scaffold).mockResolvedValue({
        success: true,
        message: 'Success',
        filesCreated: ['file1'],
        servicePath: '/path',
        serviceName: 'users',
      });
      await command.execute({ args: ['service', 'users'] });
      expect(ServiceScaffolder.scaffold).toHaveBeenCalled();
    });

    it('should handle interactive service creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'users',
        domain: 'ecommerce',
        port: 3001,
        database: 'shared',
        auth: 'jwt',
      });
      vi.mocked(ServiceScaffolder.scaffold).mockResolvedValue({
        success: true,
        message: 'Success',
        filesCreated: ['file1'],
        servicePath: '/path',
        serviceName: 'users',
      });
      await command.execute({ args: ['service'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(ServiceScaffolder.scaffold).toHaveBeenCalled();
    });

    it('should handle feature creation', async () => {
      vi.mocked(FeatureScaffolder.addFeature).mockReturnValue({
        success: true,
        message: 'Success',
        filesCreated: [],
        featureName: 'auth',
      });
      await command.execute({ args: ['feature', 'auth'], service: 'src/services/users' });
      expect(FeatureScaffolder.addFeature).toHaveBeenCalled();
    });

    it('should handle interactive feature creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'auth',
        servicePath: 'src/services/users',
        withTest: true,
      });
      vi.mocked(FeatureScaffolder.addFeature).mockReturnValue({
        success: true,
        message: 'Success',
        filesCreated: [],
        featureName: 'auth',
      });
      await command.execute({ args: ['feature'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(FeatureScaffolder.addFeature).toHaveBeenCalled();
    });

    it('should handle migration creation', async () => {
      vi.mocked(MigrationGenerator.generateMigration).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/to/migration.ts',
        migrationName: 'create_users_table',
      });
      await command.execute({ args: ['migration', 'create_users_table'] });
      expect(MigrationGenerator.generateMigration).toHaveBeenCalled();
    });

    it('should handle interactive migration creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'create_users_table',
        type: 'create',
      });
      vi.mocked(MigrationGenerator.generateMigration).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/to/migration.ts',
        migrationName: 'create_users_table',
      });
      await command.execute({ args: ['migration'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(MigrationGenerator.generateMigration).toHaveBeenCalled();
    });

    it('should handle model creation', async () => {
      vi.mocked(ModelGenerator.generateModel).mockResolvedValue({
        success: true,
        message: 'Success',
        modelFile: '/path/User.ts',
        modelName: 'User',
      });
      await command.execute({ args: ['model', 'User'] });
      expect(ModelGenerator.generateModel).toHaveBeenCalled();
    });

    it('should handle interactive model creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'User',
        softDelete: true,
        timestamps: true,
      });
      vi.mocked(ModelGenerator.generateModel).mockResolvedValue({
        success: true,
        message: 'Success',
        modelFile: '/path/User.ts',
        modelName: 'User',
      });
      await command.execute({ args: ['model'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(ModelGenerator.generateModel).toHaveBeenCalled();
    });

    it('should handle controller creation', async () => {
      vi.mocked(ControllerGenerator.generateController).mockResolvedValue({
        success: true,
        message: 'Success',
        controllerFile: '/path/UserController.ts',
        controllerName: 'UserController',
      });
      await command.execute({ args: ['controller', 'UserController'] });
      expect(ControllerGenerator.generateController).toHaveBeenCalled();
    });

    it('should handle interactive controller creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'UserController',
        type: 'api',
      });
      vi.mocked(ControllerGenerator.generateController).mockResolvedValue({
        success: true,
        message: 'Success',
        controllerFile: '/path/UserController.ts',
        controllerName: 'UserController',
      });
      await command.execute({ args: ['controller'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(ControllerGenerator.generateController).toHaveBeenCalled();
    });

    it('should handle routes creation', async () => {
      vi.mocked(RouteGenerator.generateRoutes).mockResolvedValue({
        success: true,
        message: 'Success',
        routeFile: '/path/api.ts',
        routeCount: 1,
      });
      await command.execute({ args: ['routes', 'api'] });
      expect(RouteGenerator.generateRoutes).toHaveBeenCalled();
    });

    it('should handle interactive routes creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'api',
      });
      vi.mocked(RouteGenerator.generateRoutes).mockResolvedValue({
        success: true,
        message: 'Success',
        routeFile: '/path/api.ts',
        routeCount: 1,
      });
      await command.execute({ args: ['routes'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(RouteGenerator.generateRoutes).toHaveBeenCalled();
    });

    it('should handle factory creation', async () => {
      vi.mocked(FactoryGenerator.generateFactory).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/UserFactory.ts',
      });
      await command.execute({ args: ['factory', 'UserFactory'], model: 'User' });
      expect(FactoryGenerator.generateFactory).toHaveBeenCalled();
    });

    it('should handle interactive factory creation with relationships', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({
          name: 'UserFactory',
          model: 'User',
          addRelationships: true,
        })
        .mockResolvedValueOnce({
          relationships: 'Profile,Post',
        });
      vi.mocked(FactoryGenerator.generateFactory).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/UserFactory.ts',
      });
      await command.execute({ args: ['factory'] });
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(FactoryGenerator.generateFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          relationships: ['Profile', 'Post'],
        })
      );
    });

    it('should handle seeder creation', async () => {
      vi.mocked(SeederGenerator.generateSeeder).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/UserSeeder.ts',
      });
      await command.execute({ args: ['seeder', 'UserSeeder'], model: 'User' });
      expect(SeederGenerator.generateSeeder).toHaveBeenCalled();
    });

    it('should handle interactive seeder creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'UserSeeder',
        model: 'User',
        count: '50',
        states: true,
        relationships: true,
        truncate: true,
      });
      vi.mocked(SeederGenerator.generateSeeder).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/UserSeeder.ts',
      });
      await command.execute({ args: ['seeder'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(SeederGenerator.generateSeeder).toHaveBeenCalled();
    });

    it('should handle requestfactory creation', async () => {
      vi.mocked(RequestFactoryGenerator.generateRequestFactory).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path/CreateUserRequestFactory.ts',
        requestPath: '/path/CreateUserRequest.ts',
      });
      await command.execute({ args: ['requestfactory', 'CreateUserRequestFactory'] });
      expect(RequestFactoryGenerator.generateRequestFactory).toHaveBeenCalled();
    });

    it('should handle interactive requestfactory creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        endpoint: '/api/users',
        method: 'POST',
        withDTO: true,
      });
      vi.mocked(RequestFactoryGenerator.generateRequestFactory).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path/CreateUserRequestFactory.ts',
      });
      await command.execute({ args: ['requestfactory'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(RequestFactoryGenerator.generateRequestFactory).toHaveBeenCalled();
    });

    it('should handle responsefactory creation', async () => {
      vi.mocked(ResponseFactoryGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path/UserResponseFactory.ts',
        responsePath: '/path/UserResponse.ts',
      });
      await command.execute({
        args: ['responsefactory', 'UserResponseFactory'],
        noInteractive: true,
      });
      expect(ResponseFactoryGenerator.generate).toHaveBeenCalled();
    });

    it('should handle interactive responsefactory creation', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ factoryName: 'UserResponseFactory' })
        .mockResolvedValueOnce({
          factoryName: 'UserResponseFactory',
          responseName: 'UserResponse',
          responseType: 'error',
          withDTO: true,
        });
      vi.mocked(ResponseFactoryGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path/UserResponseFactory.ts',
      });
      await command.execute({ args: ['responsefactory'] });
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(ResponseFactoryGenerator.generate).toHaveBeenCalled();
    });

    it('should handle paginated responsefactory creation', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ factoryName: 'UserResponseFactory' })
        .mockResolvedValueOnce({
          factoryName: 'UserResponseFactory',
          responseName: 'UserResponse',
          responseType: 'paginated',
          withDTO: true,
        });
      vi.mocked(ResponseFactoryGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path/UserResponseFactory.ts',
      });
      await command.execute({ args: ['responsefactory'] });
      expect(ResponseFactoryGenerator.generate).toHaveBeenCalled();
    });

    it('should handle workflow creation', async () => {
      vi.mocked(WorkflowGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/to/workflow.yml',
      });
      await command.execute({
        args: ['workflow', 'deploy'],
        platform: 'lambda',
        noInteractive: true,
      });
      expect(WorkflowGenerator.generate).toHaveBeenCalled();
    });

    it('should handle interactive workflow creation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        name: 'deploy',
        platform: 'cloudflare',
      });
      vi.mocked(WorkflowGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        filePath: '/path/to/workflow.yml',
      });
      await command.execute({ args: ['workflow'] });
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(WorkflowGenerator.generate).toHaveBeenCalled();
    });

    it('should throw error for unknown type', async () => {
      await expect(command.execute({ args: ['unknown'] })).rejects.toThrow(
        /Unknown type "unknown"/
      );
    });

    it('should throw error when service name is missing in no-interactive mode', async () => {
      await expect(command.execute({ args: ['service'], noInteractive: true })).rejects.toThrow(
        /Service name is required/
      );
    });

    it('should throw error when feature name is missing in no-interactive mode', async () => {
      await expect(command.execute({ args: ['feature'], noInteractive: true })).rejects.toThrow(
        /Feature name is required/
      );
    });

    it('should throw error when migration name is missing in no-interactive mode', async () => {
      await expect(command.execute({ args: ['migration'], noInteractive: true })).rejects.toThrow(
        /Migration name is required/
      );
    });

    it('should throw error when model name is required for factory', async () => {
      await expect(
        command.execute({ args: ['factory', 'UserFactory'], noInteractive: true })
      ).rejects.toThrow(/Model name is required/);
    });

    it('should throw error when generator fails', async () => {
      vi.mocked(ServiceScaffolder.scaffold).mockResolvedValue({
        success: false,
        message: 'Scaffold failed',
        filesCreated: [],
        servicePath: '',
        serviceName: 'users',
      });
      await expect(command.execute({ args: ['service', 'users'] })).rejects.toThrow(
        /Scaffold failed/
      );
    });

    it('should handle request-factory alias', async () => {
      vi.mocked(RequestFactoryGenerator.generateRequestFactory).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path',
      });
      await command.execute({ args: ['request-factory', 'MyFactory'], noInteractive: true });
      expect(RequestFactoryGenerator.generateRequestFactory).toHaveBeenCalled();
    });

    it('should handle response-factory alias', async () => {
      vi.mocked(ResponseFactoryGenerator.generate).mockResolvedValue({
        success: true,
        message: 'Success',
        factoryPath: '/path',
      });
      await command.execute({ args: ['response-factory', 'MyFactory'], noInteractive: true });
      expect(ResponseFactoryGenerator.generate).toHaveBeenCalled();
    });

    it('should throw error when type is missing', async () => {
      await expect(command.execute({ args: [] })).rejects.toThrow(/Please specify what to add/);
    });

    it('should handle seeder with no model name in no-interactive mode', async () => {
      await expect(
        command.execute({ args: ['seeder', 'UserSeeder'], noInteractive: true })
      ).rejects.toThrow(/Model name is required/);
    });

    it('should handle factory with no model name in no-interactive mode', async () => {
      await expect(
        command.execute({ args: ['factory', 'UserFactory'], noInteractive: true })
      ).rejects.toThrow(/Model name is required/);
    });

    it('should handle feature with no service path in no-interactive mode', async () => {
      await expect(
        command.execute({ args: ['feature', 'auth'], noInteractive: true })
      ).rejects.toThrow(/Service path is required/);
    });

    it('should handle model with no name in no-interactive mode', async () => {
      await expect(command.execute({ args: ['model'], noInteractive: true })).rejects.toThrow(
        /Model name is required/
      );
    });

    it('should handle controller with no name in no-interactive mode', async () => {
      await expect(command.execute({ args: ['controller'], noInteractive: true })).rejects.toThrow(
        /Controller name is required/
      );
    });

    it('should handle routes with no name in no-interactive mode', async () => {
      await expect(command.execute({ args: ['routes'], noInteractive: true })).rejects.toThrow(
        /Route group name is required/
      );
    });

    it('should handle requestfactory with no name in no-interactive mode', async () => {
      await expect(
        command.execute({ args: ['requestfactory'], noInteractive: true })
      ).rejects.toThrow(/Factory name is required/);
    });

    it('should handle responsefactory with no name in no-interactive mode', async () => {
      await expect(
        command.execute({ args: ['responsefactory'], noInteractive: true })
      ).rejects.toThrow(/Factory name is required/);
    });

    it('should add a response factory with error type', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        factoryName: 'ErrorResponseFactory',
        responseName: 'ErrorResponse',
        responseType: 'error',
        withDTO: true,
      });

      await command.execute({ args: ['response-factory', 'ErrorResponseFactory'] });

      expect(vi.mocked(ResponseFactoryGenerator.generate)).toHaveBeenCalledWith(
        expect.objectContaining({
          factoryName: 'ErrorResponseFactory',
          fields: expect.arrayContaining([{ name: 'code', type: 'number' }]),
        })
      );
    });

    it('should add a response factory with paginated type', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({
        factoryName: 'PaginatedResponseFactory',
        responseName: 'PaginatedResponse',
        responseType: 'paginated',
        withDTO: true,
      });

      await command.execute({ args: ['response-factory', 'PaginatedResponseFactory'] });

      expect(vi.mocked(ResponseFactoryGenerator.generate)).toHaveBeenCalledWith(
        expect.objectContaining({
          factoryName: 'PaginatedResponseFactory',
          fields: expect.arrayContaining([{ name: 'id', type: 'uuid' }]),
        })
      );
    });

    it('should add a workflow with specific platform', async () => {
      await command.execute({ args: ['workflow', 'deploy'], platform: 'lambda' });
      expect(vi.mocked(WorkflowGenerator.generate)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'deploy',
          platform: 'lambda',
        })
      );
    });

    it('should add a workflow with all platforms', async () => {
      await command.execute({ args: ['workflow', 'deploy'], platform: 'all' });
      expect(vi.mocked(WorkflowGenerator.generate)).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'all',
        })
      );
    });

    it('should handle unexpected errors in executeAdd', async () => {
      // Force an unexpected error by mocking a generator to throw
      vi.mocked(ServiceScaffolder.scaffold).mockRejectedValue(new Error('Unexpected error'));

      await expect(command.execute({ args: ['service', 'TestService'] })).rejects.toThrow(
        'Unexpected error'
      );
    });
  });

  describe('Internal Helpers & Validators', () => {
    const helpers = (AddCommand as any)._helpers;

    it('should validate service name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('valid')).toBe(true);
        expect(nameQuestion.validate('INVALID')).toBe('Must be lowercase letters only');
        return Promise.resolve({ name: 'test' });
      }) as any);
      await helpers.promptServiceConfig('test');
    });

    it('should validate migration name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('valid_migration')).toBe(true);
        expect(nameQuestion.validate('Invalid Migration')).toBe('Must be snake_case');
        return Promise.resolve({ name: 'test' });
      }) as any);
      await helpers.promptMigrationConfig();
    });

    it('should validate model name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('ValidModel')).toBe(true);
        expect(nameQuestion.validate('invalidModel')).toBe('Must be PascalCase');
        return Promise.resolve({ name: 'test' });
      }) as any);
      await helpers.promptModelConfig();
    });

    it('should validate controller name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('UserController')).toBe(true);
        expect(nameQuestion.validate('User')).toBe('Must be PascalCase ending with "Controller"');
        return Promise.resolve({ name: 'test' });
      }) as any);
      await helpers.promptControllerConfig();
    });

    it('should validate factory name and model', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        const modelQuestion = findQuestion(questions, 'model');

        expect(nameQuestion).toBeDefined();
        expect(modelQuestion).toBeDefined();

        expect(nameQuestion.validate('UserFactory')).toBe(true);
        expect(nameQuestion.validate('User')).toBe('Must be PascalCase ending with "Factory"');

        expect(modelQuestion.validate('User')).toBe(true);
        expect(modelQuestion.validate('user')).toBe('Must be PascalCase');

        return Promise.resolve({ name: 'test', model: 'test', addRelationships: false });
      }) as any);
      await helpers.promptFactoryConfig();
    });

    it('should validate seeder name, model and count', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'name');
        const modelQuestion = findQuestion(questions, 'model');
        const countQuestion = findQuestion(questions, 'count');

        expect(nameQuestion).toBeDefined();
        expect(modelQuestion).toBeDefined();
        expect(countQuestion).toBeDefined();

        expect(nameQuestion.validate('UserSeeder')).toBe(true);
        expect(nameQuestion.validate('User')).toBe('Must be PascalCase ending with "Seeder"');

        expect(modelQuestion.validate('User')).toBe(true);
        expect(modelQuestion.validate('user')).toBe('Must be PascalCase');

        expect(countQuestion.validate('100')).toBe(true);
        expect(countQuestion.validate('0')).toBe('Must be between 1 and 100,000');
        expect(countQuestion.validate('100001')).toBe('Must be between 1 and 100,000');

        return Promise.resolve({ name: 'test', model: 'test', count: '100' });
      }) as any);
      await helpers.promptSeederConfig();
    });

    it('should validate request factory name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'factoryName');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('CreateUserRequestFactory')).toBe(true);
        expect(nameQuestion.validate('')).toBe('Factory name is required');
        expect(nameQuestion.validate('CreateUser')).toBe(
          'Factory name must end with "RequestFactory"'
        );
        return Promise.resolve({ factoryName: 'test' });
      }) as any);
      await helpers.promptRequestFactoryConfig();
    });

    it('should validate response factory name', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'factoryName');
        expect(nameQuestion).toBeDefined();
        expect(nameQuestion.validate('UserResponseFactory')).toBe(true);
        expect(nameQuestion.validate('')).toBe('Factory name is required');
        expect(nameQuestion.validate('User')).toBe('Factory name must end with "ResponseFactory"');
        return Promise.resolve({ factoryName: 'test' });
      }) as any);
      await helpers.promptResponseFactoryName();
    });

    it('should validate response factory config', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'factoryName');
        const responseQuestion = findQuestion(questions, 'responseName');

        expect(nameQuestion).toBeDefined();
        expect(responseQuestion).toBeDefined();

        expect(nameQuestion.validate('UserFactory')).toBe(true);
        expect(nameQuestion.validate('')).toBe('Factory name is required');
        expect(nameQuestion.validate('User')).toBe('Factory name must end with "Factory"');

        expect(responseQuestion.validate('UserResponse')).toBe(true);
        expect(responseQuestion.validate('')).toBe('Response name is required');
        expect(responseQuestion.validate('User')).toBe('Response name must end with "Response"');

        return Promise.resolve({ factoryName: 'test', responseName: 'test' });
      }) as any);

      await helpers.promptResponseFactoryConfig('UserResponse');
    });

    it('should return correct default response fields', () => {
      expect(helpers.getDefaultResponseFields('success')).toHaveLength(3);
      expect(helpers.getDefaultResponseFields('error')).toHaveLength(2);
      expect(helpers.getDefaultResponseFields('paginated')).toHaveLength(2);
      expect(helpers.getDefaultResponseFields('custom')).toHaveLength(0);
    });

    it('should handle factory relationships prompt', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({
          name: 'UserFactory',
          model: 'User',
          addRelationships: true,
        })
        .mockResolvedValueOnce({
          relationships: 'Profile,Post',
        });

      const result = await helpers.promptFactoryConfig();
      expect(result.relationships).toBe('Profile,Post');
    });

    it('should handle factory generator failure', async () => {
      vi.mocked(FactoryGenerator.generateFactory).mockResolvedValue({
        success: false,
        message: 'Factory generation failed',
      });

      await expect(
        command.execute({ args: ['factory', 'UserFactory'], model: 'User' })
      ).rejects.toThrow('Factory generation failed');
    });

    it('should handle seeder generator failure', async () => {
      vi.mocked(SeederGenerator.generateSeeder).mockResolvedValue({
        success: false,
        message: 'Seeder generation failed',
        filePath: '',
      });

      await expect(
        command.execute({ args: ['seeder', 'UserSeeder'], model: 'User' })
      ).rejects.toThrow('Seeder generation failed');
    });

    it('should create directory if it does not exist', async () => {
      const fsDefault = (fs as any).default;
      vi.mocked(fsDefault.existsSync).mockImplementation((p: any) => {
        if (p.toString().includes('database/seeders')) return false;
        return true;
      });

      vi.mocked(SeederGenerator.generateSeeder).mockResolvedValue({
        success: true,
        filePath: '/path/to/seeder.ts',
        message: 'Success',
      });

      await command.execute({ args: ['seeder', 'UserSeeder'], model: 'User' });
      expect(fsDefault.mkdirSync).toHaveBeenCalled();
    });

    it('should test request factory default name function', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(((questions: any) => {
        const nameQuestion = findQuestion(questions, 'requestName');
        expect(nameQuestion).toBeDefined();
        if (typeof nameQuestion.default === 'function') {
          expect(nameQuestion.default({ factoryName: 'CreateUserRequestFactory' })).toBe(
            'CreateUserRequest'
          );
        }
        return Promise.resolve({ factoryName: 'test', requestName: 'test' });
      }) as any);
      await helpers.promptRequestFactoryConfig();
    });

    it('should throw error when factory name is missing in no-interactive mode', async () => {
      await expect(command.execute({ args: ['factory'], noInteractive: true })).rejects.toThrow(
        'Factory name is required'
      );
    });

    it('should throw error when seeder name is missing in no-interactive mode', async () => {
      await expect(command.execute({ args: ['seeder'], noInteractive: true })).rejects.toThrow(
        'Seeder name is required'
      );
    });
  });
});

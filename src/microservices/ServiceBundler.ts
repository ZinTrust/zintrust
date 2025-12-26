/**
 * Service Bundler - Creates optimized, independent microservice packages
 * Target: Each service < 1MB for serverless deployment
 */

import { Logger } from '@config/logger';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export interface BundleConfig {
  serviceName: string;
  domain: string;
  outputDir: string;
  targetSize?: number; // MB
  includeTests?: boolean;
  includeDocs?: boolean;
}

export interface BundleResult {
  serviceName: string;
  sizeBytes: number;
  sizeMB: number;
  files: number;
  location: string;
  optimized: boolean;
}

export interface IServiceBundler {
  bundleService(config: BundleConfig): Promise<BundleResult>;
  bundleAll(domain: string, services: string[], outputDir?: string): Promise<BundleResult[]>;
  createServiceImage(serviceName: string, domain: string, registry?: string): Promise<string>;
}

export interface IServiceBundlerManager {
  getInstance(): IServiceBundler;
  bundleService(config: BundleConfig): Promise<BundleResult>;
  bundleAll(domain: string, services: string[], outputDir?: string): Promise<BundleResult[]>;
  createServiceImage(serviceName: string, domain: string, registry?: string): Promise<string>;
  create(): IServiceBundler;
}

/**
 * Service bundler for independent deployment
 */
export const ServiceBundler = Object.freeze((): IServiceBundlerManager => {
  let instance: IServiceBundler | undefined;

  return {
    getInstance(): IServiceBundler {
      instance ??= this.create();
      return instance;
    },

    async bundleService(config: BundleConfig): Promise<BundleResult> {
      return this.getInstance().bundleService(config);
    },

    async bundleAll(
      domain: string,
      services: string[],
      outputDir?: string
    ): Promise<BundleResult[]> {
      return this.getInstance().bundleAll(domain, services, outputDir);
    },

    async createServiceImage(
      serviceName: string,
      domain: string,
      registry?: string
    ): Promise<string> {
      return this.getInstance().createServiceImage(serviceName, domain, registry);
    },

    /**
     * Create a new service bundler instance
     */
    create(): IServiceBundler {
      return {
        /**
         * Bundle a single microservice
         */
        async bundleService(config: BundleConfig): Promise<BundleResult> {
          return runBundleService(config);
        },

        /**
         * Bundle multiple services
         */
        async bundleAll(
          domain: string,
          services: string[],
          outputDir: string = 'dist/services'
        ): Promise<BundleResult[]> {
          return runBundleAll(domain, services, outputDir, async (c) => this.bundleService(c));
        },

        /**
         * Create Docker image for service
         */
        async createServiceImage(
          serviceName: string,
          domain: string,
          registry: string = 'localhost:5000'
        ): Promise<string> {
          return runCreateServiceImage(serviceName, domain, registry);
        },
      };
    },
  };
})();

/**
 * Run bundle for a single service
 */
async function runBundleService(config: BundleConfig): Promise<BundleResult> {
  const { serviceName, domain, outputDir, targetSize = 1 } = config;

  Logger.info(`\n📦 Bundling service: ${serviceName}`);

  const serviceDir = `services/${domain}/${serviceName}`;
  const bundleDir = path.join(outputDir, `${domain}-${serviceName}`);

  prepareBundleDirectory(bundleDir);

  const { totalSize, fileCount } = copyServiceFiles(serviceDir, bundleDir);

  const metadata = generateBundleMetadata(serviceName, domain, totalSize, fileCount, targetSize);
  fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(metadata, null, 2));

  logBundleSummary(totalSize, fileCount, targetSize);

  return Promise.resolve({
    serviceName,
    sizeBytes: totalSize,
    sizeMB: Number.parseFloat((totalSize / (1024 * 1024)).toFixed(2)),
    files: fileCount,
    location: bundleDir,
    optimized: totalSize < targetSize * 1024 * 1024,
  });
}

/**
 * Run bundle for all services
 */
async function runBundleAll(
  domain: string,
  services: string[],
  outputDir: string,
  bundleServiceFn: (config: BundleConfig) => Promise<BundleResult>
): Promise<BundleResult[]> {
  Logger.info(`\n📦 Bundling ${services.length} services for domain: ${domain}`);

  const promises = services.map(async (service) => {
    try {
      return await bundleServiceFn({
        serviceName: service,
        domain,
        outputDir,
      });
    } catch (error) {
      Logger.error(`Failed to bundle ${service}:`, error);
      return null;
    }
  });

  const allResults = await Promise.all(promises);
  const results = allResults.filter((r): r is BundleResult => r !== null);

  // Print summary
  printBundleSummary(results);

  return results;
}

/**
 * Run create service image
 */
async function runCreateServiceImage(
  serviceName: string,
  domain: string,
  registry: string
): Promise<string> {
  const serviceDir = `services/${domain}/${serviceName}`;
  const imageTag = `${registry}/${domain}-${serviceName}:latest`;

  Logger.info(`\n🐳 Creating Docker image: ${imageTag}`);

  // Generate minimal Dockerfile
  const dockerfile = generateDockerfile(serviceName);

  fs.writeFileSync(path.join(serviceDir, 'Dockerfile'), dockerfile);

  Logger.info(`  ✓ Dockerfile created at ${serviceDir}/Dockerfile`);
  Logger.info(`  To build: docker build -t ${imageTag} ${serviceDir}`);

  return Promise.resolve(imageTag);
}

/**
 * Copy directory recursively
 */
function copyDirectory(src: string, dest: string): void {
  if (fs.existsSync(dest) === false) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const files = fs.readdirSync(src);

  for (const file of files) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    const stats = fs.statSync(srcPath);

    if (stats.isDirectory() === true) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get directory size
 */
function getDirectorySize(dir: string): number {
  if (fs.existsSync(dir) === false) return 0;

  let size = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory() === true) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }

  return size;
}

/**
 * Count files in directory
 */
function countFiles(dir: string): number {
  if (fs.existsSync(dir) === false) return 0;

  let count = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory() === true) {
      count += countFiles(filePath);
    } else {
      count++;
    }
  }

  return count;
}

/**
 * Prepare bundle directory
 */
function prepareBundleDirectory(bundleDir: string): void {
  if (fs.existsSync(bundleDir) === true) {
    fs.rmSync(bundleDir, { recursive: true });
  }
  fs.mkdirSync(bundleDir, { recursive: true });
}

/**
 * Copy service files to bundle directory
 */
function copyServiceFiles(
  serviceDir: string,
  bundleDir: string
): { totalSize: number; fileCount: number } {
  const filesToCopy = [
    { src: `${serviceDir}/dist`, dest: `${bundleDir}/dist` },
    { src: `${serviceDir}/package.json`, dest: `${bundleDir}/package.json` },
    {
      src: `${serviceDir}/service.config.json`,
      dest: `${bundleDir}/service.config.json`,
    },
    { src: `${serviceDir}/.env.example`, dest: `${bundleDir}/.env.example` },
  ];

  let totalSize = 0;
  let fileCount = 0;

  for (const { src, dest } of filesToCopy) {
    if (fs.existsSync(src) === true) {
      const stats = fs.statSync(src);
      if (stats.isDirectory() === true) {
        copyDirectory(src, dest);
        totalSize += getDirectorySize(dest);
        fileCount += countFiles(dest);
      } else {
        fs.copyFileSync(src, dest);
        totalSize += stats.size;
        fileCount++;
      }
    }
  }

  return { totalSize, fileCount };
}

/**
 * Generate bundle metadata
 */
function generateBundleMetadata(
  serviceName: string,
  domain: string,
  totalSize: number,
  fileCount: number,
  targetSize: number
): Record<string, unknown> {
  return {
    service: serviceName,
    domain,
    timestamp: new Date().toISOString(),
    sizeBytes: totalSize,
    files: fileCount,
    optimized: totalSize < targetSize * 1024 * 1024,
  };
}

/**
 * Log bundle summary
 */
function logBundleSummary(totalSize: number, fileCount: number, targetSize: number): void {
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  Logger.info(`  ✓ Size: ${sizeMB} MB (${fileCount} files)`);

  if (totalSize > targetSize * 1024 * 1024) {
    Logger.warn(`  ⚠️  Bundle exceeds ${targetSize} MB target - consider optimizing`);
  }
}

/**
 * Print bundle summary
 */
function printBundleSummary(results: BundleResult[]): void {
  Logger.info('\n📊 Bundle Summary');
  Logger.info('━'.repeat(60));

  let totalSize = 0;
  let totalFiles = 0;

  for (const result of results) {
    const status = result.optimized === true ? '✅' : '⚠️ ';
    Logger.info(
      `${status} ${result.serviceName.padEnd(20)} ${result.sizeMB.toFixed(2)} MB (${result.files} files)`
    );
    totalSize += result.sizeBytes;
    totalFiles += result.files;
  }

  Logger.info('━'.repeat(60));
  const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
  Logger.info(`Total: ${totalMB} MB across ${totalFiles} files\n`);
}

/**
 * Generate minimal Dockerfile
 */
function generateDockerfile(serviceName: string): string {
  return String.raw`FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --ignore-scripts

COPY dist ./dist

ENV NODE_ENV=production
ENV SERVICE_NAME=${serviceName}

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:7777/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

CMD ["node", "dist/src/Kernel.js"]
`;
}

/**
 * CLI command to bundle services
 */
export async function bundleServices(domain: string, services: string): Promise<void> {
  const serviceList = services.split(',').map((s) => s.trim());
  const results = await ServiceBundler.getInstance().bundleAll(
    domain,
    serviceList,
    'dist/services'
  );

  const allOptimized = results.every((r: BundleResult) => r.optimized);
  if (allOptimized) {
    Logger.info('✅ All services optimized for serverless deployment!');
  } else {
    Logger.info('⚠️  Some services exceed 1MB target - consider further optimization');
  }
}

export const bundleService = async (config: BundleConfig): Promise<BundleResult> =>
  ServiceBundler.getInstance().bundleService(config);
export const bundleAll = async (
  domain: string,
  services: string[],
  outputDir?: string
): Promise<BundleResult[]> => ServiceBundler.getInstance().bundleAll(domain, services, outputDir);
export const createServiceImage = async (
  serviceName: string,
  domain: string,
  registry?: string
): Promise<string> =>
  ServiceBundler.getInstance().createServiceImage(serviceName, domain, registry);

export default ServiceBundler;

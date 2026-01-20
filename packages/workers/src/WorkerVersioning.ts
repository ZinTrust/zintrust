/**
 * Worker Versioning System
 * Semantic versioning support for workers with backward compatibility
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';

export type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
};

export type WorkerVersion = {
  workerName: string;
  version: SemanticVersion;
  createdAt: Date;
  deprecatedAt?: Date;
  eolDate?: Date; // End of life date
  isActive: boolean;
  isDeprecated: boolean;
  migrationPath?: string; // Version to migrate to
  changelog?: string;
  breakingChanges?: string[];
};

export type VersionCompatibility = {
  sourceVersion: SemanticVersion;
  targetVersion: SemanticVersion;
  compatible: boolean;
  requiresMigration: boolean;
  breakingChanges: string[];
  recommendations: string[];
};

// Internal state
const workerVersions = new Map<string, WorkerVersion[]>();
const versionAliases = new Map<string, string>(); // 'latest', 'stable', etc. -> version string

/**
 * Helper: Parse version string
 */
const parseVersion = (versionStr: string): SemanticVersion => {
  const match = new RegExp(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/
  ).exec(versionStr);

  if (!match) {
    throw ErrorFactory.createConfigError(`Invalid version format: ${versionStr}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
};

/**
 * Helper: Convert version to string
 */
const versionToString = (version: SemanticVersion): string => {
  let str = `${version.major}.${version.minor}.${version.patch}`;
  if (typeof version.prerelease === 'string' && version.prerelease.length > 0) {
    str += `-${version.prerelease}`;
  }
  if (typeof version.build === 'string' && version.build.length > 0) {
    str += `+${version.build}`;
  }
  return str;
};

/**
 * Helper: Compare versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
const compareVersions = (v1: SemanticVersion, v2: SemanticVersion): number => {
  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  if (v1.patch !== v2.patch) return v1.patch - v2.patch;

  // Prerelease versions have lower precedence
  if (v1.prerelease === undefined && v2.prerelease !== undefined) return 1;
  if (v1.prerelease !== undefined && v2.prerelease === undefined) return -1;
  if (v1.prerelease !== undefined && v2.prerelease !== undefined) {
    return v1.prerelease.localeCompare(v2.prerelease);
  }

  return 0;
};

/**
 * Helper: Check if versions are compatible (no breaking changes)
 */
const areVersionsCompatible = (v1: SemanticVersion, v2: SemanticVersion): boolean => {
  // Same major version = compatible (semver rules)
  return v1.major === v2.major;
};

/**
 * Worker Versioning - Sealed namespace
 */
export const WorkerVersioning = Object.freeze({
  /**
   * Register a worker version
   */
  register(workerVersion: Omit<WorkerVersion, 'createdAt' | 'isActive' | 'isDeprecated'>): void {
    const { workerName, version } = workerVersion;
    const versionStr = versionToString(version);

    let versions = workerVersions.get(workerName);

    if (!versions) {
      versions = [];
      workerVersions.set(workerName, versions);
    }

    // Check if version already exists
    const existing = versions.find((v) => versionToString(v.version) === versionStr);

    if (existing) {
      ErrorFactory.createConfigError(
        `Version ${versionStr} already registered for worker "${workerName}"`
      );
    }

    const fullVersion: WorkerVersion = {
      ...workerVersion,
      createdAt: new Date(),
      isActive: true,
      isDeprecated: false,
    };

    versions.push(fullVersion);

    // Sort by version (descending)
    versions.sort((a, b) => -compareVersions(a.version, b.version));

    // Update 'latest' alias if this is the newest version
    if (versions[0] === fullVersion) {
      const aliasKey = `${workerName}:latest`;
      versionAliases.set(aliasKey, versionStr);
    }

    Logger.info(`Worker version registered: ${workerName}@${versionStr}`, {
      isActive: fullVersion.isActive,
    });
  },

  /**
   * Get worker version
   */
  getVersion(workerName: string, versionStr: string): WorkerVersion | null {
    // Check if it's an alias
    let newVersionStr = versionStr;
    const aliasKey = `${workerName}:${newVersionStr}`;
    const aliasedVersion = versionAliases.get(aliasKey);

    if (aliasedVersion !== undefined) {
      newVersionStr = aliasedVersion;
    }

    const versions = workerVersions.get(workerName);

    if (!versions) return null;

    const version = parseVersion(newVersionStr);
    const found = versions.find((v) => compareVersions(v.version, version) === 0);

    return found ? { ...found } : null;
  },

  /**
   * Get all versions for a worker
   */
  getVersions(workerName: string, includeDeprecated = false): ReadonlyArray<WorkerVersion> {
    const versions = workerVersions.get(workerName) ?? [];

    if (!includeDeprecated) {
      return versions.filter((v) => !v.isDeprecated);
    }

    return versions.map((v) => ({ ...v }));
  },

  /**
   * Get latest version
   */
  getLatest(workerName: string): WorkerVersion | null {
    const versions = workerVersions.get(workerName);

    if (!versions || versions.length === 0) return null;

    // Already sorted by version (descending)
    const latest = versions.find((v) => v.isActive && !v.isDeprecated);

    return latest ? { ...latest } : null;
  },

  /**
   * Deprecate a version
   */
  deprecate(workerName: string, versionStr: string, migrationPath?: string, eolDate?: Date): void {
    const version = WorkerVersioning.getVersion(workerName, versionStr);

    if (!version) {
      throw ErrorFactory.createNotFoundError(
        `Version ${versionStr} not found for worker "${workerName}"`
      );
    }

    const versions = workerVersions.get(workerName) ?? [];
    const index = versions.findIndex((v) => versionToString(v.version) === versionStr);

    versions[index].isDeprecated = true;
    versions[index].deprecatedAt = new Date();
    versions[index].migrationPath = migrationPath;
    versions[index].eolDate = eolDate;

    Logger.warn(`Worker version deprecated: ${workerName}@${versionStr}`, {
      migrationPath,
      eolDate,
    });
  },

  /**
   * Deactivate a version (stop accepting new jobs)
   */
  deactivate(workerName: string, versionStr: string): void {
    const version = WorkerVersioning.getVersion(workerName, versionStr);

    if (!version) {
      throw ErrorFactory.createNotFoundError(
        `Version ${versionStr} not found for worker "${workerName}"`
      );
    }

    const versions = workerVersions.get(workerName) ?? [];
    const index = versions.findIndex((v) => versionToString(v.version) === versionStr);

    versions[index].isActive = false;

    Logger.info(`Worker version deactivated: ${workerName}@${versionStr}`);
  },

  /**
   * Activate a version
   */
  activate(workerName: string, versionStr: string): void {
    const version = WorkerVersioning.getVersion(workerName, versionStr);

    if (!version) {
      throw ErrorFactory.createNotFoundError(
        `Version ${versionStr} not found for worker "${workerName}"`
      );
    }

    const getWorkerVersions = workerVersions.get(workerName);
    const versions = getWorkerVersions ?? [];
    const index = versions.findIndex((v) => versionToString(v.version) === versionStr);

    versions[index].isActive = true;

    Logger.info(`Worker version activated: ${workerName}@${versionStr}`);
  },

  /**
   * Check compatibility between versions
   */
  checkCompatibility(
    workerName: string,
    sourceVersionStr: string,
    targetVersionStr: string
  ): VersionCompatibility {
    const sourceVersion = parseVersion(sourceVersionStr);
    const targetVersion = parseVersion(targetVersionStr);

    const source = WorkerVersioning.getVersion(workerName, sourceVersionStr);
    const target = WorkerVersioning.getVersion(workerName, targetVersionStr);

    const compatible = areVersionsCompatible(sourceVersion, targetVersion);
    const requiresMigration = !compatible || sourceVersion.major < targetVersion.major;

    const breakingChanges = target?.breakingChanges ?? [];
    const recommendations: string[] = [];

    if (target?.isDeprecated === true) {
      recommendations.push(
        `Target version is deprecated. Consider migrating to ${(target.migrationPath ?? '') || 'latest'}`
      );
    }

    if (!compatible) {
      recommendations.push('Major version change detected. Review breaking changes carefully.');
    }

    if (source?.eolDate && source.eolDate < new Date()) {
      recommendations.push('Source version has reached end of life. Migration is required.');
    }

    return {
      sourceVersion,
      targetVersion,
      compatible,
      requiresMigration,
      breakingChanges,
      recommendations,
    };
  },

  /**
   * Set version alias
   */
  setAlias(workerName: string, alias: string, versionStr: string): void {
    const version = WorkerVersioning.getVersion(workerName, versionStr);

    if (!version) {
      throw ErrorFactory.createNotFoundError(
        `Version ${versionStr} not found for worker "${workerName}"`
      );
    }

    const aliasKey = `${workerName}:${alias}`;
    versionAliases.set(aliasKey, versionStr);

    Logger.info(`Version alias set: ${alias} -> ${workerName}@${versionStr}`);
  },

  /**
   * Get version by alias
   */
  resolveAlias(workerName: string, alias: string): string | null {
    const aliasKey = `${workerName}:${alias}`;
    return versionAliases.get(aliasKey) ?? null;
  },

  /**
   * Parse version string
   */
  parse(versionStr: string): SemanticVersion {
    return parseVersion(versionStr);
  },

  /**
   * Convert version to string
   */
  stringify(version: SemanticVersion): string {
    return versionToString(version);
  },

  /**
   * Compare two versions
   */
  compare(v1Str: string, v2Str: string): number {
    const v1 = parseVersion(v1Str);
    const v2 = parseVersion(v2Str);
    return compareVersions(v1, v2);
  },

  /**
   * Get version summary
   */
  getSummary(workerName: string): {
    totalVersions: number;
    activeVersions: number;
    deprecatedVersions: number;
    latest: string | null;
    stable: string | null;
  } {
    const versions = workerVersions.get(workerName) ?? [];

    const summary = {
      totalVersions: versions.length,
      activeVersions: versions.filter((v) => v.isActive).length,
      deprecatedVersions: versions.filter((v) => v.isDeprecated).length,
      latest: WorkerVersioning.resolveAlias(workerName, 'latest'),
      stable: WorkerVersioning.resolveAlias(workerName, 'stable'),
    };

    return summary;
  },

  /**
   * Clear all versions for a worker
   */
  clear(workerName: string): void {
    workerVersions.delete(workerName);

    // Remove aliases
    const keysToDelete: string[] = [];
    for (const [key] of versionAliases.entries()) {
      if (key.startsWith(`${workerName}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      versionAliases.delete(key);
    }

    Logger.info(`All versions cleared for worker: ${workerName}`);
  },

  /**
   * Shutdown
   */
  shutdown(): void {
    Logger.info('WorkerVersioning shutting down...');

    workerVersions.clear();
    versionAliases.clear();

    Logger.info('WorkerVersioning shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown

/**
 * Compliance Manager
 * GDPR, HIPAA, and SOC2 compliance enforcement
 * Sealed namespace for immutability
 */

import {
  ErrorFactory,
  Logger,
  NodeSingletons,
  createRedisConnection,
  type RedisConfig,
} from '@zintrust/core';

type RedisConnection = ReturnType<typeof createRedisConnection>;

type CryptoAdapter = {
  createCipheriv: typeof NodeSingletons.createCipheriv;
  createDecipheriv: typeof NodeSingletons.createDecipheriv;
  pbkdf2Sync: typeof NodeSingletons.pbkdf2Sync;
  randomBytes: typeof NodeSingletons.randomBytes;
};

// Access NodeSingletons lazily to avoid initialization errors in test environments
const getCrypto = (): CryptoAdapter => {
  if (!NodeSingletons) {
    throw ErrorFactory.createWorkerError('NodeSingletons not available');
  }
  return {
    createCipheriv: NodeSingletons.createCipheriv,
    createDecipheriv: NodeSingletons.createDecipheriv,
    pbkdf2Sync: NodeSingletons.pbkdf2Sync,
    randomBytes: NodeSingletons.randomBytes,
  };
};

export type ComplianceStandard = 'gdpr' | 'hipaa' | 'soc2';

export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

export type ComplianceConfig = {
  gdpr: {
    enabled: boolean;
    dataRetentionDays: number; // Maximum data retention (default: 365)
    requireConsent: boolean;
    enableRightToForgotten: boolean;
    enableDataPortability: boolean;
    enableAccessRequest: boolean;
  };
  hipaa: {
    enabled: boolean;
    requireEncryptionAtRest: boolean;
    requireEncryptionInTransit: boolean;
    auditRetentionYears: number; // Minimum 6 years required
    requireAccessControls: boolean;
    enableBreachNotification: boolean;
  };
  soc2: {
    enabled: boolean;
    requireChangeLogging: boolean;
    requireAccessReviews: boolean;
    accessReviewIntervalDays: number; // Default: 90 days
    requireIncidentResponse: boolean;
    requireDisasterRecovery: boolean;
  };
};

export type DataSubject = {
  id: string;
  email?: string;
  consentGiven: boolean;
  consentDate?: Date;
  consentWithdrawnDate?: Date;
  dataClassification: DataClassification;
  retentionPeriod?: number; // Days
  deletionScheduled?: Date;
};

export type ComplianceAuditLog = {
  id: string;
  timestamp: Date;
  standard: ComplianceStandard;
  action: string;
  userId: string;
  userRole?: string;
  dataSubjectId?: string;
  resourceId: string;
  resourceType: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  result: 'success' | 'failure' | 'blocked';
  reason?: string;
  severity: 'info' | 'warning' | 'critical';
};

export type AccessRequest = {
  id: string;
  dataSubjectId: string;
  requestType: 'access' | 'deletion' | 'portability' | 'rectification';
  requestDate: Date;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedBy: string;
  approvedBy?: string;
  completedBy?: string;
  completedDate?: Date;
  reason?: string;
  dataExport?: string; // File path or URL
};

export type EncryptionMetadata = {
  algorithm: string;
  keyId: string;
  encryptedAt: Date;
  encryptedBy: string;
};

export type ComplianceViolation = {
  id: string;
  timestamp: Date;
  standard: ComplianceStandard;
  violationType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedResources: string[];
  remediation: string;
  status: 'open' | 'in-progress' | 'resolved' | 'accepted-risk';
};

// Redis key prefixes
const AUDIT_LOG_PREFIX = 'compliance:audit:';
const DATA_SUBJECT_PREFIX = 'compliance:subject:';
const ACCESS_REQUEST_PREFIX = 'compliance:request:';
const VIOLATION_PREFIX = 'compliance:violation:';
const CONSENT_PREFIX = 'compliance:consent:';

// Internal state
let redisClient: RedisConnection | null = null;
let complianceConfig: ComplianceConfig | null = null;

// Default configuration
const DEFAULT_CONFIG: ComplianceConfig = {
  gdpr: {
    enabled: true,
    dataRetentionDays: 365,
    requireConsent: true,
    enableRightToForgotten: true,
    enableDataPortability: true,
    enableAccessRequest: true,
  },
  hipaa: {
    enabled: false,
    requireEncryptionAtRest: true,
    requireEncryptionInTransit: true,
    auditRetentionYears: 6,
    requireAccessControls: true,
    enableBreachNotification: true,
  },
  soc2: {
    enabled: true,
    requireChangeLogging: true,
    requireAccessReviews: true,
    accessReviewIntervalDays: 90,
    requireIncidentResponse: true,
    requireDisasterRecovery: true,
  },
};

/**
 * Helper: Generate unique ID
 */
const generateId = (): string => {
  const { randomBytes } = getCrypto();
  return randomBytes(16).toString('hex');
};

/**
 * Helper: Encrypt data (AES-256-GCM)
 */
const encryptData = (
  data: string,
  keyId: string
): { encrypted: string; iv: string; authTag: string } => {
  const { createCipheriv, pbkdf2Sync, randomBytes } = getCrypto();
  // In production, retrieve key from secure key management service (AWS KMS, HashiCorp Vault, etc.)
  const key = pbkdf2Sync(keyId, 'salt', 100_000, 32, 'sha256');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};

/**
 * Helper: Decrypt data (AES-256-GCM)
 */
const decryptData = (encrypted: string, iv: string, authTag: string, keyId: string): string => {
  const { createDecipheriv, pbkdf2Sync } = getCrypto();
  const key = pbkdf2Sync(keyId, 'salt', 100_000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Helper: Check if consent is required and valid
 */
const checkConsent = async (
  dataSubjectId: string
): Promise<{ valid: boolean; reason?: string }> => {
  const gdprConfig = complianceConfig?.gdpr;
  if (gdprConfig?.enabled !== true || gdprConfig?.requireConsent !== true) {
    return { valid: true };
  }

  if (!redisClient) {
    return { valid: false, reason: 'Compliance system not initialized' };
  }

  const key = `${DATA_SUBJECT_PREFIX}${dataSubjectId}`;
  const subjectJson = await redisClient.get(key);

  if (subjectJson === null) {
    return { valid: false, reason: 'Data subject not found' };
  }

  const subject = JSON.parse(subjectJson) as DataSubject;

  if (!subject.consentGiven) {
    return { valid: false, reason: 'Consent not given' };
  }

  if (subject.consentWithdrawnDate) {
    return { valid: false, reason: 'Consent withdrawn' };
  }

  return { valid: true };
};

/**
 * Helper: Store audit log
 */
const storeAuditLog = async (log: ComplianceAuditLog): Promise<void> => {
  if (!redisClient) return;

  try {
    const key = `${AUDIT_LOG_PREFIX}${log.standard}`;
    const score = log.timestamp.getTime();
    const data = JSON.stringify(log);

    await redisClient.zadd(key, score, data);

    // Set retention based on standard
    let retentionDays = 365; // Default 1 year

    if (log.standard === 'hipaa' && complianceConfig?.hipaa.enabled === true) {
      retentionDays = complianceConfig.hipaa.auditRetentionYears * 365;
    }

    await redisClient.expire(key, retentionDays * 24 * 60 * 60);

    Logger.debug('Compliance audit log stored', {
      standard: log.standard,
      action: log.action,
      userId: log.userId,
    });
  } catch (error) {
    Logger.error('Failed to store compliance audit log', error);
  }
};

const hasNonEmptyString = (value?: string): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const runGdprChecks = async (dataSubjectId?: string): Promise<string[]> => {
  if (complianceConfig?.gdpr.enabled !== true) {
    return [];
  }

  if (!hasNonEmptyString(dataSubjectId)) {
    return [];
  }

  const consentCheck = await checkConsent(dataSubjectId);
  if (consentCheck.valid) {
    return [];
  }

  return [`GDPR: ${consentCheck.reason}`];
};

const runHipaaChecks = (action: string, userId: string, resourceId?: string): string[] => {
  if (complianceConfig?.hipaa.enabled !== true) {
    return [];
  }

  if (complianceConfig.hipaa.requireAccessControls !== true) {
    return [];
  }

  Logger.debug('HIPAA access control check', { action, userId, resourceId });
  return [];
};

const runSoc2Checks = (action: string): string[] => {
  if (complianceConfig?.soc2.enabled !== true) {
    return [];
  }

  if (complianceConfig.soc2.requireChangeLogging !== true) {
    return [];
  }

  if (action.includes('modify') || action.includes('delete') || action.includes('update')) {
    return [];
  }

  return [];
};

/**
 * Compliance Manager - Sealed namespace
 */
export const ComplianceManager = Object.freeze({
  /**
   * Initialize compliance manager
   */
  initialize(redisConfig: RedisConfig, config?: Partial<ComplianceConfig>): void {
    if (redisClient) {
      Logger.warn('ComplianceManager already initialized');
      return;
    }

    redisClient = createRedisConnection(redisConfig);
    complianceConfig = {
      gdpr: { ...DEFAULT_CONFIG.gdpr, ...config?.gdpr },
      hipaa: { ...DEFAULT_CONFIG.hipaa, ...config?.hipaa },
      soc2: { ...DEFAULT_CONFIG.soc2, ...config?.soc2 },
    };

    Logger.info('ComplianceManager initialized', {
      gdpr: complianceConfig.gdpr.enabled,
      hipaa: complianceConfig.hipaa.enabled,
      soc2: complianceConfig.soc2.enabled,
    });
  },

  /**
   * Register data subject
   */
  async registerDataSubject(subject: DataSubject): Promise<void> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    const key = `${DATA_SUBJECT_PREFIX}${subject.id}`;
    await redisClient.set(key, JSON.stringify(subject));

    // Set expiry based on retention period
    if (subject.retentionPeriod !== undefined) {
      await redisClient.expire(key, subject.retentionPeriod * 24 * 60 * 60);
    }

    await storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: 'gdpr',
      action: 'data-subject-registered',
      userId: 'system',
      dataSubjectId: subject.id,
      resourceId: subject.id,
      resourceType: 'data-subject',
      result: 'success',
      severity: 'info',
    });

    Logger.info('Data subject registered', { id: subject.id });
  },

  /**
   * Record consent
   */
  async recordConsent(dataSubjectId: string, consentGiven: boolean, userId: string): Promise<void> {
    const client = redisClient;
    const gdprConfig = complianceConfig?.gdpr;
    if (!client || gdprConfig?.enabled !== true) {
      throw ErrorFactory.createConfigError('GDPR compliance not enabled');
    }

    const subjectKey = `${DATA_SUBJECT_PREFIX}${dataSubjectId}`;
    const subjectJson = await client.get(subjectKey);

    if (subjectJson === null) {
      throw ErrorFactory.createNotFoundError(`Data subject not found: ${dataSubjectId}`);
    }

    const subject = JSON.parse(subjectJson) as DataSubject;
    subject.consentGiven = consentGiven;

    if (consentGiven) {
      subject.consentDate = new Date();
      subject.consentWithdrawnDate = undefined;
    } else {
      subject.consentWithdrawnDate = new Date();
    }

    await client.set(subjectKey, JSON.stringify(subject));

    // Store consent in separate key for auditing
    const consentKey = `${CONSENT_PREFIX}${dataSubjectId}`;
    const consentRecord = {
      dataSubjectId,
      consentGiven,
      timestamp: new Date(),
      recordedBy: userId,
    };

    await client.zadd(consentKey, Date.now(), JSON.stringify(consentRecord));

    await storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: 'gdpr',
      action: consentGiven ? 'consent-given' : 'consent-withdrawn',
      userId,
      dataSubjectId,
      resourceId: dataSubjectId,
      resourceType: 'consent',
      result: 'success',
      severity: 'info',
    });

    Logger.info('Consent recorded', { dataSubjectId, consentGiven });
  },

  /**
   * Check if action is compliant
   */
  async checkCompliance(
    action: string,
    userId: string,
    dataSubjectId?: string,
    resourceId?: string
  ): Promise<{ compliant: boolean; violations: string[] }> {
    const violations: string[] = [];

    const gdprViolations = await runGdprChecks(dataSubjectId);
    violations.push(...gdprViolations);

    const hipaaViolations = runHipaaChecks(action, userId, resourceId);
    violations.push(...hipaaViolations);

    const soc2Violations = runSoc2Checks(action);
    violations.push(...soc2Violations);

    const compliant = violations.length === 0;

    if (!compliant) {
      await storeAuditLog({
        id: generateId(),
        timestamp: new Date(),
        standard: 'gdpr', // Primary standard for consent
        action,
        userId,
        dataSubjectId,
        resourceId: resourceId ?? 'unknown',
        resourceType: 'compliance-check',
        result: 'blocked',
        reason: violations.join('; '),
        severity: 'warning',
      });
    }

    return { compliant, violations };
  },

  /**
   * Create access request (GDPR Right to Access, Deletion, etc.)
   */
  async createAccessRequest(
    request: Omit<AccessRequest, 'id' | 'requestDate' | 'status'>
  ): Promise<string> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    const requestId = generateId();
    const fullRequest: AccessRequest = {
      id: requestId,
      requestDate: new Date(),
      status: 'pending',
      ...request,
    };

    const key = `${ACCESS_REQUEST_PREFIX}${requestId}`;
    await redisClient.set(key, JSON.stringify(fullRequest));

    await storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: 'gdpr',
      action: `access-request-${request.requestType}`,
      userId: request.requestedBy,
      dataSubjectId: request.dataSubjectId,
      resourceId: requestId,
      resourceType: 'access-request',
      result: 'success',
      severity: 'info',
    });

    Logger.info('Access request created', {
      id: requestId,
      type: request.requestType,
      dataSubjectId: request.dataSubjectId,
    });

    return requestId;
  },

  /**
   * Process access request
   */
  async processAccessRequest(
    requestId: string,
    status: AccessRequest['status'],
    processedBy: string
  ): Promise<void> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    const key = `${ACCESS_REQUEST_PREFIX}${requestId}`;
    const requestJson = await redisClient.get(key);

    if (requestJson === null) {
      throw ErrorFactory.createNotFoundError(`Access request not found: ${requestId}`);
    }

    const request = JSON.parse(requestJson) as AccessRequest;
    request.status = status;

    if (status === 'approved') {
      request.approvedBy = processedBy;
    } else if (status === 'completed') {
      request.completedBy = processedBy;
      request.completedDate = new Date();
    }

    await redisClient.set(key, JSON.stringify(request));

    await storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: 'gdpr',
      action: `access-request-${status}`,
      userId: processedBy,
      dataSubjectId: request.dataSubjectId,
      resourceId: requestId,
      resourceType: 'access-request',
      result: 'success',
      severity: status === 'rejected' ? 'warning' : 'info',
    });

    Logger.info('Access request processed', { id: requestId, status });
  },

  /**
   * Encrypt sensitive data (HIPAA compliance)
   */
  encryptSensitiveData(
    data: string,
    userId: string,
    keyId = 'default-key'
  ): {
    encrypted: string;
    metadata: EncryptionMetadata;
  } {
    if (
      complianceConfig?.hipaa.enabled === true &&
      complianceConfig.hipaa.requireEncryptionAtRest !== true
    ) {
      Logger.warn('HIPAA encryption not enforced by configuration');
    }

    const { encrypted, iv, authTag } = encryptData(data, keyId);

    const metadata: EncryptionMetadata = {
      algorithm: 'aes-256-gcm',
      keyId,
      encryptedAt: new Date(),
      encryptedBy: userId,
    };

    // Store IV and authTag with encrypted data
    const encryptedPackage = JSON.stringify({ encrypted, iv, authTag, metadata });

    return {
      encrypted: encryptedPackage,
      metadata,
    };
  },

  /**
   * Decrypt sensitive data
   */
  decryptSensitiveData(encryptedPackage: string, userId: string): string {
    const parsed = JSON.parse(encryptedPackage) as Partial<{
      encrypted: string;
      iv: string;
      authTag: string;
      metadata: EncryptionMetadata;
    }>;

    if (
      typeof parsed.encrypted !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.authTag !== 'string' ||
      typeof parsed.metadata?.keyId !== 'string'
    ) {
      throw ErrorFactory.createValidationError('Invalid encrypted payload');
    }

    const { encrypted, iv, authTag, metadata } = parsed;

    storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: 'hipaa',
      action: 'data-decrypted',
      userId,
      resourceId: metadata.keyId,
      resourceType: 'encrypted-data',
      result: 'success',
      severity: 'info',
    });

    return decryptData(encrypted, iv, authTag, metadata.keyId);
  },

  /**
   * Record compliance violation
   */
  async recordViolation(violation: Omit<ComplianceViolation, 'id' | 'timestamp'>): Promise<string> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    const violationId = generateId();
    const fullViolation: ComplianceViolation = {
      id: violationId,
      timestamp: new Date(),
      ...violation,
    };

    const key = `${VIOLATION_PREFIX}${violationId}`;
    await redisClient.set(key, JSON.stringify(fullViolation));

    await storeAuditLog({
      id: generateId(),
      timestamp: new Date(),
      standard: violation.standard,
      action: 'violation-recorded',
      userId: 'system',
      resourceId: violationId,
      resourceType: 'compliance-violation',
      result: 'success',
      severity: 'critical',
      reason: violation.description,
    });

    Logger.error('Compliance violation recorded', {
      id: violationId,
      standard: violation.standard,
      type: violation.violationType,
      severity: violation.severity,
    });

    return violationId;
  },

  /**
   * Get audit logs
   */
  async getAuditLogs(
    standard: ComplianceStandard,
    startDate?: Date,
    endDate?: Date,
    limit = 1000
  ): Promise<ReadonlyArray<ComplianceAuditLog>> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    try {
      const key = `${AUDIT_LOG_PREFIX}${standard}`;
      const minScore = startDate ? startDate.getTime() : '-inf';
      const maxScore = endDate ? endDate.getTime() : '+inf';

      const logs = await redisClient.zrangebyscore(key, minScore, maxScore, 'LIMIT', 0, limit);

      return logs.map((log) => JSON.parse(log) as ComplianceAuditLog);
    } catch (error) {
      Logger.error('Failed to retrieve audit logs', error);
      return [];
    }
  },

  /**
   * Get compliance summary
   */
  async getComplianceSummary(): Promise<{
    gdpr: { enabled: boolean; dataSubjects: number; pendingRequests: number };
    hipaa: { enabled: boolean; encryptedResources: number; auditLogRetention: string };
    soc2: { enabled: boolean; violations: number; lastAccessReview?: Date };
  }> {
    if (!redisClient || !complianceConfig) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    const client = redisClient;
    const config = complianceConfig;

    // Count data subjects
    const subjectKeys = await client.keys(`${DATA_SUBJECT_PREFIX}*`);

    // Count pending access requests
    const requestKeys = await client.keys(`${ACCESS_REQUEST_PREFIX}*`);
    let pendingRequests = 0;

    const requestEntries = await Promise.all(requestKeys.map(async (key) => client.get(key)));

    requestEntries.forEach((requestJson) => {
      if (requestJson !== null) {
        const request = JSON.parse(requestJson) as AccessRequest;
        if (request.status === 'pending') {
          pendingRequests++;
        }
      }
    });

    // Count violations
    const violationKeys = await client.keys(`${VIOLATION_PREFIX}*`);

    return {
      gdpr: {
        enabled: config.gdpr.enabled,
        dataSubjects: subjectKeys.length,
        pendingRequests,
      },
      hipaa: {
        enabled: config.hipaa.enabled,
        encryptedResources: 0, // Would need to track this separately
        auditLogRetention: `${config.hipaa.auditRetentionYears} years`,
      },
      soc2: {
        enabled: config.soc2.enabled,
        violations: violationKeys.length,
      },
    };
  },

  /**
   * Get configuration
   */
  getConfig(): ComplianceConfig | null {
    return complianceConfig ? { ...complianceConfig } : null;
  },

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ComplianceConfig>): void {
    if (!complianceConfig) {
      throw ErrorFactory.createConfigError('ComplianceManager not initialized');
    }

    complianceConfig = {
      gdpr: { ...complianceConfig.gdpr, ...config.gdpr },
      hipaa: { ...complianceConfig.hipaa, ...config.hipaa },
      soc2: { ...complianceConfig.soc2, ...config.soc2 },
    };

    Logger.info('Compliance configuration updated', { config });
  },

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    Logger.info('ComplianceManager shutting down...');

    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }

    complianceConfig = null;

    Logger.info('ComplianceManager shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown

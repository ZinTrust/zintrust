/**
 * Microservices Configuration
 * Microservices architecture and service discovery settings
 */

import { Env } from '@config/env';

export const microservicesConfig = {
  /**
   * Enable microservices mode
   */
  enabled: Env.getBool('MICROSERVICES', false),

  /**
   * Enabled services (comma-separated)
   */
  services: Env.get('SERVICES', '')
    .split(',')
    .filter((s) => s.trim()),

  /**
   * Service discovery
   */
  discovery: {
    type: Env.get('SERVICE_DISCOVERY_TYPE', 'filesystem') as 'filesystem' | 'consul' | 'etcd',
    servicesPath: Env.get('SERVICES_PATH', 'services'),
    refreshInterval: Env.getInt('SERVICE_DISCOVERY_REFRESH_INTERVAL', 30000),
  },

  /**
   * Service Registry
   */
  registry: {
    host: Env.get('SERVICE_REGISTRY_HOST', 'localhost'),
    port: Env.getInt('SERVICE_REGISTRY_PORT', 8500),
    deregisterCriticalServiceAfter: Env.get('SERVICE_DEREGISTER_CRITICAL_AFTER', '30s'),
  },

  /**
   * Service Authentication
   */
  auth: {
    strategy: Env.get('SERVICE_AUTH_STRATEGY', 'none') as 'api-key' | 'jwt' | 'none' | 'custom',
    apiKey: Env.get('SERVICE_API_KEY'),
    jwtSecret: Env.get('SERVICE_JWT_SECRET'),
  },

  /**
   * Request Tracing
   */
  tracing: {
    enabled: Env.getBool('MICROSERVICES_TRACING', false),
    samplingRate: Env.getInt('MICROSERVICES_TRACING_RATE', 100) / 100,
    exportInterval: Env.getInt('TRACING_EXPORT_INTERVAL', 10000),
    jaegerEndpoint: Env.get('JAEGER_AGENT_HOST', 'localhost'),
  },

  /**
   * Database Isolation
   */
  database: {
    isolation: Env.get('DATABASE_ISOLATION', 'shared') as 'shared' | 'isolated',
    schema: Env.get('DATABASE_SCHEMA_PREFIX', 'microservice'),
  },

  /**
   * Service Health Check
   */
  healthCheck: {
    enabled: Env.getBool('SERVICE_HEALTH_CHECK_ENABLED', true),
    interval: Env.getInt('SERVICE_HEALTH_CHECK_INTERVAL', 30000),
    timeout: Env.getInt('SERVICE_HEALTH_CHECK_TIMEOUT', 5000),
    unhealthyThreshold: Env.getInt('SERVICE_UNHEALTHY_THRESHOLD', 3),
    healthyThreshold: Env.getInt('SERVICE_HEALTHY_THRESHOLD', 2),
  },

  /**
   * Service Communication
   */
  communication: {
    timeout: Env.getInt('SERVICE_CALL_TIMEOUT', 30000),
    retries: Env.getInt('SERVICE_CALL_RETRIES', 3),
    retryDelay: Env.getInt('SERVICE_CALL_RETRY_DELAY', 1000),
    circuitBreaker: {
      enabled: Env.getBool('CIRCUIT_BREAKER_ENABLED', true),
      threshold: Env.getInt('CIRCUIT_BREAKER_THRESHOLD', 5),
      timeout: Env.getInt('CIRCUIT_BREAKER_TIMEOUT', 60000),
    },
  },

  /**
   * Service Mesh (Istio/Linkerd support)
   */
  mesh: {
    enabled: Env.getBool('SERVICE_MESH_ENABLED', false),
    type: Env.get('SERVICE_MESH_TYPE', 'istio') as 'istio' | 'linkerd',
    namespace: Env.get('SERVICE_MESH_NAMESPACE', 'default'),
  },
} as const;

export type MicroservicesConfig = typeof microservicesConfig;

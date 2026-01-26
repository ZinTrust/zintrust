export interface WorkerType {
  name: string;
  queueName: string;
  processor: string;
  version: string;
  options: Options;
  infrastructure: Infrastructure;
  features: Features;
  datacenter: Datacenter;
}

export interface Options {
  concurrency: number;
  limiter: Limiter;
}

export interface Limiter {
  max: number;
  duration: number;
}

export interface Infrastructure {
  persistence: Persistence;
  redis: Redis;
  deadLetterQueue: DeadLetterQueue;
  compliance: Compliance;
  observability: Observability;
  autoScaler: AutoScaler;
}

export interface Persistence {
  driver: string;
}

export interface Redis {
  env: boolean;
  host: string;
  port: string;
  db: string;
  password: string;
}

export interface DeadLetterQueue {
  policy: string;
}

export interface Compliance {
  config: Config;
}

export interface Config {
  retentionDays: number;
}

export interface Observability {
  enabled: boolean;
}

export interface AutoScaler {
  enabled: boolean;
  minWorkers: number;
  maxWorkers: number;
}

export interface Features {
  clustering: boolean;
  metrics: boolean;
  autoScaling: boolean;
  circuitBreaker: boolean;
  deadLetterQueue: boolean;
  resourceMonitoring: boolean;
  compliance: boolean;
  observability: boolean;
  plugins: boolean;
  versioning: boolean;
  datacenterOrchestration: boolean;
}

export interface Datacenter {
  primaryRegion: string;
  secondaryRegions: string[];
  affinityRules: AffinityRules;
}

export interface AffinityRules {
  preferLocal: boolean;
  maxLatency: number;
  avoidRegions: string[];
}

/**
 * Circuit Breaker Pattern
 * Fault tolerance with version tracking and automatic recovery
 * Sealed namespace for immutability
 */

import { Logger } from '@zintrust/core';

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitBreakerConfig = {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting to recover (half-open)
  resetTimeout: number; // Time in ms to reset failure count in closed state
  volumeThreshold: number; // Minimum requests before considering failure rate
};

export type CircuitBreakerState = {
  workerName: string;
  version: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  nextRetryTime: Date | null;
  errorRate: number;
};

export type CircuitBreakerEvent = {
  workerName: string;
  version: string;
  event: 'opened' | 'closed' | 'half-open' | 'success' | 'failure' | 'rejected';
  state: CircuitState;
  timestamp: Date;
  reason?: string;
  error?: Error;
};

// Internal state
const circuits = new Map<string, CircuitBreakerState>();
const eventHistory = new Map<string, CircuitBreakerEvent[]>();
const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 1 minute
  resetTimeout: 300000, // 5 minutes
  volumeThreshold: 10,
};

/**
 * Helper: Get circuit key
 */
const getCircuitKey = (workerName: string, version: string): string => {
  return `${workerName}:${version}`;
};

/**
 * Helper: Record event
 */
const recordEvent = (event: CircuitBreakerEvent): void => {
  const key = getCircuitKey(event.workerName, event.version);
  let history = eventHistory.get(key);

  if (!history) {
    history = [];
    eventHistory.set(key, history);
  }

  history.push(event);

  // Keep only last 1000 events
  if (history.length > 1000) {
    history.shift();
  }

  Logger.debug(`Circuit breaker event: ${event.workerName}:${event.version} - ${event.event}`, {
    state: event.state,
    reason: event.reason,
  });
};

/**
 * Helper: Transition to new state
 */
const transitionState = (
  circuit: CircuitBreakerState,
  newState: CircuitState,
  reason: string
): void => {
  const oldState = circuit.state;
  circuit.state = newState;
  circuit.lastStateChange = new Date();

  if (newState === 'open') {
    circuit.nextRetryTime = new Date(Date.now() + defaultConfig.timeout);
  } else if (newState === 'closed') {
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.nextRetryTime = null;
  } else if (newState === 'half-open') {
    circuit.successCount = 0;
    circuit.nextRetryTime = null;
  }

  Logger.info(`Circuit breaker state transition: ${circuit.workerName}:${circuit.version}`, {
    from: oldState,
    to: newState,
    reason,
  });

  const eventType: CircuitBreakerEvent['event'] = newState === 'open' ? 'opened' : newState;

  recordEvent({
    workerName: circuit.workerName,
    version: circuit.version,
    event: eventType,
    state: newState,
    timestamp: new Date(),
    reason,
  });
};

/**
 * Helper: Calculate error rate
 */
const calculateErrorRate = (circuit: CircuitBreakerState): number => {
  if (circuit.totalRequests === 0) {
    return 0;
  }

  return (circuit.failureCount / circuit.totalRequests) * 100;
};

/**
 * Helper: Check if should reset failure count
 */
const shouldResetFailureCount = (circuit: CircuitBreakerState): boolean => {
  if (!circuit.lastFailureTime) {
    return false;
  }

  const timeSinceLastFailure = Date.now() - circuit.lastFailureTime.getTime();
  return timeSinceLastFailure > defaultConfig.resetTimeout;
};

/**
 * Circuit Breaker - Sealed namespace
 */
export const CircuitBreaker = Object.freeze({
  /**
   * Initialize circuit breaker for a worker version
   */
  initialize(workerName: string, version: string): void {
    const key = getCircuitKey(workerName, version);

    if (circuits.has(key)) {
      Logger.debug(`Circuit breaker already exists: ${key}`);
      return;
    }

    const circuit: CircuitBreakerState = {
      workerName,
      version,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      lastStateChange: new Date(),
      nextRetryTime: null,
      errorRate: 0,
    };

    circuits.set(key, circuit);

    Logger.info(`Circuit breaker initialized: ${key}`);
  },

  /**
   * Check if circuit allows execution
   */
  canExecute(workerName: string, version: string): boolean {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      // No circuit exists, create and allow
      CircuitBreaker.initialize(workerName, version);
      return true;
    }

    const now = Date.now();

    // Reset failure count if enough time has passed
    if (circuit.state === 'closed' && shouldResetFailureCount(circuit)) {
      circuit.failureCount = 0;
      circuit.totalRequests = 0;
      Logger.debug(`Reset failure count for ${key}`);
    }

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has passed to try half-open
        if (circuit.nextRetryTime && now >= circuit.nextRetryTime.getTime()) {
          transitionState(circuit, 'half-open', 'Timeout elapsed, attempting recovery');
          return true;
        }
        return false;

      case 'half-open':
        // Allow limited requests to test recovery
        return true;
    }
  },

  /**
   * Record successful execution
   */
  recordSuccess(workerName: string, version: string): void {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      CircuitBreaker.initialize(workerName, version);
      return;
    }

    circuit.successCount++;
    circuit.totalRequests++;
    circuit.lastSuccessTime = new Date();
    circuit.errorRate = calculateErrorRate(circuit);

    recordEvent({
      workerName,
      version,
      event: 'success',
      state: circuit.state,
      timestamp: new Date(),
    });

    // Transition based on state
    if (circuit.state === 'half-open') {
      if (circuit.successCount >= defaultConfig.successThreshold) {
        transitionState(circuit, 'closed', `${circuit.successCount} consecutive successes`);
      }
    }
  },

  /**
   * Record failed execution
   */
  recordFailure(workerName: string, version: string, error: Error): void {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      CircuitBreaker.initialize(workerName, version);
      return;
    }

    circuit.failureCount++;
    circuit.totalRequests++;
    circuit.lastFailureTime = new Date();
    circuit.errorRate = calculateErrorRate(circuit);

    recordEvent({
      workerName,
      version,
      event: 'failure',
      state: circuit.state,
      timestamp: new Date(),
      error,
    });

    // Transition based on state and thresholds
    if (circuit.state === 'half-open') {
      // Any failure in half-open reopens the circuit
      transitionState(circuit, 'open', 'Failure during recovery attempt');
    } else if (circuit.state === 'closed') {
      // Check if should open based on failure threshold
      if (circuit.totalRequests >= defaultConfig.volumeThreshold) {
        if (circuit.failureCount >= defaultConfig.failureThreshold) {
          transitionState(
            circuit,
            'open',
            `Failure threshold exceeded: ${circuit.failureCount}/${defaultConfig.failureThreshold}`
          );
        }
      }
    }
  },

  /**
   * Record rejected execution (when circuit is open)
   */
  recordRejection(workerName: string, version: string): void {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      return;
    }

    recordEvent({
      workerName,
      version,
      event: 'rejected',
      state: circuit.state,
      timestamp: new Date(),
      reason: 'Circuit breaker is open',
    });
  },

  /**
   * Get circuit state
   */
  getState(workerName: string, version: string): CircuitBreakerState | null {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    return circuit ? { ...circuit } : null;
  },

  /**
   * Get all circuit states
   */
  getAllStates(): ReadonlyArray<CircuitBreakerState> {
    return Array.from(circuits.values()).map((circuit) => ({ ...circuit }));
  },

  /**
   * Get circuit states by worker name (all versions)
   */
  getStatesByWorker(workerName: string): ReadonlyArray<CircuitBreakerState> {
    const states: CircuitBreakerState[] = [];

    for (const circuit of circuits.values()) {
      if (circuit.workerName === workerName) {
        states.push({ ...circuit });
      }
    }

    return states;
  },

  /**
   * Get event history
   */
  getEventHistory(
    workerName: string,
    version: string,
    limit = 100
  ): ReadonlyArray<CircuitBreakerEvent> {
    const key = getCircuitKey(workerName, version);
    const history = eventHistory.get(key) ?? [];

    return history.slice(-limit).map((event) => ({ ...event }));
  },

  /**
   * Manually reset circuit to closed state
   */
  reset(workerName: string, version: string): void {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      Logger.warn(`Circuit breaker not found: ${key}`);
      return;
    }

    transitionState(circuit, 'closed', 'Manual reset');
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.totalRequests = 0;
    circuit.errorRate = 0;

    Logger.info(`Circuit breaker manually reset: ${key}`);
  },

  /**
   * Manually force circuit to open state
   */
  forceOpen(workerName: string, version: string, reason: string): void {
    const key = getCircuitKey(workerName, version);
    const circuit = circuits.get(key);

    if (!circuit) {
      CircuitBreaker.initialize(workerName, version);
      const newCircuit = circuits.get(key);
      if (!newCircuit) {
        return;
      }
      transitionState(newCircuit, 'open', `Forced open: ${reason}`);
      return;
    }

    transitionState(circuit, 'open', `Forced open: ${reason}`);

    Logger.warn(`Circuit breaker forced open: ${key}`, { reason });
  },

  /**
   * Delete circuit breaker
   */
  delete(workerName: string, version: string): void {
    const key = getCircuitKey(workerName, version);
    circuits.delete(key);
    eventHistory.delete(key);

    Logger.info(`Circuit breaker deleted: ${key}`);
  },

  /**
   * Delete all circuit breakers for a worker (all versions)
   */
  deleteWorker(workerName: string): void {
    const keysToDelete: string[] = [];

    for (const [key, circuit] of circuits.entries()) {
      if (circuit.workerName === workerName) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      circuits.delete(key);
      eventHistory.delete(key);
    }

    Logger.info(`Deleted all circuit breakers for worker: ${workerName}`, {
      count: keysToDelete.length,
    });
  },

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    circuitsByWorker: Record<string, number>;
  } {
    const summary = {
      totalCircuits: circuits.size,
      openCircuits: 0,
      halfOpenCircuits: 0,
      closedCircuits: 0,
      circuitsByWorker: {} as Record<string, number>,
    };

    for (const circuit of circuits.values()) {
      switch (circuit.state) {
        case 'open':
          summary.openCircuits++;
          break;
        case 'half-open':
          summary.halfOpenCircuits++;
          break;
        case 'closed':
          summary.closedCircuits++;
          break;
      }

      summary.circuitsByWorker[circuit.workerName] =
        (summary.circuitsByWorker[circuit.workerName] || 0) + 1;
    }

    return summary;
  },

  /**
   * Shutdown and clear all circuits
   */
  shutdown(): void {
    Logger.info('CircuitBreaker shutting down...');

    circuits.clear();
    eventHistory.clear();

    Logger.info('CircuitBreaker shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', () => {
  CircuitBreaker.shutdown();
});

process.on('SIGINT', () => {
  CircuitBreaker.shutdown();
});

// @ts-nocheck - Example middleware - WIP
/**
 * Profiler Middleware
 * Enables request profiling when ENABLE_PROFILER environment variable is set
 */

import { Middleware } from '@middleware/MiddlewareStack';
import { RequestProfiler } from '@profiling/RequestProfiler';
import { Logger } from '@config/logger';

/**
 * ProfilerMiddleware wraps request execution with performance profiling
 * Enabled via ENABLE_PROFILER=true environment variable
 * Attaches profiling report to response headers
 */
export const ProfilerMiddleware: Middleware = async (req, res, next) => {
  const isEnabled = process.env.ENABLE_PROFILER === 'true';

  if (!isEnabled) {
    // Pass through without profiling
    await next();
    return;
  }

  const profiler = new RequestProfiler();
  const queryLogger = profiler.getQueryLogger();

  // Set up query logging if database is available
  const db = (req as any).db;
  if (db?.onAfterQuery) {
    db.onAfterQuery((sql: string, params: unknown[], duration: number) => {
      queryLogger.logQuery(sql, params, duration, 'middleware-profiling');
    });
  }

  // Capture request execution
  const profile = await profiler.captureRequest(() => next());

  // Attach profile to response
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.profile = profile;

  // Add profiling report to response header
  try {
    const report = profiler.generateReport(profile);
    res.setHeader('X-Profiler-Report', Buffer.from(report).toString('base64'));
    res.setHeader('X-Profiler-Queries', profile.queriesExecuted.toString());
    res.setHeader('X-Profiler-Duration', profile.duration.toString());

    if (profile.n1Patterns.length > 0) {
      res.setHeader('X-Profiler-N1-Patterns', profile.n1Patterns.length.toString());
    }
  } catch (error) {
    // Silently fail if header encoding fails
    Logger.error('Failed to encode profiler report header:', error);
  }
};

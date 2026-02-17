# Queue Prevention Mechanisms

To prevent infinite loops and runaway job duplication in the queue recovery system, the following mechanisms should be considered:

## 1. Strict Idempotency & Job ID Preservation (Implemented)

- **Mechanism:** Ensure that every job has a deterministic `jobId` or `uniqueId` that persists across recovery attempts.
- **Benefit:** Prevents `HttpQueueDriver` from generating new UUIDs when a request fails, stopping the multiplication of identical jobs.
- **Status:** Fixed in `JobRecoveryDaemon.ts` and `HttpQueueDriver.ts`.

## 2. Progressive Backoff with Attempt Tracking (Implemented)

- **Mechanism:** Use an explicit backoff strategy (30s, 60s, 180s) and strictly increment the `attempts` counter during recovery.
- **Benefit:** Ensures that even if the network fails repeatedly, the job eventually hits `maxAttempts` and is moved to `dead_letter` instead of looping forever.
- **Status:** Fixed in `JobRecoveryDaemon.ts` (incrementing `_currentAttempts`).

## 3. Internal RPC Network Isolation

- **Mechanism:** Implement a separate rate limiter or bypass for internal Docker container traffic (e.g., allowlist `172.x` IPs).
- **Benefit:** Prevents the "Recovery Daemon" from being blocked by the "Global Rate Limiter" when it tries to save the system, which was the root cause of the timeouts.
- **Recommendation:** Verify `RateLimiter.ts` logic diligently.

## 4. Circuit Breaker Pattern

- **Mechanism:** If `HttpQueueDriver` detects a high failure rate (e.g., > 10% of requests failing/timing out), immediately stop all recovery attempts for a cool-down period.
- **Benefit:** Prevents flooding the logs and the database with `pending_recovery` transitions during a partial outage.

## 5. Transition Velocity Guard (Debounce)

- **Mechanism:** Before marking a job as `pending_recovery`, check the `zintrust_job_transitions` table. If the job has transitioned > 5 times in the last minute, force it to `manual_review`.
- **Benefit:** "Fails fast" for hyper-active loops that might bypass other checks.

## 6. Development Safeguards

- **Mechanism:** Add `pull_count` column or logic to `JobStateTracker` to strictly enforce the "3 tries" rule at the database level.
- **Status:** Partially covered by `attempts` usage.

## 7. Automated DLQ Analysis

- **Mechanism:** A scheduled task that groups `dead_letter` jobs by error message and auto-archives them if they match known "ignorable" patterns.

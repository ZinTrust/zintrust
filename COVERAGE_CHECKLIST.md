# Coverage Improvement Checklist & Quick Reference

## Current State Summary

```
Overall Coverage:       82.5%
├── Statements:        87.9%
├── Functions:         86.4%
└── Branches:          73.2% ⚠️ Lowest metric

Files with <90%:       60 files
Total Tests Needed:    ~435 new tests
Estimated Effort:      230 hours (6-9 weeks)
```

---

## Phase 1: Critical Path (Weeks 1-2)

### 🎯 Runtime Adapters - MUST HAVE FOR MULTI-RUNTIME

- [ ] **NodeServerAdapter.ts** (5.7% → 90%+)
  - [ ] Server initialization tests
  - [ ] Request/response pipeline tests
  - [ ] Error handling tests
  - [ ] Middleware integration tests
  - [ ] Graceful shutdown tests
  - **Est:** 40-50 tests | 20-25 hours

- [ ] **DenoAdapter.ts** (5.8% → 90%+)
  - [ ] Deno module resolution tests
  - [ ] Permission handling tests
  - [ ] Signal handling tests
  - [ ] Type transformation tests
  - **Est:** 35-40 tests | 18-22 hours

- [ ] **CloudflareAdapter.ts** (8.6% → 90%+)
  - [ ] Worker context initialization
  - [ ] Environment/KV binding tests
  - [ ] Cache API integration tests
  - [ ] Request transformation tests
  - **Est:** 30-35 tests | 15-18 hours

**Phase 1 Goal:** ✅ All adapters >90%, overall +15% coverage

---

## Phase 2: Core Framework (Weeks 3-4)

### 🎯 Microservices & Database - RELIABILITY CRITICAL

- [ ] **ServiceHealthMonitor.ts** (26.0% → 85%+)
  - [ ] Health check execution
  - [ ] Retry logic with backoff
  - [ ] Timeout enforcement
  - [ ] Circuit breaker states
  - [ ] Recovery mechanisms
  - **Est:** 30-35 tests | 18-22 hours

- [ ] **PostgresAdapter.ts** (38.0% → 85%+)
  - [ ] Connection pool management
  - [ ] Query execution (CRUD)
  - [ ] Transaction handling
  - [ ] Error recovery
  - [ ] Batch operations
  - **Est:** 35-40 tests | 22-28 hours

- [ ] **Model.ts** (52.0% → 85%+)
  - [ ] Relationship loading
  - [ ] Query scopes
  - [ ] Accessors/mutators
  - [ ] Serialization
  - [ ] Validation
  - **Est:** 25-30 tests | 15-20 hours

- [ ] **ConnectionManager.ts** (59.0% → 85%+)
  - [ ] Pool initialization
  - [ ] Connection lifecycle
  - [ ] Failover logic
  - [ ] Timeout/retry
  - [ ] Named connections
  - **Est:** 20-25 tests | 12-18 hours

**Phase 2 Goal:** ✅ Data layer >85%, overall +20% coverage

---

## Phase 3: Developer Experience (Weeks 5-6)

### 🎯 CLI Commands & Authentication - USER-FACING QUALITY

- [ ] **AddCommand.ts** (53.5% → 80%+)
  - [ ] Service scaffolding
  - [ ] Feature scaffolding
  - [ ] Migration scaffolding
  - [ ] Model scaffolding
  - [ ] Route scaffolding
  - [ ] Error handling (duplicates, invalid names)
  - **Est:** 40-50 tests | 24-32 hours

- [ ] **ServiceAuthMiddleware.ts** (53.8% → 80%+)
  - [ ] Token validation
  - [ ] Permission checking
  - [ ] Service-to-service auth
  - [ ] Unauthorized responses
  - [ ] Token refresh
  - **Est:** 25-30 tests | 15-20 hours

- [ ] **LogsCommand.ts** (38.3% → 75%+)
  - [ ] Log parsing
  - [ ] Level filtering
  - [ ] Date range filtering
  - [ ] Search functionality
  - [ ] Output formatting
  - **Est:** 20-25 tests | 12-18 hours

**Phase 3 Goal:** ✅ User-facing features >75%, overall +15% coverage

---

## Phase 4: Polish & Edge Cases (Weeks 7-8)

### 🎯 Remaining Coverage Gaps

- [ ] **RuntimeAdapter.ts** (58.6% → 90%+)
  - [ ] Runtime detection
  - [ ] Mock creation
  - [ ] Edge cases
  - **Est:** 10-15 tests | 6-10 hours

- [ ] **Router.ts** (60.9% → 90%+)
  - [ ] Complex patterns
  - [ ] Priority handling
  - [ ] Middleware ordering
  - [ ] Parameter extraction
  - **Est:** 15-20 tests | 10-15 hours

- [ ] **ServiceBundler.ts** (61.2% → 85%+)
  - [ ] Bundle generation
  - [ ] Dependency resolution
  - [ ] Metadata collection
  - [ ] Validation
  - **Est:** 15-20 tests | 10-15 hours

- [ ] **Configuration & Utilities**
  - Quick wins: features.ts, ConfigSchema.ts, etc.
  - **Est:** 20-30 tests | 12-18 hours

**Phase 4 Goal:** ✅ Overall >95% coverage, all critical >90%

---

## Quick Wins (Can Do First Week)

These files need only a few tests for big coverage gains:

```
src/config/features.ts           40.2% → 90% (5-10 tests)
src/config/ConfigSchema.ts       62.4% → 85% (10-15 tests)
src/cli/commands/DebugCommand.ts 52.0% → 80% (10-15 tests)
src/profiling/types.ts           33.3% → N/A (type only)
```

**Expected:** +8% overall coverage with 30-40 tests, ~20 hours

---

## Branch Coverage Focus Areas

**Branch coverage is only 73.2% - CRITICAL IMPROVEMENT AREA**

Priority branches to test:

1. **Conditional Statements (if/else)**
   - Files: Router.ts, AddCommand.ts, LogsCommand.ts
   - Action: Test both branches of every condition
   - Impact: +10% branch coverage

2. **Ternary Operators**
   - Files: Model.ts, ServiceAuthMiddleware.ts
   - Action: Test all three outcomes
   - Impact: +5% branch coverage

3. **Switch Statements**
   - Files: BundleOptimizer.ts, Cache drivers
   - Action: Test each case and default
   - Impact: +8% branch coverage

4. **Error Handling**
   - Files: ConnectionManager.ts, PostgresAdapter.ts
   - Action: Test success and error paths
   - Impact: +12% branch coverage

---

## Testing Best Practices for This Codebase

### Unit Test Template

```typescript
describe('[Module Name]', () => {
  describe('[Feature/Method]', () => {
    beforeEach(() => {
      // Setup mocks and fixtures
    });

    it('should [expected behavior]', () => {
      // Arrange
      const input = {
        /* test data */
      };

      // Act
      const result = moduleUnderTest.method(input);

      // Assert
      expect(result).toBe(expected);
    });

    it('should handle [edge case]', () => {
      // Test error conditions, null values, etc.
    });
  });
});
```

### Integration Test Template

```typescript
describe('[System Integration]', () => {
  let app: Application;
  let database: Database;

  beforeEach(async () => {
    // Initialize full system with mocks
    database = new MockDatabase();
    app = new Application({ database });
    await app.boot();
  });

  afterEach(async () => {
    await app.shutdown();
  });

  it('should [end-to-end behavior]', async () => {
    // Test across multiple components
  });
});
```

---

## File Organization for Tests

```
tests/
├── fixtures/
│   ├── mocks.ts           # Mock objects
│   ├── factories.ts        # Factory functions
│   └── data.ts            # Test data
│
├── unit/
│   ├── runtime-adapters/
│   │   ├── NodeServerAdapter.test.ts
│   │   ├── DenoAdapter.test.ts
│   │   ├── CloudflareAdapter.test.ts
│   │   └── FargateAdapter.test.ts
│   │
│   ├── microservices/
│   │   ├── ServiceHealthMonitor.test.ts
│   │   ├── ServiceAuthMiddleware.test.ts
│   │   ├── PostgresAdapter.test.ts
│   │   └── ServiceBundler.test.ts
│   │
│   ├── orm/
│   │   ├── Model.test.ts
│   │   └── ConnectionManager.test.ts
│   │
│   ├── cli/
│   │   ├── AddCommand.test.ts
│   │   ├── LogsCommand.test.ts
│   │   └── DebugCommand.test.ts
│   │
│   └── other/
│       ├── Router.test.ts
│       ├── RuntimeAdapter.test.ts
│       └── Application.test.ts
│
├── integration/
│   ├── adapter-integration.test.ts
│   ├── service-integration.test.ts
│   └── database-integration.test.ts
│
└── e2e/
    ├── full-workflow.test.ts
    └── multiruntime.test.ts
```

---

## Coverage Metrics Tracking

### Weekly Target Progress

**Week 1-2 (Phase 1):**

```
Current:  82.5%  →  Target: 87%
└─ Runtime adapters: 5.7% → 90%+
└─ Impact: +5% overall
```

**Week 3-4 (Phase 2):**

```
Current:  87%  →  Target: 91%
└─ Microservices: 26-59% → 80%+
└─ Impact: +4% overall
```

**Week 5-6 (Phase 3):**

```
Current:  91%  →  Target: 95%
└─ CLI/Auth: 38-54% → 75%+
└─ Impact: +4% overall
```

**Week 7-8 (Phase 4):**

```
Current:  95%  →  Target: 100%
└─ Polish & edge cases
└─ Impact: +5% overall
```

---

## Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- AddCommand.test.ts

# Run with coverage
npm run test:coverage

# Generate HTML coverage report
npm run test:coverage -- --reporter=html
open coverage/index.html

# Watch mode for development
npm test -- --watch

# Run only unit tests
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration

# Check coverage gaps
npm run test:coverage -- --check-coverage --lines 85
```

---

## Key Metrics to Monitor

| Metric     | Current | Target | Notes                     |
| ---------- | ------- | ------ | ------------------------- |
| Overall    | 82.5%   | 100%   | Broken down by type below |
| Statements | 87.9%   | 100%   | Most covered already      |
| Functions  | 86.4%   | 100%   | Good progress possible    |
| Branches   | 73.2%   | 100%   | ⚠️ Needs most work        |
| Files 100% | 58      | 118    | +60 files needed          |
| Files >90% | 78      | 118    | +40 files needed          |
| Files >75% | 97      | 118    | +21 files needed          |

---

## Risk Assessment

### High Risk (Most impact from testing)

- Runtime adapters (5-8% each)
- ServiceHealthMonitor.ts (26%)
- PostgresAdapter.ts (38%)

### Medium Risk

- Model.ts, ConnectionManager.ts
- AddCommand.ts, LogsCommand.ts
- ServiceAuthMiddleware.ts

### Low Risk

- Type definition files (already adequate)
- Files already >85% coverage
- Utility functions

---

## Success Criteria Checklist

### Phase 1 Complete ✅

- [ ] NodeServerAdapter > 90%
- [ ] DenoAdapter > 90%
- [ ] CloudflareAdapter > 90%
- [ ] Overall coverage > 87%
- [ ] All runtime tests green

### Phase 2 Complete ✅

- [ ] ServiceHealthMonitor > 80%
- [ ] PostgresAdapter > 80%
- [ ] Model > 80%
- [ ] ConnectionManager > 80%
- [ ] Overall coverage > 91%

### Phase 3 Complete ✅

- [ ] AddCommand > 75%
- [ ] ServiceAuthMiddleware > 75%
- [ ] LogsCommand > 75%
- [ ] Overall coverage > 95%
- [ ] All CLI tests green

### Phase 4 Complete ✅

- [ ] Overall coverage > 98%
- [ ] All critical paths > 90%
- [ ] Branch coverage > 95%
- [ ] No uncovered critical code
- [ ] All tests passing

### Final Goal ✅

- [ ] **100% statement coverage**
- [ ] **95%+ branch coverage**
- [ ] **All functions tested**
- [ ] **Zero critical gaps**

---

## Resources & References

### Testing Patterns in Codebase

- Look at existing tests in `tests/` directory
- Follow naming conventions: `*.test.ts`
- Use Vitest syntax and API

### Mock Examples

- Check `tests/fixtures/mocks.ts`
- Review existing factory functions
- Use middleware pattern from routing tests

### Documentation

- See `docs/testing.md` for detailed testing guide
- Check `CONTRIBUTING.md` for style guide
- Review existing test patterns

---

## Common Pitfalls to Avoid

❌ **Don't:**

- Write tests that pass without assertions
- Mock everything (defeats integration testing)
- Skip error path testing
- Ignore branch coverage
- Test implementation details instead of behavior

✅ **Do:**

- Write comprehensive assertions
- Mock external dependencies only
- Test both success and failure paths
- Ensure all branches are covered
- Test observable behavior

---

## Team Communication

### Daily Status Template

```
Daily Progress: [Date]

Today:
- Tests added: X
- Coverage gained: Y%
- Blockers: [if any]

Planned for tomorrow:
- [File1.test.ts]
- [File2.test.ts]

Notes:
- [Any insights or patterns]
```

---

**Total Effort:** ~435 tests over 230 hours (6-9 weeks)

This checklist provides a complete roadmap to 100% coverage. Start with Phase 1 (Critical Path) for maximum impact.

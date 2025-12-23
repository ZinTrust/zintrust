// Global Vitest setup
// Ensures required secrets exist so config modules can be imported safely in unit tests.

process.env.JWT_SECRET ??= 'test-jwt-secret';

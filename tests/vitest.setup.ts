// Global Vitest setup
// Ensures required secrets exist so config modules can be imported safely in unit tests.

(process.env as Record<string, string>)['JWT_SECRET'] ??= 'test-jwt-secret';

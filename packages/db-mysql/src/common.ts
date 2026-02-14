/**
 * Common constants and utilities for MySQL adapters
 */

export const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS migrations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    scope VARCHAR(255) NOT NULL DEFAULT 'global',
    service VARCHAR(255) NOT NULL DEFAULT '',
    batch INTEGER NOT NULL,
    status VARCHAR(255) NOT NULL,
    applied_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, scope, service)
  )`;

export const MYSQL_PLACEHOLDER = '?';

export const MYSQL_TYPE = 'mysql';

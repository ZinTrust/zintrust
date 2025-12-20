-- Initialize Zintrust microservices databases
-- This script runs once when PostgreSQL container starts

-- Create schemas for shared database isolation
CREATE SCHEMA IF NOT EXISTS ecommerce_users;
CREATE SCHEMA IF NOT EXISTS ecommerce_orders;
CREATE SCHEMA IF NOT EXISTS ecommerce_payments;

-- Users service tables
CREATE TABLE IF NOT EXISTS ecommerce_users.users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON ecommerce_users.users(email);
CREATE INDEX idx_users_active ON ecommerce_users.users(is_active);

-- Orders service tables
CREATE TABLE IF NOT EXISTS ecommerce_orders.orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user_id ON ecommerce_orders.orders(user_id);
CREATE INDEX idx_orders_status ON ecommerce_orders.orders(status);

CREATE TABLE IF NOT EXISTS ecommerce_orders.order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES ecommerce_orders.orders(id) ON DELETE CASCADE
);

-- Payments service tables (can be in separate database if needed)
CREATE TABLE IF NOT EXISTS ecommerce_payments.payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order_id ON ecommerce_payments.payments(order_id);
CREATE INDEX idx_payments_status ON ecommerce_payments.payments(status);

-- Grant permissions to postgres user
GRANT ALL PRIVILEGES ON SCHEMA ecommerce_users TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA ecommerce_orders TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA ecommerce_payments TO postgres;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ecommerce_users TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ecommerce_orders TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ecommerce_payments TO postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA ecommerce_users GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA ecommerce_orders GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA ecommerce_payments GRANT ALL ON TABLES TO postgres;

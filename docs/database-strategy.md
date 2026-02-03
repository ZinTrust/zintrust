# Database Strategy Guide: Proxy Server vs. Durable Objects

This guide helps you choose the right MySQL connection strategy for your ZinTrust application on Cloudflare Workers. Since Workers are stateless and often run in many regions, connecting to a centralized SQL database requires careful architectural choices.

## Option 1: Node.js Proxy Server (`MySqlProxyServer`)

**Architecture:**
ZinTrust runs a lightweight Node.js HTTP server (typically on a VPS, EC2, or container) that sits next to your database. Your Cloudflare Workers send SQL queries to this proxy over HTTP, and the proxy executes them against the database using a persistent connection pool.

| Feature                  | Details                                                                                                                                               |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Speed**                | **Fast & Consistent.** The proxy maintains a warm connection pool (`mysql2`), so queries execute immediately without waiting for a TCP handshake.     |
| **Load Handling**        | **High.** Can handle thousands of concurrent Edge requests by multiplexing them over a fixed number of DB connections. Serves as a connection buffer. |
| **I/O Limitations**      | **None.** Runs in a standard Node.js environment. No "cross-request I/O" errors.                                                                      |
| **Operational Overhead** | **Medium.** Requires hosting and managing a separate Node.js process (e.g., via PM2 or Docker).                                                       |
| **Security**             | Supports signed requests (HMAC) to ensure only your Workers can talk to it.                                                                           |

**Best For:**

- High-traffic production applications.
- Teams who can host a small Node.js service (e.g., $5 VPS or existing container cluster).
- Scenarios requiring maximum throughput and low latency.

---

## Option 2: Durable Object Pool (`MySqlWorkersDurableObjectAdapter`)

**Architecture:**
A Cloudflare Durable Object (DO) is used as a singleton "database connector." Workers route DB requests to this DO within Cloudflare's internal network.

| Feature                  | Details                                                                                                                                                                                                                                              |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Speed**                | **Slower.** Due to Cloudflare's I/O safety restrictions, the DO cannot reuse raw TCP sockets across different requests. It must open and close a new connection for _every single request_, adding significant latency (TCP/TLS handshake overhead). |
| **Load Handling**        | **Low.** Heavy traffic will rapidly open/close connections, likely exhausting your database's connection limits or triggering firewall blocking.                                                                                                     |
| **I/O Limitations**      | **Strict.** "Cannot perform I/O on behalf of a different request." This forces the "connect-per-request" pattern which kills performance.                                                                                                            |
| **Operational Overhead** | **Zero.** Fully managed by Cloudflare. No external servers to maintain.                                                                                                                                                                              |
| **Security**             | Traffic stays within Cloudflare to your DB public/private IP.                                                                                                                                                                                        |

**Best For:**

- Development / protoyping.
- Very low traffic or internal tools where latency doesn't matter.
- Environments where you absolutely cannot host an external proxy.

---

## Summary Recommendation

| Priority                   | Recommended Strategy                                                                                                                            |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance & Scale**    | **Use Option 1 (Proxy Server).** It is battle-tested, standard, and robust.                                                                     |
| **Convenience (Zero Ops)** | Use **Cloudflare Hyperdrive** (managed service) instead of the DO adapter. It solves the pooling problem natively without the I/O restrictions. |
| **Pure Code / Testing**    | Use **Option 2 (DO Adapter)** only for local dev or low-volume testing where setting up a proxy is overkill.                                    |

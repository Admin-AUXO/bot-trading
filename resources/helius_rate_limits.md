> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Helius Rate Limits

> Complete guide to Helius rate limits across all plans and products.

## What are rate limits?

Rate limits control how many requests you can make per second. When rate limits are exceeded, you'll receive an HTTP 429 response.

## Standard Rate Limits

Your plan has two standard rate limit groups: one for RPC requests, and one for DAS API requests. Here are the base rate limits for each Helius plan:


| Plan             | RPC Rate Limit | DAS & Enhanced APIs |
| ---------------- | -------------- | ------------------- |
| **Free**         | 10 requests/s  | 2 requests/s        |
| **Developer**    | 50 requests/s  | 10 requests/s       |
| **Business**     | 200 requests/s | 50 requests/s       |
| **Professional** | 500 requests/s | 100 requests/s      |
| **Enterprise**   | Custom         | Custom              |


### Increase Rate Limits

Teams on Professional plans can purchase an extra 100 RPS for $100/month.

If you need custom rate limits ahead of launches, [contact our sales team](https://www.helius.dev/contact). If you are on Developer or Business tier, please upgrade your plan to increase your rate limits.

## Special Rate Limits

Some endpoints and specialized Helius products have special rate limits due to their computational requirements.

### Sending Transactions


| Endpoint          | Free   | Developer | Business | Professional |
| ----------------- | ------ | --------- | -------- | ------------ |
| `Sender`          | 50/sec | 50/sec    | 50/sec   | 50/sec       |
| `sendTransaction` | 1/sec  | 5/sec     | 50/sec   | 100/sec      |
| `simulateBundle`  | 10/sec | 50/sec    | 200/sec  | 500/sec      |


If you are on a Professional plan and need to increase your `sendTransaction` rate limits, [contact our sales team](https://www.helius.dev/contact).

Professional plan users can also [request](https://www.helius.dev/contact) rate limit increases and custom tip arrangements for Sender to support higher-throughput trading apps.

### Complex RPC Calls


| Endpoint             | Free  | Developer | Business | Professional |
| -------------------- | ----- | --------- | -------- | ------------ |
| `getProgramAccounts` | 5/sec | 25/sec    | 50/sec   | 75/sec       |


### Historical Data

When making batch requests for historical data methods, the following limits apply:


| Method                       | Max Batch Size            |
| ---------------------------- | ------------------------- |
| `getTransaction`             | 100 items per request     |
| `getTransactionsForAddress`  | No batch requests allowed |
| All other historical methods | 10 items per request      |


> Warning: Exceeding batch limits will result in an error response. For `getTransactionsForAddress`, each address must be queried in a separate request.

### LaserStream


| Resource           | Free | Developer | Business        | Professional    |
| ------------------ | ---- | --------- | --------------- | --------------- |
| Networks           | —    | Devnet    | Devnet, Mainnet | Devnet, Mainnet |
| Max Pubkeys        | —    | 10M       | 10M             | 10M             |
| Active Connections | —    | —         | 10              | 100             |


### Wallet API

The [Wallet API](/api-reference/wallet-api) follows the same rate limits as DAS & Enhanced APIs. All endpoints share these limits:


| Endpoint                 | Free  | Developer | Business | Professional |
| ------------------------ | ----- | --------- | -------- | ------------ |
| All Wallet API Endpoints | 2/sec | 10/sec    | 50/sec   | 100/sec      |


This includes identity lookups, balances, history, transfers, and funding source endpoints. Learn more in our [Wallet API documentation](/wallet-api/overview).

### WebSockets


| Resource                     | Free     | Developer          | Business           | Professional       |
| ---------------------------- | -------- | ------------------ | ------------------ | ------------------ |
| Concurrent Connections       | 5        | 150                | 250                | 1,000              |
| Subscriptions per Connection | 1,000    | 1,000              | 1,000              | 1,000              |
| WebSocket Types              | Standard | Standard, Enhanced | Standard, Enhanced | Standard, Enhanced |


### Webhooks


| Resource              | Free | Developer | Business | Professional |
| --------------------- | ---- | --------- | -------- | ------------ |
| Max Webhooks          | 5    | 50        | 50       | 50           |
| Addresses per Webhook | 100k | 100k      | 100k     | 100k         |


### ZK Compression


| Service            | Free  | Developer | Business | Professional |
| ------------------ | ----- | --------- | -------- | ------------ |
| Photon APIs        | 2/sec | 10/sec    | 50/sec   | 100/sec      |
| `getValidityProof` | 1/sec | 5/sec     | 10/sec   | 20/sec       |

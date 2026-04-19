> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Helius Credits

> Complete guide to Helius credits including credit costs, how credits work, and credits for data streaming solutions.

## What are credits?

Credits are a unit of account that we use to bill usage for RPCs, API requests, and data streaming products like LaserStream and Enhanced WebSockets.

Every plan has a base number of credits, and every API call has an assigned credit cost.

Below, we outline the credits per plan, credit costs by API, and credits for streaming data.

- Monthly Allocation: Credits reset monthly
- Credit Priority: Credits are consumed in this order: monthly, prepaid, autoscaling
- Flexible Billing: Pay for additional credits when needed

## Base Credits by Plan

Here is a breakdown of the total number of credits that are included by default in each plan.

If you need more credits, upgrade your plan, enable [autoscaling](/billing/autoscaling), purchase prepaid credits, or contact sales to discuss enterprise options.

For more information, read our [plans and pricing guide](/billing/plans)


| Feature             | Free     | Developer            | Business   | Professional |
| ------------------- | -------- | -------------------- | ---------- | ------------ |
| **Pricing**         | $0/month | ~~$49~~ $24.50/month | $499/month | $999/month   |
| **Monthly Credits** | 1M       | 10M                  | 100M       | 200M         |


## Standard Credits


| Service                   | Credits | Notes                                        |
| ------------------------- | ------- | -------------------------------------------- |
| **Standard RPC Calls**    | 1       | All RPC calls except those listed separately |
| **getProgramAccounts**    | 10      | Get all accounts/data owned by a program     |
| **getProgramAccountsV2**  | 1       | Paginated version of getProgramAccounts      |
| **simulateBundle**        | 1       | Simulate Jito Bundles                        |
| **Priority Fee API**      | 1       | Estimate priority fees                       |
| **DAS API**               | 10      | All DAS endpoints                            |
| **Enhanced Transactions** | 100     | Enhanced transaction parsing                 |


## Historical Data Credits

[Historical data queries](/rpc/guides/overview#historical-data-archival), sometimes called archival calls, cost **1 credit** each.

One exception is `[getTransactionsForAddress](/rpc/gettransactionsforaddress)` which costs **50 credits**.


| Method                      | Credits | Description                                                                                                          |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `getBlock`                  | 1       | Retrieve block data and transactions for a specified slot                                                            |
| `getBlocks`                 | 1       | Get list of blocks between two slots                                                                                 |
| `getBlocksWithLimit`        | 1       | Get blocks starting at a given slot with limit                                                                       |
| `getSignaturesForAddress`   | 1       | Get transaction signatures for an address                                                                            |
| `getTransaction`            | 1       | Retrieve transaction details for a specified signature                                                               |
| `getBlockTime`              | 1       | Get estimated production time of a block                                                                             |
| `getSignatureStatuses`      | 1       | Get statuses for transaction signatures                                                                              |
| `getInflationReward`        | 1       | Get inflation reward for a list of addresses for an epoch                                                            |
| `getTransactionsForAddress` | 50      | Enhanced transaction history with advanced filtering and sorting. Returns 100 full transactions or 1,000 signatures. |


> Warning: **Plan Requirement**: `getTransactionsForAddress` is only available on Developer plans and above. Free plan users will receive an error when attempting to use this endpoint.

## Data Streaming Credits

Unlike regular credits that assign credits per call, data streaming products like Enhanced WebSockets and LaserStream assign credits per amount of data consumed.


| Service                         | Credits | Notes                                                                                                |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| **Standard WebSockets**         | 2       | Per 0.1 MB of streamed data (uncompressed). All plans.                                               |
| **LaserStream gRPC**            | 2       | Per 0.1 MB of streamed data (uncompressed)                                                           |
| **Enhanced WebSockets**         | 2       | Per 0.1 MB of streamed data (uncompressed). All plans with Enhanced WSS access (Developer+).         |
| **Data Add-on (Pro Plan only)** | 2       | Per 0.1 MB after included allowance (5-100TB). Applies to LaserStream and Enhanced WebSockets usage. |


### Standard WebSockets

All WebSocket streaming at Helius is now [powered by LaserStream infrastructure](https://www.helius.dev/blog/laserstream-websockets). Standard WSS traffic is metered at **2 credits per 0.1 MB** across all plans.

> Warning: **WSS Metering Grace Period**: WSS metering activates for all projects on **May 1, 2026**. A 30-day grace period is in effect from the announcement date (March 31, 2026). Previously unmetered WSS traffic will be billed at the unified rate of 2 credits per 0.1 MB after the grace period ends.

### Enhanced WebSockets

[Enhanced WebSockets](/enhanced-websockets) are available on Developer, Business, and Professional plans.

All Enhanced WSS usage is metered at **2 credits per 0.1 MB**.

### LaserStream

[LaserStream](/laserstream) Mainnet is available on Business and Professional plans.

LaserStream Devnet is available on Developer, Business, and Professional plans.

All users pay **2 credits per 0.1 MB** usage.

### Data Add-ons

If you're on a Professional plan, you may purchase [Data Add-ons](/billing/plans#data-add-ons) between 5TB-100TB per month to be used for both Enhanced WebSockets and LaserStream.

Overages will be billed at 2 credits per 0.1 MB.

### Data Size

Billing for data streaming products is based on uncompressed message size.

Typical sizes include:

- Block (~4MB)
- Account (~0.0004MB)
- Transaction (~0.0006MB)

> Warning: **These are rough estimates only.** Actual data usage depends on your specific use case, including account size, transaction type, which programs you're listening to, and transaction metadata size. You should estimate usage based on your own traffic. Treat the values above as directional estimates, not guarantees.

## Transaction Submission Credits

Helius offers two primary transaction submission methods: [Sender](/sending-transactions/sender), our specialized transaction landing service for traders and low-latency applications; and [Staked Connections](/sending-transactions/overview) (default) for fast, reliable landing rates.


| Method                 | Credits | Description                   |
| ---------------------- | ------- | ----------------------------- |
| **Sender**             | 0       | Ultra-low latency submission  |
| **Staked Connections** | 1       | Highest reliability (default) |


> Note: **Staked Transactions Are Now Default for All Paid Plans**: All transactions via `mainnet.helius-rpc.com` automatically use staked connections for highest success rates.

## DAS API Credits

All [DAS API](/api-reference/das) requests cost **10 credits** each:

- Asset Information: `getAsset`, * `getAssetProof`, * `getAssetProofBatch`, * `getNftEditions`
- Asset Discovery: `getAssetsByOwner`, * `getAssetsByAuthority`, * `getAssetsByCreator`, * `getAssetsByGroup`, * `searchAssets`, * `getAssetBatch`
- Transaction History: `getSignaturesForAsset`
- Account Information: `getTokenAccounts`

## Wallet API Credits

All [Wallet API](/api-reference/wallet-api) requests cost **100 credits** each:


| Service                   | Credits | Notes                                                    |
| ------------------------- | ------- | -------------------------------------------------------- |
| **Wallet Identity**       | 100     | Get wallet identity (exchanges, protocols, institutions) |
| **Batch Identity Lookup** | 100     | Look up up to 100 addresses in a single request          |
| **Wallet Balances**       | 100     | Get token and NFT balances with USD values               |
| **Wallet History**        | 100     | Get transaction history with balance changes             |
| **Token Transfers**       | 100     | Get all token transfer activity                          |
| **Wallet Funding Source** | 100     | Discover who originally funded a wallet                  |


For more information on using the Wallet API, read our [Wallet API documentation](/wallet-api/overview).

## Webhook Credits


| Service                | Credits | Notes                                                                           |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| **Webhook Events**     | 1       | Per event sent by Helius, regardless of successful or failed endpoint responses |
| **Webhook Management** | 100     | Create, edit, delete webhooks                                                   |


For more information on using webhooks, read our [quickstart guide](/webhooks).

## ZK Compression Credits

All [ZK Compression API](/api-reference/zk-compression) calls cost **10 credits** each.

One exception is `getValidityProof` which costs 100 credits per request because it is computationally intensive.


| Service                | Credits | Notes                    |
| ---------------------- | ------- | ------------------------ |
| **ZK Compression API** | 10      | ZK Compression RPC calls |
| **getValidityProofs**  | 100     | Compute ZK proofs        |

> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Solana RPC Guides and Tutorials

> Practical guides and tutorials for effectively using Solana RPC methods. Real-world examples, code samples, and best practices for blockchain development.

## Quick Navigation

- [Current State Methods](#current-state-methods): Query live blockchain data and network status
- [Historical Data (Archival)](#historical-data-archival): Access complete transaction and block history
- [Transaction Submission](#transaction-submission): Send and simulate transactions with fee estimation
- [Network & Cluster Info](#network-%26-cluster-info): Monitor validators, epochs, and network performance

This file is an RPC method index. Use it to jump to the right upstream guide quickly instead of browsing the full Helius docs tree.

## Current State Methods

Query live blockchain data including accounts, balances, current slots, and real-time network status.

### Account & Balance Queries

- [getAccountInfo](/rpc/guides/getaccountinfo): Get complete account details including balance, owner, and data
- [getBalance](/rpc/guides/getbalance): Quick SOL balance lookup for any account
- [getMultipleAccounts](/rpc/guides/getmultipleaccounts): Batch query multiple accounts efficiently
- [getProgramAccounts](/rpc/guides/getprogramaccounts): Find all accounts owned by a specific program
- [getLargestAccounts](/rpc/guides/getlargestaccounts): Get accounts with largest SOL balances
- [getSupply](/rpc/guides/getsupply): Get information about current supply

### Guides for Token Account Methods

- [getTokenAccountsByOwner](/rpc/guides/gettokenaccountsbyowner): Get all token accounts for a wallet
- [getTokenAccountsByDelegate](/rpc/guides/gettokenaccountsbydelegate): Query token accounts by delegate
- [getTokenAccountBalance](/rpc/guides/gettokenaccountbalance): Get balance of a specific token account
- [getTokenSupply](/rpc/guides/gettokensupply): Query total supply of an SPL token
- [getTokenLargestAccounts](/rpc/guides/gettokenlargestaccounts): Find accounts with largest token holdings

### Guides for Current Slot & Blockhash

- [getSlot](/rpc/guides/getslot): Get current slot number
- [getBlockHeight](/rpc/guides/getblockheight): Get current block height of the network
- [getLatestBlockhash](/rpc/guides/getlatestblockhash): Get most recent blockhash for transactions
- [isBlockhashValid](/rpc/guides/isblockhashvalid): Validate if a blockhash is still valid
- [getSlotLeader](/rpc/guides/getslotleader): Get current slot leader
- [getSlotLeaders](/rpc/guides/getslotleaders): Get slot leaders for a range of slots

### Transaction Status & Confirmation

- [getSignatureStatuses](/rpc/guides/getsignaturestatuses): Check confirmation status of transactions
- [getTransactionCount](/rpc/guides/gettransactioncount): Get total number of transactions processed

## Historical Data (Archival)

Access complete transaction and block history from Solana genesis. All archival methods cost 1 credit. [Learn more about historical data →](/rpc/historical-data)

### Transaction History

- [getTransactionsForAddress](/rpc/gettransactionsforaddress): Advanced transaction history with filtering, sorting, and token account support (Helius exclusive)
- [getTransaction](/rpc/guides/gettransaction): Get detailed information about a specific transaction
- [getSignaturesForAddress](/rpc/guides/getsignaturesforaddress): Get transaction signatures for an account
- [getInflationReward](/rpc/guides/getinflationreward): Calculate inflation rewards for accounts

## Guides for Block History

Access blockchain structure, timing, and historical data.

- [getBlock](/rpc/guides/getblock): Get complete block information including all transactions
- [getBlocks](/rpc/guides/getblocks): Get list of confirmed blocks in a range
- [getBlocksWithLimit](/rpc/guides/getblockswithlimit): Get limited number of confirmed blocks
- [getBlockTime](/rpc/guides/getblocktime): Get estimated production time of a block

## Guides for Transaction Submission

Send and simulate transactions with fee estimation and optimization.

### Guides for Transaction Methods

- [requestAirdrop](/rpc/guides/requestairdrop): Request SOL airdrop on devnet/testnet
- [getPriorityFees](/rpc/guides/getrecentprioritizationfees): Get recent priority fees for optimal pricing
- [getFeeForMessage](/rpc/guides/getfeeformessage): Calculate transaction fees before sending

## Guides for Network & Cluster Methods

Monitor validators, epochs, network performance, and cluster health.

### Cluster Information

- [getHealth](/rpc/guides/gethealth): Check RPC node health status
- [getVersion](/rpc/guides/getversion): Get Solana software version information
- [getClusterNodes](/rpc/guides/getclusternodes): Get information about cluster validators
- [getVoteAccounts](/rpc/guides/getvoteaccounts): Get current and delinquent vote accounts
- [getEpochInfo](/rpc/guides/getepochinfo): Get information about the current epoch
- [getEpochSchedule](/rpc/guides/getepochschedule): Get epoch schedule information
- [getLeaderSchedule](/rpc/guides/getleaderschedule): Get leader schedule for an epoch

### Guides for Network Performance & Economics

- [getPerformanceSamples](/rpc/guides/getrecentperformancesamples): Get recent network performance metrics
- [getInflationGovernor](/rpc/guides/getinflationgovernor): Get current inflation parameters
- [getInflationRate](/rpc/guides/getinflationrate): Get current inflation rate
- [getStakeDelegation](/rpc/guides/getstakeminimumdelegation): Get minimum stake delegation amount

## Guides for Utility & System Methods

Helper methods for system information, validation, and advanced queries.

### Basic Utility Methods

- [getRentExemption](/rpc/guides/getminimumbalanceforrentexemption): Calculate minimum balance for rent exemption
- [getGenesisHash](/rpc/guides/getgenesishash): Get genesis hash of the cluster
- [getIdentity](/rpc/guides/getidentity): Get identity public key of the RPC node
- [getFirstAvailableBlock](/rpc/guides/getfirstavailableblock): Get slot of first available block
- [getHighestSnapshotSlot](/rpc/guides/gethighestsnapshotslot): Get highest slot with a snapshot
- [minimumLedgerSlot](/rpc/guides/minimumledgerslot): Get minimum slot that node has ledger information

### Guides for Advanced System Queries

- [getMaxRetransmitSlot](/rpc/guides/getmaxretransmitslot): Get maximum slot seen from retransmit stage
- [getMaxShredInsertSlot](/rpc/guides/getmaxshredinsertslot): Get maximum slot seen from shred insert

## Related Resources

### Additional Documentation

- [Historical Data Overview](/rpc/historical-data): Learn about Helius's archival infrastructure and capabilities
- [RPC Optimization](/rpc/optimization-techniques): Advanced techniques for optimizing RPC performance
- [WebSocket Methods](/rpc/websocket): Explore real-time subscriptions and streaming data
- [API Reference](/api-reference/rpc/http-methods): Complete technical reference for all RPC methods

Use the linked method pages when you need examples or request/response details.

# Birdeye Data Coverage

Short coverage reference. This is for deciding whether Birdeye has the chain and venue footprint you need, not for tracking every protocol they ingest.

## Supported Networks

Birdeye currently documents support for these networks:

| Network | API Param |
| --- | --- |
| Ethereum | `ethereum` |
| Solana | `solana` |
| BNB Smart Chain | `bsc` |
| Arbitrum | `arbitrum` |
| Optimism | `optimism` |
| Polygon | `polygon` |
| Avalanche C-Chain | `avalance` |
| Base | `base` |
| ZkSync Era | `zksync` |
| Sui | `sui` |

## What Matters Most For This Repo

If you are using Birdeye for Solana trading work, the important part is simple:

- Solana is supported
- most trading and token endpoints in the Lite and Starter tiers are usable on Solana
- some APIs are Solana-only even when Birdeye supports other chains overall

## Protocol Coverage

Birdeye claims data from 180+ DEXes and related venues. The exact list is not stable enough to treat this file as a source of truth.

Representative names they call out:

- Jupiter
- Uniswap
- Orca
- PancakeSwap
- 1inch
- QuickSwap
- Raydium
- OpenBook
- Meteora
- Phoenix
- Drift
- Kamino

## How To Use This Doc

Use this file to answer only two questions:

1. Is the chain supported at all?
2. Is Solana clearly in scope for the endpoints you care about?

For actual endpoint availability by plan, use [birdeye_data_access.md](./birdeye_data_access.md).

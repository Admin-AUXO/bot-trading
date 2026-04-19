---
type: session
status: active
area: security + wallet forensics + live trading
date: 2026-04-19
source_files:
  - trading_bot/backend/.env
  - trading_bot/backend/src/services/live-trade-executor.ts
  - notes/sessions/2026-04-19-live-pack-calibration-and-execution.md
graph_checked: 2026-04-19
---

# Session - Wallet Drain Forensics

## Verified Outcome

- The live trading bot did not execute any live trades.
- Database state during the incident window showed:
  - `0` fills
  - `0` positions
  - no live execution records consistent with a buy, sell, or wallet sweep flow
- The wallet loss was caused by direct signed on-chain instructions, not by the bot's trading path.

## Wallets Involved

- Original configured live wallet:
  - `D69PU6jwHu1F6aJW1LNx3NNTGDV28iZGaJy74WtATGei`
- Recipient / controlling wallet:
  - `Hp2BK1wmsHPgbxZ3rHA2okFGHBtpye1nXQUVD5aidzj9`

## Exact On-Chain Sequence

### 2026-04-19 21:49:45 IST
- Signature:
  - `3fPLW4hoCeWwZyxd5MRdDMKuQJjbnQR9CAtkWexqvuWc3DpMYgeK1CnWmpphbxLDDTggToHyM6wnh38isc5HWQgr`
- Effects:
  - `D69...` was reconfigured into a System Program nonce account
  - `nonceAuthority` was set to `Hp2BK1w...`
- Parsed instructions:
  - `system.allocate`
  - `system.assign`
  - `system.initializeNonce`
- Signers:
  - `D69...`
  - `Hp2BK1w...`

### 2026-04-19 21:49:50 IST
- Signature:
  - `35qJHnjxsgbj8pvTgPkV6CDh12qyp6gtRnHDE8HVW9BbSkBCWr4bQ7ja8vypzcTMnuinW2ZEnu9D4Tg7yFDwssbU`
- Effects:
  - `0.684022 USDC` transferred from `D69...` to `Hp2BK1w...`
  - `80.84 USDT` transferred from `D69...` to `Hp2BK1w...`
  - both source token accounts were immediately `closeAccount`'d
  - rent refunds from those closes also went to `Hp2BK1w...`
- Parsed instructions:
  - `spl-token.transferChecked`
  - `spl-token.closeAccount`
  - `spl-token.transferChecked`
  - `spl-token.closeAccount`
- Signers:
  - `D69...`
  - `Hp2BK1w...`

### 2026-04-19 21:50:07 IST
- Signature:
  - `EEjzaY7pRdzZrDRZqdBekyiWxTbwHPLWLqsXFtcsEhMuxy4FVbAZf5vKdwcJYrsemEbYRcpgaBBcL4MXZrC9Sz4`
- Effects:
  - about `0.184581775 SOL` was withdrawn from the nonce account `D69...`
  - destination was `Hp2BK1w...`
- Parsed instruction:
  - `system.withdrawFromNonce`
- Signers:
  - `Hp2BK1w...` only

## Current Nonce State

- `D69...` remains a nonce account.
- Current state observed through Helius:
  - owner: `11111111111111111111111111111111`
  - lamports: `1452387` (`0.001452387 SOL`)
  - authorized pubkey: `Hp2BK1wmsHPgbxZ3rHA2okFGHBtpye1nXQUVD5aidzj9`

## Recipient Wallet State

- Current observed balances for `Hp2BK1w...`:
  - `258.62618755 SOL`
  - `80.8401 USDT`
  - `11136.417163 USDC`
- This strongly indicates the drained funds landed successfully and remained under the recipient wallet's control.

## What This Rules Out

- This was not a bot trade:
  - no fills
  - no positions
  - no live execution history
- This was not a normal swap route:
  - the sequence used nonce-account management plus direct SPL transfers
- This was not caused by repo code that we could find:
  - no nonce-account create/authorize/withdraw path was found in `backend/src` or `backend/scripts`

## Strongest Technical Inference

- A prebuilt or externally constructed transaction sequence was signed that:
  1. converted the live wallet into a nonce account
  2. assigned `Hp2BK1w...` as nonce authority
  3. transferred USDC and USDT out
  4. withdrew SOL out via nonce authority
- The attacker or other party behind `Hp2BK1w...` already had one signer in the first two transactions and only needed the victim wallet signature to complete the drain flow.
- This is consistent with:
  - a malicious wallet popup
  - a compromised dApp session
  - a pre-signed transaction from another wallet
  - another device/profile controlling the other signer

## Local Browser / Extension Findings

- Brave history around the incident window did not show a clear Solana phishing or drain site.
- Comet had no page visits recorded in the checked time window.
- Brave and Comet both have Solana-capable wallet extensions installed:
  - Phantom
  - MetaMask
- This means the attack path may still have been an extension approval flow even without an obvious phishing page in browser history.

## Why Recovery Is Blocked From This Workspace

- With only the configured live wallet key for `D69...`, this workspace cannot reverse the nonce withdrawal.
- Solana nonce withdrawal requires the current nonce authority signer.
- The current nonce authority is `Hp2BK1w...`, not `D69...`.
- Therefore:
  - `nonceWithdraw` cannot be signed from here
  - `nonceAuthorize` cannot be signed from here

## Practical Incident Response

1. Treat the seed / private key behind `D69...` as compromised.
2. Do not fund `D69...` again.
3. Move any assets from other wallets sharing the same seed to a brand-new wallet created on a clean device.
4. Review connected dApps and wallet-extension approvals on every device/profile where this wallet was ever used.
5. Check mobile wallets, imported seed wallets, and alternate browser profiles for control of `Hp2BK1w...`.

## Best Next Forensic Moves

1. Inspect Phantom / MetaMask local state on all browser profiles and devices for wallet mappings and recent approval traces.
2. Check any mobile wallet or separate machine for ownership of `Hp2BK1w...`.
3. Export the exact three signatures and preserve them as incident evidence for exchange, wallet, or security support if needed.

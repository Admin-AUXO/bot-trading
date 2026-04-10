# Resources

Shared notes for reference docs in this folder:

- Full upstream doc index: https://www.helius.dev/docs/llms.txt
- Feedback endpoint: `https://www.helius.dev/docs/_mintlify/feedback/helius/agent-feedback`
- Feedback payload: `{ "path": "/current-page-path", "feedback": "Description of the issue" }`
- Only send feedback when you have a specific, actionable correction.

Canonical docs in this folder:

- [birdeye_plan.md](./birdeye_plan.md): Lite vs Starter pricing and overage math
- [birdeye_data_access.md](./birdeye_data_access.md): Lite/Starter endpoint access boundaries
- [birdeye_batch_credit.md](./birdeye_batch_credit.md): batch CU rules, mainly `/defi/multi_price` for Lite/Starter
- [birdeye_credit.md](./birdeye_credit.md): Birdeye compute-unit pricing
- [birdeye_data.md](./birdeye_data.md): Birdeye network and venue coverage
- [birdeye_meme_list.md](./birdeye_meme_list.md): Birdeye meme-token list endpoint
- [helius_send_traders.md](./helius_send_traders.md): Sender requirements, endpoints, tips, and low-latency submission flow
- [helius_jupiter_swap.md](./helius_jupiter_swap.md): Jupiter Swap plus Sender integration flow
- [helius_send_transactions.md](./helius_send_transactions.md): canonical manual send flow
- [helius_transactions_optimizations.md](./helius_transactions_optimizations.md): trader and staked-connection optimization guidance
- [helius_rpc_optimizations.md](./helius_rpc_optimizations.md): RPC read/write optimization patterns
- [helius_credit.md](./helius_credit.md): credit costs
- [helius_rate_limits.md](./helius_rate_limits.md): plan and endpoint limits
- [helius_solana_rpc.md](./helius_solana_rpc.md): RPC method index

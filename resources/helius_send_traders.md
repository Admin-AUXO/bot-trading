> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Helius Sender

> Ultra-low-latency Solana transaction submission with dual routing to validators and Jito. Sender does not consume Helius API credits.

## What It Is

Helius Sender is a transaction submission path for latency-sensitive Solana flows. It sends transactions through multiple routes to improve landing speed and inclusion odds.

Key points:

- dual routing to validators and Jito by default
- available on all plans
- no API credit consumption
- default throughput is 50 TPS; higher limits need approval

## Routing Modes

### Default Dual Routing

- sends to validators and Jito
- requires a minimum `0.0002 SOL` tip
- best default for competitive landing

### `swqos_only=true`

- routes only through SWQOS infrastructure
- lowers minimum tip to `0.000005 SOL`
- useful when you want lower tip cost and do not need Jito routing

## Endpoints

Frontend/browser:

- `https://sender.helius-rpc.com/fast`
- use this to avoid CORS pain
- auto-routes to the nearest location

Backend/server:

- `http://slc-sender.helius-rpc.com/fast`
- `http://ewr-sender.helius-rpc.com/fast`
- `http://lon-sender.helius-rpc.com/fast`
- `http://fra-sender.helius-rpc.com/fast`
- `http://ams-sender.helius-rpc.com/fast`
- `http://sg-sender.helius-rpc.com/fast`
- `http://tyo-sender.helius-rpc.com/fast`

Ping endpoints for warming:

- `https://sender.helius-rpc.com/ping`
- `http://slc-sender.helius-rpc.com/ping`
- `http://ewr-sender.helius-rpc.com/ping`
- `http://lon-sender.helius-rpc.com/ping`
- `http://fra-sender.helius-rpc.com/ping`
- `http://ams-sender.helius-rpc.com/ping`
- `http://sg-sender.helius-rpc.com/ping`
- `http://tyo-sender.helius-rpc.com/ping`

## Mandatory Requirements

Every Sender transaction must satisfy all of these:

- `skipPreflight: true`
- a priority-fee instruction
- a SOL tip transfer to a designated tip account

If you miss any of those, expect rejection.

> Warning: Sender optimizes for speed, not validation. If your transaction is malformed or underfunded, skipping preflight just means it fails later.

## Tip Rules

Default dual-routing tips:

- minimum `0.0002 SOL`

SWQOS-only tips:

- minimum `0.000005 SOL`

Designated mainnet tip accounts:

```text
4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE
D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ
9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta
5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn
2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD
2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ
wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF
3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT
4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey
4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or
```

Tip sizing guidance:

- minimum tip gets you access, not guaranteed competitiveness
- use Jito tip-floor data for contested flows
- use the Helius Priority Fee API for validator-side prioritization

## Minimal Request Format

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "sendTransaction",
  "params": [
    "BASE64_ENCODED_TRANSACTION",
    {
      "encoding": "base64",
      "skipPreflight": true,
      "maxRetries": 0
    }
  ]
}
```

The transaction payload itself must already contain:

- the compute-budget priority fee instruction
- the tip transfer instruction

## Minimal `@solana/web3.js` Flow

```typescript
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY",
);
const senderEndpoint = "https://sender.helius-rpc.com/fast";

const tipAccounts = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
];

async function sendWithSender(keypair: Keypair, recipient: string) {
  const { value: { blockhash } } =
    await connection.getLatestBlockhashAndContext("confirmed");

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(recipient),
          lamports: 0.001 * LAMPORTS_PER_SOL,
        }),
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(tipAccounts[0]),
          lamports: 0.0002 * LAMPORTS_PER_SOL,
        }),
      ],
    }).compileToV0Message(),
  );

  tx.sign([keypair]);

  const response = await fetch(senderEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method: "sendTransaction",
      params: [
        Buffer.from(tx.serialize()).toString("base64"),
        {
          encoding: "base64",
          skipPreflight: true,
          maxRetries: 0,
        },
      ],
    }),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
```

## Production Checklist

- fetch blockhashes with `confirmed`
- simulate first to size compute units
- set compute-unit price dynamically
- size tips dynamically when the market is contested
- implement your own retry loop and blockhash expiry handling
- warm idle connections with `/ping` if gaps exceed about a minute

## Dynamic Tip Sketch

```typescript
async function getDynamicTipAmount(): Promise<number> {
  try {
    const response = await fetch(
      "https://bundles.jito.wtf/api/v1/bundles/tip_floor",
    );
    const data = await response.json();
    const p75 = data?.[0]?.landed_tips_75th_percentile;
    return typeof p75 === "number" ? Math.max(p75, 0.0002) : 0.0002;
  } catch {
    return 0.0002;
  }
}
```

## Use This Doc For

- direct Sender transaction submission
- endpoint selection and warming
- tip and priority-fee requirements
- integrating Sender into a custom trading flow

If you need swap-specific flow with Jupiter, use [helius_jupiter_swap.md](./helius_jupiter_swap.md).

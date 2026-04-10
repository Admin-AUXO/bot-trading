> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Jupiter Swap API With Helius Sender

> Use Jupiter for route construction and Helius Sender for low-latency broadcast.

## What This Combines

Jupiter gives you the best route and a prepared swap transaction. Sender gives you a faster submission path once the transaction is built.

Typical flow:

1. request a Jupiter quote
2. request the swap transaction from Jupiter
3. deserialize and modify the transaction for Sender compatibility
4. add a Sender tip instruction
5. sign and broadcast through Sender
6. confirm with your Helius RPC endpoint

> Tip: Sender is publicly available and does not require a paid plan.

## Requirements

- Node.js 20 or newer
- TypeScript 5 or newer
- a Helius API key for RPC operations
- a funded Solana wallet with enough SOL for fees and tips

Suggested setup:

```bash
npx tsc --init
npm install @solana/web3.js bs58
npm install --save-dev @types/node
```

Project settings:

- set `"types": ["node"]` in `tsconfig.json`
- set `"type": "module"` in `package.json`

## Sender-Specific Rules

The Jupiter-built transaction still needs Sender rules applied:

- `skipPreflight` must be `true`
- the final transaction must include a tip transfer to a Sender tip account
- you still need a priority fee strategy

Jupiter may already add compute-budget instructions. Do not blindly duplicate them.

## Minimal Implementation

```typescript
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const heliusApiKey = "YOUR_HELIUS_API_KEY";
const senderEndpoint = "http://ewr-sender.helius-rpc.com/fast";
const rpc = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
);

const tipAccounts = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
];

async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
) {
  const url =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}` +
    `&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  return fetch(url).then((r) => r.json());
}

async function getSwapTransaction(quote: unknown, userPublicKey: string) {
  return fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1_000_000,
          priorityLevel: "veryHigh",
        },
      },
    }),
  }).then((r) => r.json());
}

async function createSenderTransactionFromSwapResponse(
  swapResponse: any,
  userWallet: Keypair,
) {
  const jupiterTx = VersionedTransaction.deserialize(
    Buffer.from(swapResponse.swapTransaction, "base64"),
  );

  const altResponses = await Promise.all(
    jupiterTx.message.addressTableLookups.map((lookup) =>
      rpc.getAddressLookupTable(lookup.accountKey),
    ),
  );

  const altAccounts: AddressLookupTableAccount[] = altResponses.map((item) => {
    if (!item.value) throw new Error("ALT is null");
    return item.value;
  });

  const message = TransactionMessage.decompile(jupiterTx.message, {
    addressLookupTableAccounts: altAccounts,
  });

  message.instructions.push(
    SystemProgram.transfer({
      fromPubkey: userWallet.publicKey,
      toPubkey: new PublicKey(tipAccounts[0]),
      lamports: 0.0002 * LAMPORTS_PER_SOL,
    }),
  );

  const finalTx = new VersionedTransaction(
    message.compileToV0Message(altAccounts),
  );
  finalTx.sign([userWallet]);
  return finalTx;
}

async function broadcastTransactionWithSender(transaction: VersionedTransaction) {
  const response = await fetch(senderEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method: "sendTransaction",
      params: [
        Buffer.from(transaction.serialize()).toString("base64"),
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

  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();
  await rpc.confirmTransaction(
    {
      blockhash,
      lastValidBlockHeight,
      signature: bs58.encode(transaction.signatures[0]!),
    },
    "confirmed",
  );

  return json.result;
}
```

## Configuration Points

Replace these before using the script:

- wallet private key
- Helius API key
- Sender endpoint region
- input and output mint addresses
- amount
- slippage

## Dynamic Tip Upgrade

If the trade is competitive, replace the fixed `0.0002 SOL` tip with a Jito-derived dynamic tip.

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

## Operational Notes

- use HTTPS Sender for browser apps and regional HTTP Sender for servers
- confirm through your Helius RPC endpoint, not the Sender endpoint
- if Jupiter already inserted compute-budget instructions, inspect before adding more
- for high contention, dynamic tip sizing matters more than the minimum tip

## Use This Doc For

- Jupiter quote and swap transaction flow
- adapting Jupiter transactions to Sender
- swap-specific trading execution with Helius infrastructure

For general Sender behavior, requirements, and endpoints, use [helius_send_traders.md](./helius_send_traders.md).

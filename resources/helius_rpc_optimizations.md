> Shared note: see [README](./README.md) for the Helius doc index and feedback endpoint.

# Solana RPC Optimization: Performance & Cost Best Practices

> Optimize Solana RPC performance, reduce costs, and improve reliability. This guide focuses on transaction optimization, data retrieval patterns, and operational best practices.

Optimizing RPC usage improves latency, cost, and reliability. Use the sections below to tighten common Solana read and write paths.

## Quick Start

- [Transaction Optimization](#transaction-optimization): compute units, priority fees, and send flow
- [Data Retrieval Optimization](#data-retrieval-optimization): efficient account, token, and history queries
- [Real-time Monitoring](#real-time-monitoring): WebSocket-first patterns
- [Best Practices](#best-practices): commitment levels, resource management, and error handling

## Transaction Optimization

### Compute Unit Management

Simulate first to determine actual usage:

```typescript
const testTransaction = new VersionedTransaction(/* your transaction */);
const simulation = await connection.simulateTransaction(testTransaction, {
  replaceRecentBlockhash: true,
  sigVerify: false,
});
const unitsConsumed = simulation.value.unitsConsumed;
```

Set the compute limit with margin:

```typescript
const computeUnitLimit = Math.ceil(unitsConsumed * 1.1);
const computeUnitIx = ComputeBudgetProgram.setComputeUnitLimit({
  units: computeUnitLimit,
});
instructions.unshift(computeUnitIx);
```

### Priority Fee Optimization

Get a dynamic fee estimate:

```typescript
const response = await fetch(
  `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "getPriorityFeeEstimate",
      params: [
        {
          accountKeys: ["11111111111111111111111111111112"],
          options: { recommended: true },
        },
      ],
    }),
  },
);

const { priorityFeeEstimate } = await response.json().result;
```

Apply the fee:

```typescript
const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: priorityFeeEstimate,
});
instructions.unshift(priorityFeeIx);
```

### Transaction Sending Best Practices

#### Standard Approach

```typescript
const serializedTx = transaction.serialize();
const signature = await connection.sendRawTransaction(serializedTx, {
  skipPreflight: true,
  maxRetries: 0,
});
```

#### With Confirmation

```typescript
const signature = await connection.sendRawTransaction(serializedTx);

const confirmation = await connection.confirmTransaction({
  signature,
  blockhash: latestBlockhash.blockhash,
  lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
});
```

## Data Retrieval Optimization

### Enhanced Pagination Methods (V2)

Use the V2 methods for large datasets:

### Performance Boost

`getProgramAccountsV2` and `getTokenAccountsByOwnerV2` help when you need cursor-based pagination and incremental sync.

- Configurable limits: 1 to 10,000 accounts per request
- Cursor-based pagination: reduces timeout risk on large queries
- Incremental updates: use `changedSinceSlot` for sync loops
- Better memory usage: stream data instead of loading everything at once

Example: efficient program account querying.

```typescript
// Old approach: could time out with large datasets
const allAccounts = await connection.getProgramAccounts(programId, {
  encoding: "base64",
  filters: [{ dataSize: 165 }],
});

// New approach: paginated with better performance
let allAccounts = [];
let paginationKey = null;

do {
  const response = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getProgramAccountsV2",
        params: [
          programId,
          {
            encoding: "base64",
            filters: [{ dataSize: 165 }],
            limit: 5000,
            ...(paginationKey && { paginationKey }),
          },
        ],
      }),
    },
  );

  const data = await response.json();
  allAccounts.push(...data.result.accounts);
  paginationKey = data.result.paginationKey;
} while (paginationKey);
```

Incremental updates for real-time applications:

```typescript
const incrementalUpdate = await fetch(
  `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getProgramAccountsV2",
      params: [
        programId,
        {
          encoding: "jsonParsed",
          limit: 1000,
          changedSinceSlot: lastProcessedSlot,
        },
      ],
    }),
  },
);
```

### Efficient Account Queries

#### Single Account

```typescript
const accountInfo = await connection.getAccountInfo(pubkey, {
  encoding: "base64",
  dataSlice: { offset: 0, length: 100 },
  commitment: "confirmed",
});
```

#### Multiple Accounts

```typescript
const accounts = await connection.getMultipleAccountsInfo(
  [pubkey1, pubkey2, pubkey3],
  {
    encoding: "base64",
    commitment: "confirmed",
  },
);
```

#### Program Accounts

```typescript
const accounts = await connection.getProgramAccounts(programId, {
  filters: [
    { dataSize: 165 },
    { memcmp: { offset: 0, bytes: mintAddress } },
  ],
  encoding: "jsonParsed",
});
```

### Token Balance Lookups

#### Inefficient

```typescript
const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
  programId: TOKEN_PROGRAM_ID,
});

const balances = await Promise.all(
  tokenAccounts.value.map((acc) =>
    connection.getTokenAccountBalance(acc.pubkey),
  ),
);
```

#### Optimized

```typescript
const tokenAccounts = await connection.getTokenAccountsByOwner(
  owner,
  { programId: TOKEN_PROGRAM_ID },
  { encoding: "jsonParsed" },
);

const balances = tokenAccounts.value.map((acc) => ({
  mint: acc.account.data.parsed.info.mint,
  amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
}));
```

### Transaction History

#### Inefficient

```typescript
const signatures = await connection.getSignaturesForAddress(address, {
  limit: 100,
});

const transactions = await Promise.all(
  signatures.map((sig) => connection.getTransaction(sig.signature)),
);
```

#### Fast (Helius Exclusive)

```typescript
const response = await fetch(
  `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransactionsForAddress",
      params: [
        address,
        {
          transactionDetails: "full",
          limit: 100,
          filters: { tokenAccounts: "balanceChanged" },
        },
      ],
    }),
  },
);
```

## Real-time Monitoring

### Account Subscriptions

#### Polling

```typescript
setInterval(async () => {
  const accountInfo = await connection.getAccountInfo(pubkey);
  // Process updates...
}, 1000);
```

#### WebSocket

```typescript
const subscriptionId = connection.onAccountChange(
  pubkey,
  (accountInfo, context) => {
    console.log("Account updated:", accountInfo);
  },
  "confirmed",
  { encoding: "base64", dataSlice: { offset: 0, length: 100 } },
);
```

### Program Account Monitoring

```typescript
connection.onProgramAccountChange(
  programId,
  (accountInfo, context) => {
    // Handle program account changes
  },
  "confirmed",
  {
    filters: [
      { dataSize: 1024 },
      { memcmp: { offset: 0, bytes: ACCOUNT_DISCRIMINATOR } },
    ],
    encoding: "base64",
  },
);
```

### Transaction Monitoring

```typescript
const ws = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`);

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [{ mentions: [programId] }, { commitment: "confirmed" }],
    }),
  );
});

ws.on("message", (data) => {
  const message = JSON.parse(data);
  if (message.params) {
    const signature = message.params.result.value.signature;
    // Process transaction signature
  }
});
```

## Advanced Patterns

### Smart Retry Logic

```typescript
class RetryManager {
  private backoff = new ExponentialBackoff({
    min: 100,
    max: 5000,
    factor: 2,
    jitter: 0.2,
  });

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (error.message.includes("429")) {
          await this.backoff.delay();
          continue;
        }

        throw error;
      }
    }
  }
}
```

### Memory-Efficient Processing

```typescript
function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size),
  );
}

const allAccounts = await connection.getProgramAccounts(programId, {
  dataSlice: { offset: 0, length: 32 },
});

const chunks = chunk(allAccounts, 100);
for (const batch of chunks) {
  const detailedAccounts = await connection.getMultipleAccountsInfo(
    batch.map((acc) => acc.pubkey),
  );
  // Process batch...
}
```

### Connection Pooling

```typescript
class ConnectionPool {
  private connections: Connection[] = [];
  private currentIndex = 0;

  constructor(rpcUrls: string[]) {
    this.connections = rpcUrls.map((url) => new Connection(url));
  }

  getConnection(): Connection {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }
}

const pool = new ConnectionPool([
  "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY",
  "https://mainnet-backup.helius-rpc.com/?api-key=YOUR_API_KEY",
]);
```

## Performance Monitoring

### Track RPC Usage

```typescript
class RPCMonitor {
  private metrics = {
    calls: 0,
    errors: 0,
    totalLatency: 0,
  };

  async monitoredCall<T>(operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.metrics.calls++;

    try {
      const result = await operation();
      this.metrics.totalLatency += Date.now() - start;
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  getStats() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.totalLatency / this.metrics.calls,
      errorRate: this.metrics.errors / this.metrics.calls,
    };
  }
}
```

## Best Practices

### Commitment Levels

#### `processed`

- Use for: WebSocket subscriptions and real-time updates
- Latency: ~400ms
- Reliability: good for most applications

#### `confirmed`

- Use for: general queries and account info
- Latency: ~1s
- Reliability: recommended for most use cases

#### `finalized`

- Use for: final settlement and irreversible operations
- Latency: ~32s
- Reliability: maximum certainty

### Resource Management

- Use `dataSlice` to limit payload sizes.
- Implement server-side filtering with `memcmp` and `dataSize`.
- Batch operations to reduce round trips.
- Cache results to avoid redundant calls.
- Close WebSocket subscriptions when done.
- Implement circuit breakers for error handling.

### Error Handling

```typescript
async function robustRPCCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error.code === -32602) {
      throw new Error("Invalid RPC parameters");
    } else if (error.code === -32005) {
      throw new Error("Node synchronization issue");
    } else if (error.message.includes("429")) {
      throw new Error("Rate limited");
    }

    throw error;
  }
}
```

## Common Pitfalls to Avoid

> Warning: Avoid polling when subscriptions exist, avoid fetching full account payloads when partial data is enough, batch related queries, respect rate limits, prefer `confirmed` when `finalized` is unnecessary, and close subscriptions when done.

## Related Methods

- [getSignaturesForAddress](/api-reference/rpc/http/getsignaturesforaddress): get transaction signatures for an address
- [getTransaction](/api-reference/rpc/http/gettransaction): retrieve full transaction details by signature
- [getProgramAccounts](/api-reference/rpc/http/getprogramaccounts): fetch all accounts owned by a program
- [getTokenAccountsByOwner](/api-reference/rpc/http/gettokenaccountsbyowner): get token accounts for a wallet
- [getMultipleAccountsInfo](/api-reference/rpc/http/getmultipleaccounts): batch fetch multiple account details
- [getAccountInfo](/api-reference/rpc/http/getaccountinfo): get information about a single account
- [accountSubscribe](/api-reference/rpc/websocket/accountsubscribe): subscribe to account changes via WebSocket
- [programSubscribe](/api-reference/rpc/websocket/programsubscribe): subscribe to program account changes via WebSocket
- [logsSubscribe](/api-reference/rpc/websocket/logssubscribe): subscribe to transaction logs via WebSocket

## Summary

These optimizations should reduce RPC call volume, lower latency, cut bandwidth, improve resilience, and reduce operating cost.

## Next Steps

Read the [Transaction Optimization Guide](/sending-transactions/optimizing-transactions) for transaction-specific best practices.

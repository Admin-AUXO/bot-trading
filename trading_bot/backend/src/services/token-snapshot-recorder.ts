import { db } from "../db/client.js";
import { toOptionalDate } from "../utils/dates.js";
import { toJsonValue } from "../utils/json.js";

export async function recordTokenSnapshot(input: {
  candidateId?: string | null;
  positionId?: string | null;
  mint: string;
  symbol: string;
  trigger: string;
  source?: string | null;
  creator?: string | null;
  platformId?: string | null;
  creationAt?: Date | number | string | null;
  recentListingAt?: Date | number | string | null;
  lastTradeAt?: Date | number | string | null;
  decimals?: number | null;
  progressPercent?: number | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  totalSupply?: number | null;
  circulatingSupply?: number | null;
  holders?: number | null;
  volume1mUsd?: number | null;
  volume5mUsd?: number | null;
  volume30mUsd?: number | null;
  volume1hUsd?: number | null;
  volume24hUsd?: number | null;
  volume1mChangePercent?: number | null;
  volume5mChangePercent?: number | null;
  volume30mChangePercent?: number | null;
  volume1hChangePercent?: number | null;
  volume24hChangePercent?: number | null;
  volumeBuy1mUsd?: number | null;
  volumeBuy5mUsd?: number | null;
  volumeBuy30mUsd?: number | null;
  volumeBuy1hUsd?: number | null;
  volumeBuy24hUsd?: number | null;
  volumeSell1mUsd?: number | null;
  volumeSell5mUsd?: number | null;
  volumeSell30mUsd?: number | null;
  volumeSell1hUsd?: number | null;
  volumeSell24hUsd?: number | null;
  uniqueWallets1m?: number | null;
  uniqueWallets5m?: number | null;
  uniqueWallets30m?: number | null;
  uniqueWallets1h?: number | null;
  uniqueWallets24h?: number | null;
  trades1m?: number | null;
  trades5m?: number | null;
  trades30m?: number | null;
  trades1h?: number | null;
  trades24h?: number | null;
  buys1m?: number | null;
  buys5m?: number | null;
  buys30m?: number | null;
  buys1h?: number | null;
  buys24h?: number | null;
  sells1m?: number | null;
  sells5m?: number | null;
  sells30m?: number | null;
  sells1h?: number | null;
  sells24h?: number | null;
  buySellRatio?: number | null;
  priceChange1mPercent?: number | null;
  priceChange5mPercent?: number | null;
  priceChange30mPercent?: number | null;
  priceChange1hPercent?: number | null;
  priceChange24hPercent?: number | null;
  graduationAgeSeconds?: number | null;
  top10HolderPercent?: number | null;
  largestHolderPercent?: number | null;
  largestAccountsCount?: number | null;
  largestHolderAddress?: string | null;
  creatorBalancePercent?: number | null;
  ownerBalancePercent?: number | null;
  updateAuthorityBalancePercent?: number | null;
  top10UserPercent?: number | null;
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  transferFeeEnabled?: boolean | null;
  transferFeePercent?: number | null;
  trueToken?: boolean | null;
  token2022?: boolean | null;
  nonTransferable?: boolean | null;
  fakeToken?: boolean | null;
  honeypot?: boolean | null;
  freezeable?: boolean | null;
  mutableMetadata?: boolean | null;
  securityCheckedAt?: Date | number | string | null;
  securityRisk?: string | null;
  metadata?: unknown;
}) {
  await db.tokenMetrics.create({
    data: {
      candidateId: input.candidateId ?? null,
      positionId: input.positionId ?? null,
      mint: input.mint,
      trigger: input.trigger,
      decimals: input.decimals ?? null,
      priceUsd: input.priceUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      fdvUsd: input.fdvUsd ?? null,
      totalSupply: input.totalSupply ?? null,
      holders: input.holders ?? null,
      volume1mUsd: input.volume1mUsd ?? null,
      trades1m: input.trades1m ?? null,
      buys1m: input.buys1m ?? null,
      sells1m: input.sells1m ?? null,
      uniqueWallets1m: input.uniqueWallets1m ?? null,
      top10HolderPct: input.top10HolderPercent ?? null,
      largestHolderPct: input.largestHolderPercent ?? null,
      priceChange1mPct: input.priceChange1mPercent ?? null,
      mintAuthorityActive: input.mintAuthorityActive ?? null,
      freezeAuthorityActive: input.freezeAuthorityActive ?? null,
      transferFeeEnabled: input.transferFeeEnabled ?? null,
      trueToken: input.trueToken ?? null,
      token2022: input.token2022 ?? null,
      nonTransferable: input.nonTransferable ?? null,
      fakeToken: input.fakeToken ?? null,
      honeypot: input.honeypot ?? null,
      freezeable: input.freezeable ?? null,
      metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
    },
  }).catch(() => undefined);
}

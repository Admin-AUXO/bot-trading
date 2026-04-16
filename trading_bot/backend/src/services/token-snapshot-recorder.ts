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
      symbol: input.symbol,
      trigger: input.trigger,
      source: input.source ?? null,
      creator: input.creator ?? null,
      platformId: input.platformId ?? null,
      creationAt: toOptionalDate(input.creationAt),
      recentListingAt: toOptionalDate(input.recentListingAt),
      lastTradeAt: toOptionalDate(input.lastTradeAt),
      decimals: input.decimals ?? null,
      progressPercent: input.progressPercent ?? null,
      priceUsd: input.priceUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      fdvUsd: input.fdvUsd ?? null,
      totalSupply: input.totalSupply ?? null,
      circulatingSupply: input.circulatingSupply ?? null,
      holders: input.holders ?? null,
      volume1mUsd: input.volume1mUsd ?? null,
      volume5mUsd: input.volume5mUsd ?? null,
      volume30mUsd: input.volume30mUsd ?? null,
      volume1hUsd: input.volume1hUsd ?? null,
      volume24hUsd: input.volume24hUsd ?? null,
      volume1mChangePercent: input.volume1mChangePercent ?? null,
      volume5mChangePercent: input.volume5mChangePercent ?? null,
      volume30mChangePercent: input.volume30mChangePercent ?? null,
      volume1hChangePercent: input.volume1hChangePercent ?? null,
      volume24hChangePercent: input.volume24hChangePercent ?? null,
      volumeBuy1mUsd: input.volumeBuy1mUsd ?? null,
      volumeBuy5mUsd: input.volumeBuy5mUsd ?? null,
      volumeBuy30mUsd: input.volumeBuy30mUsd ?? null,
      volumeBuy1hUsd: input.volumeBuy1hUsd ?? null,
      volumeBuy24hUsd: input.volumeBuy24hUsd ?? null,
      volumeSell1mUsd: input.volumeSell1mUsd ?? null,
      volumeSell5mUsd: input.volumeSell5mUsd ?? null,
      volumeSell30mUsd: input.volumeSell30mUsd ?? null,
      volumeSell1hUsd: input.volumeSell1hUsd ?? null,
      volumeSell24hUsd: input.volumeSell24hUsd ?? null,
      uniqueWallets1m: input.uniqueWallets1m ?? null,
      uniqueWallets5m: input.uniqueWallets5m ?? null,
      uniqueWallets30m: input.uniqueWallets30m ?? null,
      uniqueWallets1h: input.uniqueWallets1h ?? null,
      uniqueWallets24h: input.uniqueWallets24h ?? null,
      trades1m: input.trades1m ?? null,
      trades5m: input.trades5m ?? null,
      trades30m: input.trades30m ?? null,
      trades1h: input.trades1h ?? null,
      trades24h: input.trades24h ?? null,
      buys1m: input.buys1m ?? null,
      buys5m: input.buys5m ?? null,
      buys30m: input.buys30m ?? null,
      buys1h: input.buys1h ?? null,
      buys24h: input.buys24h ?? null,
      sells1m: input.sells1m ?? null,
      sells5m: input.sells5m ?? null,
      sells30m: input.sells30m ?? null,
      sells1h: input.sells1h ?? null,
      sells24h: input.sells24h ?? null,
      buySellRatio: input.buySellRatio ?? null,
      priceChange1mPercent: input.priceChange1mPercent ?? null,
      priceChange5mPercent: input.priceChange5mPercent ?? null,
      priceChange30mPercent: input.priceChange30mPercent ?? null,
      priceChange1hPercent: input.priceChange1hPercent ?? null,
      priceChange24hPercent: input.priceChange24hPercent ?? null,
      graduationAgeSeconds: input.graduationAgeSeconds ?? null,
      top10HolderPercent: input.top10HolderPercent ?? null,
      largestHolderPercent: input.largestHolderPercent ?? null,
      largestAccountsCount: input.largestAccountsCount ?? null,
      largestHolderAddress: input.largestHolderAddress ?? null,
      creatorBalancePercent: input.creatorBalancePercent ?? null,
      ownerBalancePercent: input.ownerBalancePercent ?? null,
      updateAuthorityBalancePercent: input.updateAuthorityBalancePercent ?? null,
      top10UserPercent: input.top10UserPercent ?? null,
      mintAuthorityActive: input.mintAuthorityActive ?? null,
      freezeAuthorityActive: input.freezeAuthorityActive ?? null,
      transferFeeEnabled: input.transferFeeEnabled ?? null,
      transferFeePercent: input.transferFeePercent ?? null,
      trueToken: input.trueToken ?? null,
      token2022: input.token2022 ?? null,
      nonTransferable: input.nonTransferable ?? null,
      fakeToken: input.fakeToken ?? null,
      honeypot: input.honeypot ?? null,
      freezeable: input.freezeable ?? null,
      mutableMetadata: input.mutableMetadata ?? null,
      securityRisk: input.securityRisk ?? null,
      metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
    },
  }).catch(() => undefined);
}

export function shortMint(mint: string | null | undefined, chars = 4): string {
  if (!mint || mint.length < chars * 2) return mint ?? "";
  return `${mint.slice(0, chars)}...${mint.slice(-chars)}`;
}

export function safeClientTimestamp(date: unknown): Date | null {
  if (!date) return null;
  const parsed = new Date(date as string);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

import { createChildLogger } from "./logger.js";

const log = createChildLogger("rate-limiter");

export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly name: string,
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return;
    }
    const waitMs = this.windowMs - (now - this.timestamps[0]) + 10;
    log.debug({ limiter: this.name, waitMs }, "rate limit — waiting");
    await new Promise((r) => setTimeout(r, waitMs));
    await this.waitForSlot();
  }

  getUsage(): { used: number; limit: number; windowMs: number } {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return { used: this.timestamps.length, limit: this.maxRequests, windowMs: this.windowMs };
  }
}

export function backoffWithJitter(attempt: number, baseDelayMs: number = 1000, maxDelayMs: number = 30_000): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, maxDelayMs);
}

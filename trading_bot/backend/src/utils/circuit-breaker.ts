import { createChildLogger } from "./logger.js";

const log = createChildLogger("circuit-breaker");

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly serviceName: string,
    private readonly failureThreshold: number = 5,
    private readonly cooldownMs: number = 30_000,
    private readonly halfOpenMax: number = 2,
    private readonly shouldCountAsFailure: (err: unknown) => boolean = () => true,
  ) {}

  isOpen(): boolean {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
        log.info({ service: this.serviceName }, "circuit half-open — allowing probe requests");
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.halfOpenMax) {
        this.state = "CLOSED";
        this.failureCount = 0;
        log.info({ service: this.serviceName }, "circuit closed — service recovered");
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      log.warn({ service: this.serviceName }, "circuit re-opened — probe failed");
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      log.warn({ service: this.serviceName, failures: this.failureCount, cooldownMs: this.cooldownMs }, "circuit opened");
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>, fallback?: T): Promise<T> {
    if (this.isOpen()) {
      log.debug({ service: this.serviceName }, "circuit open — request blocked");
      if (fallback !== undefined) return fallback;
      throw new Error(`circuit breaker open for ${this.serviceName}`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (this.shouldCountAsFailure(err)) {
        this.recordFailure();
      }
      throw err;
    }
  }
}

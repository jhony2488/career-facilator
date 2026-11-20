export class RateLimiter {
  private lastRequest = new Map<string, number>();

  constructor(private defaultDelayMs: number = 1000) {}

  async acquire(host: string, minDelayMs?: number): Promise<void> {
    const delay = Math.max(minDelayMs ?? this.defaultDelayMs, 0);
    const now = Date.now();
    const last = this.lastRequest.get(host) ?? 0;
    const wait = Math.max(0, last + delay - now);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequest.set(host, Date.now());
  }
}

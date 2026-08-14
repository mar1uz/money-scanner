export interface ProviderHealth {
  name: string;
  status: 'operational' | 'degraded' | 'offline';
  latencyMs: number;
  lastSuccessTimestamp: number;
  consecutiveErrors: number;
  totalRequests: number;
  totalErrors: number;
}

export class MarketHealthMonitor {
  private providers: Map<string, ProviderHealth> = new Map();
  private staleThresholdMs = 120_000; // 2 minutes

  constructor() {
    this.registerProvider('Binance');
    this.registerProvider('CoinGeckoFallback');
    this.registerProvider('FixtureFallback');
  }

  public registerProvider(name: string) {
    this.providers.set(name, {
      name,
      status: 'operational',
      latencyMs: 0,
      lastSuccessTimestamp: Date.now(),
      consecutiveErrors: 0,
      totalRequests: 0,
      totalErrors: 0
    });
  }

  public recordSuccess(name: string, latencyMs: number) {
    const p = this.providers.get(name);
    if (!p) return;
    p.latencyMs = latencyMs;
    p.lastSuccessTimestamp = Date.now();
    p.consecutiveErrors = 0;
    p.totalRequests++;
    p.status = 'operational';
  }

  public recordError(name: string) {
    const p = this.providers.get(name);
    if (!p) return;
    p.consecutiveErrors++;
    p.totalRequests++;
    p.totalErrors++;

    if (p.consecutiveErrors >= 5) {
      p.status = 'offline';
    } else if (p.consecutiveErrors >= 2) {
      p.status = 'degraded';
    }
  }

  public isDataStale(timestamp: number): boolean {
    return Date.now() - timestamp > this.staleThresholdMs;
  }

  public getProviderHealth(name: string): ProviderHealth | undefined {
    return this.providers.get(name);
  }

  public getAllHealth(): ProviderHealth[] {
    return Array.from(this.providers.values());
  }
}

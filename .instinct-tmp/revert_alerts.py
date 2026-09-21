import io

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches:\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"reverted {path}: {len(repls)}")

# R1. alert-dispatcher back to original
patch('packages/notifications/src/alert-dispatcher.ts', [
("""    // Forced test sends (the asset-page bell) have no real transition: say
    // so instead of printing an identical-tier "flip".
    const isForcedStatus = force && !signal.isTransition;
    const isBull = signal.score >= 20;
    const isBear = signal.score <= -20;
    const direction = isForcedStatus
      ? { emoji: 'ℹ️', heading: 'TEST ALERTĂ — STARE CURENTĂ', action: '• FĂRĂ TRANZIȚIE / DOAR TEST', tone: 'Test' }
      : isBull""",
"""    const isBull = signal.score >= 20;
    const isBear = signal.score <= -20;
    const direction = isBull"""),
("""    const transitionText = isForcedStatus
      ? `fără tranziție — ${signal.tier} (stare la ultima lumânare închisă)`
      : signal.previousTier
        ? `${signal.previousTier} → ${signal.tier}`
        : signal.tier;""",
"""    const transitionText = signal.previousTier
      ? `${signal.previousTier} → ${signal.tier}`
      : signal.tier;"""),
])

# R2. /alerts/test back to hardcoded 1h
patch('apps/api/src/routes/telegram-routes.ts', [
("""  const symbol = (req.body.symbol || 'BTC').toUpperCase();
  const requestedTf = String(req.body.timeframe || '1h');
  const timeframe = (['1h', '4h', '8h', '1d', '1w', '1m'] as const).includes(requestedTf as any)
    ? requestedTf as '1h' | '4h' | '8h' | '1d' | '1w' | '1m'
    : '1h';
  const candles = await appState.marketData.getCandles(symbol, timeframe, 150);
  const quote = await appState.marketData.getPriceQuote(symbol);
  const signal = appState.moneyLine.calculateLatest(symbol, timeframe, candles);""",
"""  const symbol = (req.body.symbol || 'BTC').toUpperCase();
  const candles = await appState.marketData.getCandles(symbol, '1h', 150);
  const quote = await appState.marketData.getPriceQuote(symbol);
  const signal = appState.moneyLine.calculateLatest(symbol, '1h', candles);"""),
])

# R3. web api back to no-timeframe
patch('apps/web/src/services/api.ts', [
("""    body: JSON.stringify({ symbol, ...(timeframe ? { timeframe } : {}) })""",
"""    body: JSON.stringify({ symbol })"""),
("""export async function triggerTestAlert(symbol: string, timeframe?: string): Promise<any> {""",
"""export async function triggerTestAlert(symbol: string): Promise<any> {"""),
])

# R4+R5. bells back to no-arg
patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""      await triggerTestAlert(symbol, timeframe);""",
"""      await triggerTestAlert(symbol);"""),
])
patch('apps/web/src/components/AssetDetailModal.tsx', [
("""      await triggerTestAlert(symbol, activeTf);""",
"""      await triggerTestAlert(symbol);"""),
])

print("ALL REVERTS APPLIED")

# No-send daily regime scan

The internal `POST /api/alerts/daily-regime-scan/no-send` route requires the existing `x-daily-scan-token`. It always scans the automated 1D/1W timeframes with `delivery: 'none'`; request-body settings cannot enable Telegram.

`runDailyRegimeScan` defaults to `delivery: 'telegram'`, preserving the existing scheduler route. In none mode the whole `publishConfirmedFlipEvents` path is skipped: no delivery claims, suppression records, alert creation from that publisher, or Telegram send calls. Candidates, confirmed dashboard history, coverage, live progress and the segmented Firestore run still update. The shared scan lock remains in use. A none request cannot join an in-process Telegram run, and a held shared lock returns HTTP 409 rather than old results.

Status includes `deliveryMode`, `persistedRunId`, and `persistedUpdatedAt`. Persistence errors cannot return a successful fresh result in none mode. Scan-level errors return HTTP 502; other failures return HTTP 500. Consumers must inspect errors and coverage for partial asset failures and independently verify the active run and its timestamps before calling data fresh. Existing confirmation timestamps and closed-candle/ranking rules are unchanged.

No scheduler configuration, ranking, methodology, UI, or real-trading changes.

Validation: the no-send, scheduler-token and durable-delivery-guard suites pass together (12 tests). API TypeScript build passes. The broader daily-regime suite has four legacy publication fixtures expecting sends for future-close or 30-day-old candles; the publication function itself is byte-identical to HEAD and now rejects those fixtures under its existing 48-hour/closed-candle delivery rule. These failures are not waived or repaired by this change.

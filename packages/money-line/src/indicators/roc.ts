/**
 * Rate of Change (ROC) Calculations
 */

export function calculateROC(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    const prev = values[i - period];
    if (prev > 0) {
      result[i] = ((values[i] - prev) / prev) * 100;
    }
  }
  return result;
}

export function computeROCScore(roc9: number, roc21: number): number {
  if (isNaN(roc9) && isNaN(roc21)) return 0;
  const r9 = isNaN(roc9) ? 0 : roc9;
  const r21 = isNaN(roc21) ? r9 : roc21;

  // Blended ROC: 60% short term (9), 40% medium term (21)
  const blendedROC = r9 * 0.6 + r21 * 0.4;

  // Scale: +/- 5% ROC maps to +/- 100 score
  return Math.max(-100, Math.min(100, (blendedROC / 5) * 100));
}

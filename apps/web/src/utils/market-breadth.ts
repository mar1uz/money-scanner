export function calculateBreadth(rows: Array<{ change24h?: number }>) {
 let advancingCount=0, decliningCount=0, neutralCount=0, missingCount=0;
 for(const row of rows) {
  if(typeof row.change24h !== 'number' || !Number.isFinite(row.change24h)) { missingCount++; continue; }
  if(row.change24h>0.5) advancingCount++;
  else if(row.change24h< -0.5) decliningCount++;
  else neutralCount++;
 }
 const totalAssets=advancingCount+neutralCount+decliningCount;
 return {advancingCount,decliningCount,neutralCount,totalAssets,missingCount,bullishPercent:totalAssets?Math.round(advancingCount/totalAssets*100):null};
}

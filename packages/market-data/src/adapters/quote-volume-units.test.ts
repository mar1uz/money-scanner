import {test} from 'node:test';import assert from 'node:assert/strict';
import {MexcMarketAdapter} from './mexc.js';import {HyperliquidMarketAdapter} from './hyperliquid.js';import {PublicStockMarketAdapter} from './public-stock.js';import {MarketHealthMonitor} from '../health-monitor.js';
test('MEXC uses quoteVolume not base volume',async()=>{const old=globalThis.fetch;globalThis.fetch=(async()=>Response.json({lastPrice:'0.01',volume:'1000000',quoteVolume:'10000'})) as typeof fetch;try {assert.equal((await new MexcMarketAdapter(new MarketHealthMonitor()).fetchQuote('SHIBUSDT','SHIB')).volume24h,10000);}finally{globalThis.fetch=old;}});
test('Hyperliquid uses exact dayNtlVlm, never base candles',async()=>{const a=new HyperliquidMarketAdapter(new MarketHealthMonitor());(a as any).fetchRange=async()=>[{open:1,close:1,high:2,low:1,volume:999999}];(a as any).request=async(body:any)=>body.type==='allMids'?{BTC:'2'}:[{universe:[{name:'BTC'}]},[{dayNtlVlm:'12345'}]];assert.equal((await a.fetchQuote('BTC')).volume24h,12345);});
test('PublicStockMarketAdapter uses 24h session change rather than YTD chartPreviousClose',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=(async()=>Response.json({
    chart:{result:[{
      meta:{regularMarketPrice:1570.8,regularMarketChangePercent:0.657,previousClose:null,chartPreviousClose:1069.86,regularMarketDayHigh:1581.64,regularMarketDayLow:1550,regularMarketVolume:804714,regularMarketTime:1792783596},
      indicators:{quote:[{open:[1070,1555],close:[1560.54,1570.8]}]}
    }]}
  })) as typeof fetch;
  try {
    const q=await new PublicStockMarketAdapter(new MarketHealthMonitor()).fetchQuote('ASML');
    assert.equal(q.change24h,0.66);
    assert.equal(q.changeYtd,46.82);
  } finally {
    globalThis.fetch=old;
  }
});

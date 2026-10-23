import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculateBreadth} from '../utils/market-breadth.js';
import {MarketRegimeGauge} from './MarketRegimeGauge.js';
test('24h breadth is exclusive, tier independent, inclusive neutral boundary',()=>{
 const rows=[{change24h:1,tier:'Bearish'},{change24h:-1,tier:'Bullish'},{change24h:0.5},{change24h:-0.5},{change24h:0}];
 const b=calculateBreadth(rows); assert.deepEqual(b,{advancingCount:1,decliningCount:1,neutralCount:3,totalAssets:5,missingCount:0,bullishPercent:20});
});
test('zero is zero, empty or invalid data is unavailable',()=>{
 assert.equal(calculateBreadth([{change24h:-1}]).bullishPercent,0);
 assert.equal(calculateBreadth([]).bullishPercent,null);
 assert.equal(calculateBreadth([{change24h:NaN},{}]).missingCount,2);
});
test('global cap comes from overview; stock share volume excluded; no fake fallback',()=>{
 const row={symbol:'BTC',name:'Bitcoin',marketClass:'crypto',change24h:-1,marketCap:123,volume24h:456,moneyLineScore:60,tier:'Bullish'};
 const html=renderToStaticMarkup(React.createElement(MarketRegimeGauge,{overview:{totalMarketCap:2.83e12} as any,rows:[row,{...row,symbol:'NVDA',marketClass:'stocks',volume24h:1e12}] as any,selectedCategory:'ALL'}));
 assert.match(html,/≈ \$76\.57T/);assert.match(html,/\$456/);assert.match(html,/0% Bullish/);assert.doesNotMatch(html,/\$2.42T|\$78.4B|Scope estimate/);
 const cryptoHtml=renderToStaticMarkup(React.createElement(MarketRegimeGauge,{overview:{totalMarketCap:2.83e12} as any,rows:[row] as any,selectedCategory:'crypto'}));
 assert.match(cryptoHtml,/\$2\.83T/);
 const empty=renderToStaticMarkup(React.createElement(MarketRegimeGauge,{overview:null,rows:[]}));assert.match(empty,/Unavailable/);assert.doesNotMatch(empty,/\$2.42T|\$78.4B|50% Bullish/);
});

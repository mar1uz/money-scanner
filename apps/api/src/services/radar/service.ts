import type {RadarSnapshot,RadarToken} from '@money-scanner/shared';
import {collectMarket} from './market.js';
import {collectSocial} from './social.js';
import {dedupePosts,rankTokens} from './scoring.js';
import {RadarStore} from './store.js';
export const REPORT_INTERVAL=12*60*60_000;
export const reportSlot=(now=Date.now())=>String(Math.floor(now/REPORT_INTERVAL)*REPORT_INTERVAL);
export async function runRadar(publish=false):Promise<RadarSnapshot>{
 const store=new RadarStore(),now=Date.now(),slot=reportSlot(now);
 const already=publish?await store.report(slot):null;
 if(already){await deliverReport(store,already);return already;}
 const lease=await store.acquire();if(!lease)throw new Error('Radar scan already running; retry later');
 try{
  const previous=await store.latest('report'),cached=await store.latest('collection');
  let collection=cached;
  if(!cached||now-cached.generatedAt>=25*60_000){
   const tracked=[...new Map([...(cached?.rows||[]),...(previous?.rows||[])].map(t=>[t.id,t])).values()];
   const market=await collectMarket(tracked);
   if(!market.sources.some(s=>s.status==='ok'&&s.items>0))throw new Error('All market sources unavailable or empty; previous data preserved');
   const social=await collectSocial(market.tokens);
   const posts=dedupePosts([...social.posts,...await store.posts()],now);
   const candidates=market.tokens;
   const baseline=await store.baselines(candidates.map(t=>t.id));
   const sources=[...market.sources,...social.sources];
   const rows=rankTokens(candidates,posts.filter(p=>p.timestamp>=now-REPORT_INTERVAL),social.trending,social.sources.some(s=>s.kind==='social'&&s.status==='ok'),previous,baseline).slice(0,200);
   const ids=new Set(rows.map(r=>r.id)),byId=new Map(candidates.map(t=>[t.id,t]));
   collection={id:String(Math.floor(now/(30*60_000))*30*60_000),kind:'collection',generatedAt:now,methodology:'radar-v1',minMarketCap:500000,rows,
    exits:(previous?.rows||[]).filter(r=>!ids.has(r.id)).map(r=>({id:r.id,name:r.name,symbol:r.symbol,chain:r.chain,address:r.address,previousRank:r.rank,reason:byId.get(r.id)?.marketCap!==null && byId.get(r.id)?.marketCap!==undefined && byId.get(r.id)!.marketCap!<500000?'below_threshold':'unavailable_or_outside_sample'})),
    sources,discovered:candidates.length,excluded:{belowCap:candidates.filter(t=>t.marketCap!==null&&t.marketCap<500000).length,unknownCap:candidates.filter(t=>t.marketCap===null).length},previousReportAt:previous?.generatedAt||null,
    coverage:'Eșantion trending/new pools + tokenuri urmărite. Valori din poolul principal; capitalizare raportată de furnizor, fără substituire FDV. Datele sociale nu reprezintă întreaga comunitate. Scor v1 euristic, fără AI.'};
   await store.saveCollection(collection,posts,lease);
  }
  if(!collection)throw new Error('No collection');
  if(!publish)return collection;
  // Comparisons must use the previous published report, not an intervening collection.
  const baseline=await store.baselines(collection.rows.map(t=>t.id));
  const before=new Map(previous?.rows.map(r=>[r.id,r])||[]),first=new Map(baseline.map(b=>[b.id,b]));
  const report:RadarSnapshot={...collection,id:slot,kind:'report',generatedAt:Date.now(),previousReportAt:previous?.generatedAt||null,rows:collection.rows.map(r=>{
   const old=before.get(r.id),b=first.get(r.id);return {...r,previousPrice:old?.price??null,changePrevious:old?(r.price/old.price-1)*100:null,rankChange:old?old.rank-r.rank:null,firstPrice:b?.firstPrice??null,firstReportedAt:b?.firstReportedAt??null,changeFirst:b?(r.price/b.firstPrice-1)*100:null};})};
  const saved=await store.saveReport(report,lease);await deliverReport(store,saved);return saved;
 }finally{await store.release(lease);}
}
const money=(n:number)=>n.toLocaleString('en-US',{maximumSignificantDigits:6});
export function reportText(report:RadarSnapshot):string{
 const unavailable=report.sources.filter(s=>s.status!=='ok');
 const lines=[`Crypto Radar · ${new Date(report.generatedAt).toISOString()}`,`Solana / Base / Robinhood · market cap ≥ $500,000`,`Clasament: ${report.rows.length} monede · scor euristic v1`,`${unavailable.length} surse indisponibile/parțiale/neconfigurate; vezi acoperirea în aplicație.`, ''];
 for(const row of report.rows.slice(0,10))lines.push(`${row.rank}. ${row.name} (${row.symbol}) · ${row.chain}`,`$${money(row.price)} · cap $${money(row.marketCap!)} · scor ${row.score}`,`De la primul raport: ${row.changeFirst===null?'—':row.changeFirst.toFixed(2)+'%'} · precedent: ${row.changePrevious===null?'NOU':row.changePrevious.toFixed(2)+'%'} · loc: ${row.rankChange===null?'NOU':row.rankChange>0?'↑'+row.rankChange:row.rankChange<0?'↓'+Math.abs(row.rankChange):'='}`,`Contract: ${row.address}`,'');
 lines.push(`Istoric complet și surse: ${(process.env.PUBLIC_BASE_URL||'https://market-scanner-360-384051756749.europe-west3.run.app').replace(/\/$/,'')}/?tab=crypto_radar`,`${report.exits.length} monede ieșite din clasament; păstrate în istoric.`);
 return lines.join('\n');
}
async function deliverReport(store:RadarStore,report:RadarSnapshot){
 const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chat)return; // Dashboard report remains available; status says not configured.
 if(!await store.claimDelivery(report.id))return;
 const text=reportText(report);const chunks:string[]=[];let chunk='';
 for(const line of text.split('\n')){if((chunk+line).length>3500){chunks.push(chunk);chunk='';}chunk+=line+'\n';}if(chunk)chunks.push(chunk);
 try{
  for(const part of chunks){const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:part,disable_web_page_preview:true}),signal:AbortSignal.timeout(15_000)});const body=await response.json() as any;if(!response.ok||!body.ok)throw new Error(`Telegram HTTP ${response.status}`);}
  await store.deliveryResult(report.id,'sent','Raport trimis la destinația Telegram configurată.');
 }catch{await store.deliveryResult(report.id,'uncertain','Livrare incompletă sau neconfirmată. Verificare manuală; fără retrimitere automată pentru a evita duplicate.');}
}

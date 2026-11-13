import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const providerFlag = process.argv.indexOf('--provider');
const selectedProvider = providerFlag < 0 ? 'travelport' : process.argv[providerFlag + 1];
if (!['travelport', 'serpapi'].includes(selectedProvider)) throw Error('Unknown provider');
if (selectedProvider === 'serpapi') {
  await import('./serpapi-search.mjs');
  process.exit(process.exitCode ?? 0);
}
const root = process.cwd();
if (!existsSync(resolve(root, 'src/lib/flights/travelport-provider.server.ts'))) throw Error('Run from the Flight Analytics repository root');
const queries = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(queries) || !queries.length) throw Error('Expected a nonempty query array');
for (const q of queries) {
 if (!/^[A-Z]{3}$/.test(q.origin) || !/^[A-Z]{3}$/.test(q.destination) || !/^\d{4}-\d{2}-\d{2}$/.test(q.departureDate) || !Number.isInteger(q.passengers) || q.passengers < 1 || !['economy','premium_economy','business','first'].includes(q.cabinClass) || q.returnDate || Object.keys(q).some(k=>!['origin','destination','departureDate','passengers','cabinClass'].includes(k))) throw Error('Unsupported query: one-way adult searches only');
 const d = new Date(q.departureDate+'T12:00:00Z');
 if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==q.departureDate) throw Error('Invalid calendar date');
}
for (const file of ['.env','.env.local']) if (existsSync(resolve(root,file))) process.loadEnvFile(resolve(root,file));
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.')&&!specifier.endsWith('.ts')&&!specifier.endsWith('.js')) {
  try{return next(specifier+'.ts',context);}catch{}
 }
 return next(specifier,context);
}});
const moduleAt = name => import(pathToFileURL(resolve(root,`src/lib/flights/${name}.ts`)));
const {getTravelportCredentials}=await moduleAt('travelport-config.server');
if (!getTravelportCredentials()) {
 console.log(JSON.stringify({status:'not_connected',reason:'Travelport configuration missing or invalid',missingVariables:['TRAVELPORT_CLIENT_ID','TRAVELPORT_CLIENT_SECRET','TRAVELPORT_USERNAME','TRAVELPORT_PASSWORD'].filter(k=>!process.env[k]?.trim()),routingPresent:Boolean(process.env.TRAVELPORT_ACCESS_GROUP?.trim()||process.env.TRAVELPORT_PCC?.trim())}));
 process.exit(2);
}
const {travelportProvider}=await moduleAt('travelport-provider.server');
const {normalizeTravelportFlights}=await moduleAt('travelport-normalizer');
const {getAirportTimeZone}=await moduleAt('airport-timezone');
const {localDateTimeToIso}=await moduleAt('local-datetime');
const originalFetch=globalThis.fetch;
let raw, transport=[];
globalThis.fetch=async(url,options)=>{
 const stage=String(url).includes('/oauth/')?'oauth':'search';
 try {
  const response=await originalFetch(url,options);
  transport.push({stage,httpStatus:response.status});
  if(stage==='search'&&response.ok) raw=await response.clone().json();
  return response;
 }catch(e){transport.push({stage,errorName:e.name,networkCode:e.cause?.code??null});throw e;}
};
for(const query of queries){
 raw=undefined;transport=[];
 const result=await travelportProvider.searchFlights(query,{});
 const diagnostics={missingAirports:[],invalidDateTimePoints:[],journeyIssues:[],skipped:{},receivedVariants:null};
 if(raw){
  try {
   const n=normalizeTravelportFlights(raw);
   diagnostics.receivedVariants=n.offers.length+n.skipped.length;
   for(const s of n.skipped) diagnostics.skipped[s.reason]=(diagnostics.skipped[s.reason]??0)+1;
   const r=raw.CatalogProductOfferingsResponse;
   const flights=new Map((r.ReferenceList??[]).flatMap(x=>x.Flight??[]).map(f=>[f.id,f]));
   const products=new Map((r.ReferenceList??[]).flatMap(x=>x.Product??[]).map(p=>[p.id,p]));
   for(const f of flights.values()) for(const side of ['Departure','Arrival']) {
    const p=f[side];let zone;
    try{zone=getAirportTimeZone(p.location);}catch{diagnostics.missingAirports.push(p.location);continue;}
    try{localDateTimeToIso(p.date,p.time,zone);}catch{diagnostics.invalidDateTimePoints.push({airport:p.location,date:p.date,time:p.time,reason:'invalid_or_ambiguous_local_datetime'});}
   }
   diagnostics.missingAirports=[...new Set(diagnostics.missingAirports)].sort();
   for(const s of n.skipped.filter(s=>s.reason==='INVALID_JOURNEY')){
    const v=r.CatalogProductOfferings.CatalogProductOffering[s.catalogIndex].ProductBrandOptions[s.optionIndex].ProductBrandOffering[s.variantIndex];
    const p=products.get(v.Product[0].productRef);
    const segments=[...p.FlightSegment].sort((a,b)=>a.sequence-b.sequence).map(x=>flights.get(x.Flight.FlightRef)).map(f=>({from:f.Departure.location,to:f.Arrival.location,dep:localDateTimeToIso(f.Departure.date,f.Departure.time,getAirportTimeZone(f.Departure.location)),arr:localDateTimeToIso(f.Arrival.date,f.Arrival.time,getAirportTimeZone(f.Arrival.location))}));
    for(let i=0;i<segments.length;i++){
     const a=segments[i],b=segments[i-1];
     if(Date.parse(a.arr)<=Date.parse(a.dep)) diagnostics.journeyIssues.push({reason:'arrival_not_after_departure',from:a.from,to:a.to});
     if(b&&b.to!==a.from) diagnostics.journeyIssues.push({reason:'airport_change',from:b.to,to:a.from});
     if(b&&Date.parse(b.arr)>Date.parse(a.dep)) diagnostics.journeyIssues.push({reason:'connection_departs_before_arrival',from:b.to,to:a.from});
    }
   }
  }catch{diagnostics.responseDiagnostic='invalid_or_unsupported_response';}
 }
 const exactOffers=result.status==='ok'?result.offers.filter(o=>o.origin===query.origin&&o.destination===query.destination&&o.departureAt.slice(0,10)===query.departureDate&&o.cabinClass===query.cabinClass&&o.comparisonEvidence?.passengers===query.passengers):[];
 console.log(JSON.stringify({query,transport,diagnostics,result,exactMatchCount:exactOffers.length,bestExactOffers:[...exactOffers].sort((a,b)=>a.price.currency.localeCompare(b.price.currency)||a.price.amount-b.price.amount).slice(0,3)}));
 if(transport.some(t=>t.networkCode||t.errorName||t.httpStatus===401||t.httpStatus===403||t.httpStatus===429||(t.stage==='oauth'&&t.httpStatus!==200)||t.httpStatus>=500)) break;
}

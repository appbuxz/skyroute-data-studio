import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const adapter = resolve(root, 'src/lib/flights/serpapi-provider.server.ts');
if (!existsSync(adapter)) {
 console.log(JSON.stringify({status:'not_connected',reason:'Existing SerpApi adapter is missing from this branch'}));
 process.exit(2);
}
const queries = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(queries) || !queries.length) throw Error('Expected nonempty query array');
for (const q of queries) {
 if (!/^[A-Z]{3}$/.test(q.origin)||!/^[A-Z]{3}$/.test(q.destination)||!/^\d{4}-\d{2}-\d{2}$/.test(q.departureDate)||!Number.isInteger(q.passengers)||q.passengers<1||!['economy','premium_economy','business','first'].includes(q.cabinClass)||Object.keys(q).some(k=>!['origin','destination','departureDate','passengers','cabinClass'].includes(k))) throw Error('Unsupported query: one-way adults only; currency is KZT');
 const d = new Date(q.departureDate+'T12:00:00Z');
 if (!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==q.departureDate) throw Error('Invalid calendar date');
}
for(const file of ['.env','.env.local']) if(existsSync(resolve(root,file))) process.loadEnvFile(resolve(root,file));
if (!process.env.SERPAPI_API_KEY?.trim()) {
 console.log(JSON.stringify({provider:'serpapi',status:'not_connected',reason:'SERPAPI_API_KEY is not configured',query:queries[0],searchesSent:0}));
 process.exit(2);
}
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.')&&!specifier.endsWith('.ts')&&!specifier.endsWith('.js')){try{return next(specifier+'.ts',context);}catch{}}
 return next(specifier,context);
}});
const {serpApiProvider} = await import(pathToFileURL(adapter));
const originalFetch=globalThis.fetch;
let transport=[],received=null;
globalThis.fetch=async(url,options)=>{
 try{
  const response=await originalFetch(url,options);
  transport.push({httpStatus:response.status});
  if(response.ok){
   try{const raw=await response.clone().json();received=(raw.best_flights?.length??0)+(raw.other_flights?.length??0);}catch{}
  }
  return response;
 }catch(e){transport.push({errorName:e.name,networkCode:e.cause?.code??null});throw e;}
};
// The adapter may print provider error bodies; suppress those rather than risk keys/URLs.
const originalError=console.error,originalWarn=console.warn;
try{
 console.error=()=>{};console.warn=()=>{};
 for(const query of queries){
  transport=[];received=null;
  const result=await serpApiProvider.searchFlights(query,{});
  const exact=result.status==='ok'?result.offers.filter(o=>o.origin===query.origin&&o.destination===query.destination&&o.departureAt.slice(0,10)===query.departureDate):[];
  console.log(JSON.stringify({provider:'serpapi',provenance:'public_aggregator_search',priceStatus:'цена агрегатора',currencyRequested:'KZT',query,transport,receivedVariants:received,result,exactRouteDateCount:exact.length,totalPriceScopeVerified:false,baggageVerified:false,sellerVerified:false,bookingOptionsSupported:false,exactOffersByPrice:[...exact].sort((a,b)=>a.price.amount-b.price.amount)}));
  if(result.status!=='ok'||!result.offers.length)break;
 }
}finally{console.error=originalError;console.warn=originalWarn;globalThis.fetch=originalFetch;}

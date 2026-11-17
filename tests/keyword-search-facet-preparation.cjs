/* Warm text documents still need deferred work when a later query requests a new facet. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tasks=[],context={console,window:null,performance:{now:()=>0},setTimeout:callback=>tasks.push(callback)};context.window=context;vm.createContext(context);
for(const file of ['category-tree.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist',file),'utf8'),context);
const api=context.FasKeywordSearch,reads={body:0,color:0,origin:0,market:0},touched={body:new Set(),color:new Set(),origin:new Set(),market:new Set()};
const rows=Array.from({length:251},(_,index)=>({id:index+1,category:'cars',name:'Geely контроль '+index,get bodyType(){reads.body++;touched.body.add(index);return 'sedan'},get color(){reads.color++;touched.color.add(index);return 'red'},get brand(){reads.origin++;touched.origin.add(index);return 'Geely'},get saleCountry(){reads.market++;touched.market.add(index);return 'Россия'}}));
const finish=()=>{while(tasks.length)tasks.shift()()},reset=()=>{for(const key of Object.keys(reads)){reads[key]=0;touched[key].clear()}};
(async()=>{
 const warm=api.prepare(rows,'Geely');finish();assert.equal((await warm).prepared,251);reset();
 for(const [query,facet,flag]of [['седан','body','needsBody'],['красный','color','needsColor'],['китайский','origin','needsOrigin'],['в России','market','needsMarket']]){
  assert.equal(api.compile(query)[flag],true,query+' must request the intended facet');let cancelled=false;
  const pending=api.prepare(rows,query,{cancelled:()=>cancelled});assert.equal(reads[facet],0,'new facet work starts after a task boundary');assert.equal(tasks.length,1,query+' cannot report an already prepared base document as complete');
  tasks.shift()();assert.equal(touched[facet].size,100,'one task hydrates at most 100 distinct rows');
  if(facet==='color'){
   cancelled=true;finish();assert((await pending).cancelled);assert.equal(touched.color.size,100,'cancellation leaves the remaining facet work untouched');
   const resumed=api.prepare(rows,query);finish();assert(!(await resumed).cancelled);
  }else{finish();const result=await pending;assert(!result.cancelled);assert.equal(result.chunks,3)}
  assert.equal(touched[facet].size,251);const preparedReads=reads[facet];for(const lot of rows)assert(api.matches(lot,query));assert.equal(reads[facet],preparedReads,'synchronous matching does not repeat facet hydration');
  const cached=await api.prepare(rows,query);assert.equal(cached.chunks,0);assert.equal(tasks.length,0);assert.equal(reads[facet],preparedReads,'a completed facet remains cached');
  reset();
 }
 // Unknown facet values are cached as null/empty sets; they must not be reprocessed forever.
 const unknown=[{id:300,category:'cars',name:'Неизвестная машина',brand:'Unknown make',bodyType:'unknown',color:'unknown',saleCountry:'Unknown country'}];
 for(const query of ['седан','красный','китайский','в России']){const first=api.prepare(unknown,query);finish();await first;assert.equal((await api.prepare(unknown,query)).chunks,0)}
 console.log('PASS: text→body/color/origin/market facets prepare in bounded deferred chunks, preserve cancellation and completed caches, and leave no facet hydration in synchronous matching.');
})().catch(error=>{console.error(error);process.exitCode=1});

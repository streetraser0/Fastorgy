const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/sales-analytics.js','utf8'),pause=()=>new Promise(setImmediate),now=Date.now();
const sale=(extra={})=>({id:1042,demo:true,status:'sold',name:'Исходный демолот',category:'cars',city:'Демогород',soldPrice:1000,soldAt:new Date(now-60000).toISOString(),bids:2,...extra});
function boot(lots,{native=false,offline=false}={}){
 const h=setup(),requests=[];h.context.cars=lots;h.context.location={protocol:native?'capacitor:':'https:',origin:'https://example.invalid'};
 h.context.fetch=async(path,init={})=>{requests.push({path,init});if(offline)throw Error('synthetic offline');return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>init.method==='POST'?{accepted:JSON.parse(init.body).records.length,duplicates:0}:{source:'demo',records:[]}}};
 vm.runInContext(source,h.context);const dialog=h.document.querySelector('#sales-analytics-dialog'),field=id=>dialog.querySelector('#'+id);
 field('sales-period').value='year';field('sales-category').value='';
 return {...h,requests,field,api:h.context.FasSalesAnalytics,posts:()=>requests.filter(r=>r.path==='/api/analytics/sales'&&r.init.method==='POST'),async select(id,value){field(id).value=value;field(id).dispatchEvent({type:'change'});await pause()}};
}
(async()=>{
 const privateLots=[
  sale({id:201,demo:false,name:'SYNTHETIC LOCAL SELLER',sellerOwnerId:'synthetic-owner',privateSellerDemo:true}),
  sale({id:202,demo:undefined,name:'SYNTHETIC IMPORT'}),sale({id:203,demo:false}),sale({id:204,demo:'true'}),
  sale({id:205,demoEdited:true}),sale({id:206,sellerOwnerId:'synthetic-owner'}),sale({id:207,privateSellerDemo:true}),sale({id:208,ownerId:'synthetic-owner'}),
  sale({id:0}),sale({id:-1}),sale({id:209,demo:false,soldAt:'2020-01-01T00:00:00.000Z'})
 ];
 // The same retained device records must stay local under successive platform sessions.
 for(let session=0;session<2;session++){
  const h=boot(privateLots);await pause();assert.equal(h.posts().length,0,'startup does not transmit device-local records');
  await h.api.captureSales(privateLots);h.api.open();await pause();assert.equal(h.api.state().storageSource,'device');assert.equal(h.api.state().count,8,'valid local sales retain a full-year view');assert.equal(h.requests.length,0,'opening local statistics needs no server');
  assert(h.field('sales-history').innerHTML.includes('SYNTHETIC LOCAL SELLER'));assert.match(h.field('sales-source-note').textContent,/не отправляются на сервер/);
  h.document.hidden=true;h.event('visibilitychange');h.document.hidden=false;h.event('visibilitychange');await pause();
  h.field('sales-refresh').onclick();await pause();assert.equal(h.posts().length,0,'visibility and explicit refresh do not queue local records');
  await h.select('sales-source','server');h.field('sales-refresh').onclick();await pause();await h.api.captureSales(privateLots);assert.equal(h.posts().length,0,'requesting server statistics never imports device-local records');
  assert(h.requests.every(r=>r.init.method!=='POST'),'server history can be read without uploading local sales');
 }
 {
  const eligible=sale(),h=boot([...privateLots,eligible,sale({id:1043,status:'live'})]);await pause();
  assert.equal(h.posts().length,1);const body=JSON.parse(h.posts()[0].init.body);assert.equal(body.records.length,1);assert.equal(body.records[0].lotId,1042);assert(!JSON.stringify(body).includes('SYNTHETIC'));
  await h.api.captureSales([...privateLots,eligible]);assert.equal(h.posts().length,1,'eligible seed events retain deduplication');assert.equal(h.api.state().pending,0);
 }
 {
  const h=boot([sale()],{offline:true});await pause();assert.equal(h.api.state().pending,1);
  await h.api.captureSales([sale({demoEdited:true,name:'SYNTHETIC EDITED SEED'})]);assert.equal(h.api.state().pending,0,'an edited lot cannot leave a queued seed event eligible for retry');
  h.document.hidden=true;h.event('visibilitychange');h.document.hidden=false;h.event('visibilitychange');await pause();assert.equal(h.posts().length,1,'visibility does not retry a seed event removed by editing');
 }
 {
  const h=boot([]);let resolveServer;h.context.fetch=()=>new Promise(resolve=>resolveServer=resolve);h.api.open();
  await h.api.captureSales([privateLots[0]]);await h.select('sales-source','device');
  resolveServer({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({source:'demo',records:[{lotId:999,name:'SYNTHETIC SERVER ONLY',category:'cars',amount:10,soldAt:new Date(now-1000).toISOString()}]})});await pause();
  assert.equal(h.api.state().storageSource,'device');assert.equal(h.api.state().count,1);assert(h.api.toCSV().includes('SYNTHETIC LOCAL SELLER'));assert(!h.api.toCSV().includes('SYNTHETIC SERVER ONLY'),'a stale server response cannot replace a selected local history');
 }
 // Local summaries, category/period filters, pagination and CSV remain usable offline/native.
 for(const native of [false,true]){
  const rows=Array.from({length:105},(_,i)=>sale({id:300+i,demo:false,name:i===0?'=SYNTHETIC()':'Локальный лот '+i,category:i===0?'equipment':'cars',soldAt:new Date(now-(i===0?60:1)*86400000).toISOString()}));
  const h=boot(rows,{native,offline:true});h.api.open();await pause();assert.equal(h.api.state().count,105);assert.equal(h.requests.length,0);assert(h.field('sales-analytics-metrics').innerHTML.includes('105 000'));
  await h.api.loadMore();assert(h.field('sales-history').innerHTML.includes('=SYNTHETIC()'),'older local rows remain reachable after the first100');assert(h.api.toCSV().includes('"\'=SYNTHETIC()"'),'local export retains spreadsheet escaping');assert(h.api.toCSV().includes('Локальная демонстрационная сделка'));
  await h.select('sales-period','30');assert(!h.api.toCSV().includes('SYNTHETIC()'));await h.select('sales-period','year');await h.select('sales-category','equipment');assert(h.api.toCSV().includes('SYNTHETIC()'));assert(!h.api.toCSV().includes('Локальный лот 1'));assert.equal(h.requests.length,0);
 }
 console.log('PASS: local/private/edited/imported sales never upload on startup, capture, visibility or retry; only unedited seed demo events sync, with offline/native annual summaries, filters, history and safe CSV preserved.');
})().catch(error=>{console.error(error);process.exitCode=1});

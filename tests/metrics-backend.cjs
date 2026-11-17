const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fas-metrics-test-'));
const runner=String.raw`import json,sqlite3,sys
payload=json.load(sys.stdin)
db=sqlite3.connect(sys.argv[1]);db.row_factory=sqlite3.Row
result=[]
try:
 for item in payload:
  before=db.total_changes
  cursor=db.execute(item['sql'],item.get('values',[]))
  rows=[dict(row) for row in cursor.fetchall()] if cursor.description else []
  result.append({'results':rows,'meta':{'changes':db.total_changes-before},'success':True})
 db.commit()
except:
 db.rollback();raise
print(json.dumps(result))`;
class Database{
 constructor(filename){this.filename=filename;this.queries=[];cp.execFileSync('python',['-c','import sqlite3,sys;db=sqlite3.connect(sys.argv[1]);db.executescript(sys.stdin.read());db.commit()',filename],{input:JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8')).entries.map(entry=>fs.readFileSync(path.join(root,'drizzle',entry.tag+'.sql'),'utf8')).join('\n')})}
 prepare(sql){assert(!/\b(?:CREATE|ALTER|DROP)\b/i.test(sql),'request handlers never own schema changes');const db=this;return{sql,values:[],bind(...values){this.values=values;return this},async run(){return(await db.batch([this]))[0]},async first(){return(await db.batch([this]))[0].results[0]||null}}}
 async batch(statements){this.queries.push(...statements.map(s=>s.sql));return JSON.parse(cp.execFileSync('python',['-c',runner,this.filename],{input:JSON.stringify(statements.map(s=>({sql:s.sql,values:s.values}))),encoding:'utf8',maxBuffer:8*1024*1024}))}
}
const origin='https://auction.example.test';
function request(route,options={}){const headers={...(options.user===null?{}:{'oai-authenticated-user-id':options.user||'owner-user'}),...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...options.headers};return new Request(origin+route,{method:options.method||'GET',headers,...(options.body!==undefined?{body:typeof options.body==='string'?options.body:JSON.stringify(options.body)}:{})})}
(async()=>{
 const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8'),page=Buffer.from('<html lang="ru"><title>ФАС торги</title></html>'),css=Buffer.from('body{color:blue}');
 const assets={'/index.html':{data:page.toString('base64'),size:page.length,type:'text/html; charset=utf-8',etag:'"index-hash"'},'/app.css':{data:css.toString('base64'),size:css.length,type:'text/css',etag:'"css-hash"'}};
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source.replace('/* SITES_STATIC_ASSETS */ {}',JSON.stringify(assets))).toString('base64'))).default;
 const db=new Database(path.join(temporary,'db.sqlite')),env={DB:db},realNow=Date.now;let now=Date.parse('2024-02-29T12:00:00.000Z');Date.now=()=>now;
 const call=(route,options={})=>worker.fetch(request(route,options),env);
 try{
  let response=await call('/');assert.equal(response.status,200);assert.equal(await response.text(),page.toString());assert.match(response.headers.get('cache-control'),/no-store/);
  response=await call('/app.css',{method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');assert.equal(response.headers.get('Content-Length'),String(css.length));
  response=await call('/app.css',{headers:{'If-None-Match':'"css-hash"'}});assert.equal(response.status,304);
  assert.equal((await call('/missing.js')).status,404);assert.equal((await call('/',{method:'POST'})).status,405);
  assert.equal((await call('/api/missing')).status,404);
  assert.equal((await call('/api/analytics/sales',{user:null})).status,401);
  assert.equal((await call('/api/metrics/visit',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await call('/api/metrics/visit',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await worker.fetch(request('/api/metrics/visit'),{})).status,503);
  response=await call('/api/metrics/visit',{method:'POST'});assert.equal(response.headers.get('cache-control'),'no-store, private');assert.deepEqual(await response.json(),{totalUsers:1,onlineUsers:1,period:'all-time',onlineWindowMinutes:5,serverTime:new Date(now).toISOString()});
  await call('/api/metrics/visit',{method:'POST'});response=await call('/api/metrics/visit');assert.equal((await response.json()).totalUsers,1,'repeat requests do not invent users');
  await call('/api/metrics/visit',{method:'POST',user:'second-user'});assert.equal((await(await call('/api/metrics/visit')).json()).totalUsers,2);
  const users=await db.prepare('SELECT * FROM site_users').first();assert.match(users.user_hash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(users).includes('owner-user'),'only a site-scoped identity hash is stored');
  now+=300001;assert.equal((await(await call('/api/metrics/visit')).json()).onlineUsers,0);await call('/api/metrics/visit',{method:'POST'});assert.equal((await(await call('/api/metrics/visit')).json()).onlineUsers,1);
  now=Date.parse('2024-02-29T12:00:00.000Z');
  const sale=(extra={})=>({lotId:1042,name:'Автомобиль',category:'cars',categoryLabel:'Легковые автомобили',region:'Воронежская область',amount:1000000,soldAt:new Date(now-1000).toISOString(),participantCount:2,bidCount:8,method:'auction',...extra});
  let empty=await(await call('/api/analytics/sales')).json();assert.equal(empty.summary.dealCount,0);assert.equal(empty.summary.reportedParticipantCount,null);assert.equal(empty.records.length,0);assert.equal(empty.retentionSince,'2023-02-28T12:00:00.000Z','leap-year retention clamps to a calendar year');
  response=await call('/api/analytics/sales',{method:'POST',body:{records:[sale({source:'verified',paid:true,ownerId:'different-owner',name:'<img src=x onerror=alert(1)>'}),sale({lotId:1043,category:'phones',categoryLabel:'Телефоны',amount:20000,participantCount:0,soldAt:new Date(now-40*86400000).toISOString()}),sale({lotId:1044,amount:500000,participantCount:null,bidCount:null,soldAt:'2023-02-28T12:00:00.000Z'})]}});
  assert.deepEqual(await response.json(),{accepted:3,duplicates:0,source:'demo'});
  response=await call('/api/analytics/sales',{method:'POST',body:{records:[sale({amount:1})]}});assert.deepEqual(await response.json(),{accepted:0,duplicates:1,source:'demo'},'replay cannot overwrite an earlier sale amount');
  let result=await(await call('/api/analytics/sales')).json();assert.equal(result.source,'demo');assert.equal(result.summary.dealCount,3);assert.equal(result.summary.totalAmount,1520000);assert.equal(result.summary.averageAmount,506667);assert.equal(result.summary.reportedParticipantCount,2);assert.equal(result.summary.participantKnownDeals,2);assert(result.records.every(r=>r.source==='demo'&&!Object.hasOwn(r,'ownerId')&&!Object.hasOwn(r,'paid')));
  assert.equal(result.records[0].name,'<img src=x onerror=alert(1)>','names stay JSON data, never executable HTML');assert.equal(result.categories.length,2);assert.equal(result.monthly.reduce((n,row)=>n+row.dealCount,0),3);assert.equal(result.monthly.length,13,'partial first/current calendar months are retained');
  const other=await(await call('/api/analytics/sales',{user:'second-user'})).json();assert.equal(other.summary.dealCount,0,'history is scoped to the authenticated identity');
  result=await(await call('/api/analytics/sales?period=30')).json();assert.equal(result.summary.dealCount,1);assert.equal(result.availableCategories.length,2,'category choices cover the full retained year');
  result=await(await call('/api/analytics/sales?period=90&category=phones')).json();assert.equal(result.summary.dealCount,1);assert.equal(result.summary.totalAmount,20000);assert(result.records.every(r=>r.category==='phones'));assert.equal(result.categories.length,1);
  for(const route of ['/api/analytics/sales?period=all','/api/analytics/sales?category=cars%22%20OR%201','/api/analytics/sales?limit=501','/api/analytics/sales?limit=0','/api/analytics/sales?offset=-1','/api/analytics/sales?offset=1.5'])assert.equal((await call(route)).status,400,route);
  for(const extra of [{lotId:0},{amount:'1'},{amount:NaN},{amount:0},{amount:1.5},{amount:Number.MAX_SAFE_INTEGER+1},{soldAt:new Date(now+1).toISOString()},{soldAt:'2023-02-28T11:59:59.999Z'},{participantCount:-1},{participantCount:'8'},{bidCount:1000001},{category:'cars;DROP TABLE site_users'},{method:'paid'}])assert.equal((await call('/api/analytics/sales',{method:'POST',body:{records:[sale(extra)]}})).status,422,JSON.stringify(extra));
  assert.equal((await call('/api/analytics/sales',{method:'POST',body:'{'})).status,400);
  assert.equal((await call('/api/analytics/sales',{method:'POST',body:{records:[sale()]},headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await call('/api/analytics/sales',{method:'POST',body:'x'.repeat(65537)})).status,413);
  assert.equal((await call('/api/analytics/sales',{method:'POST',body:{records:Array.from({length:51},()=>sale())}})).status,422);
  const first=(await db.prepare('SELECT user_hash FROM sale_events LIMIT 1').first()).user_hash;
  await db.batch([db.prepare('INSERT INTO sale_events (id,user_hash,lot_id,name,category,category_label,region,amount,sold_at,method,source,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind('old',first,1,'Истёкшая запись','cars','Автомобили','',1,'2020-01-01T00:00:00.000Z','unknown','demo',new Date(now).toISOString())]);
  await call('/api/analytics/sales');assert.equal(await db.prepare('SELECT id FROM sale_events WHERE id=?').bind('old').first(),null,'expired records are removed, not merely hidden');
  const many=Array.from({length:1200},(_,i)=>db.prepare('INSERT INTO sale_events (id,user_hash,lot_id,name,category,category_label,region,amount,sold_at,method,source,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind('bulk-'+String(i).padStart(4,'0'),first,2000+i,'Большая демосделка','equipment','Оборудование','',Number.MAX_SAFE_INTEGER,new Date(now-2000-i).toISOString(),'unknown','demo',new Date(now).toISOString()));
  await db.batch(many);result=await(await call('/api/analytics/sales')).json();const exact=(1200n*BigInt(Number.MAX_SAFE_INTEGER)+1520000n).toString();assert.equal(result.summary.totalAmount,exact,'large sums remain exact without SQLite integer overflow');assert.equal(result.summary.totalAmountExact,exact);assert.equal(result.records.length,100);assert.equal(result.total,1203);assert.equal(result.nextOffset,100);
  const next=await(await call('/api/analytics/sales?limit=500&offset=100')).json();assert.equal(next.records.length,500);assert.equal(next.summary.totalAmount,exact);assert.equal(next.nextOffset,600);
  const final=await(await call('/api/analytics/sales?offset=1200')).json();assert.equal(final.records.length,3);assert.equal(final.nextOffset,null);assert.equal(final.truncated,false,'older retained history remains reachable');
  assert(db.queries.every(sql=>!/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)),'schema is migration owned');
 }finally{Date.now=realNow}
 // The deterministic builder is exercised in a separate disposable checkout.
 const fixture=path.join(temporary,'fixture');fs.mkdirSync(path.join(fixture,'scripts'),{recursive:true});fs.mkdirSync(path.join(fixture,'worker'));fs.mkdirSync(path.join(fixture,'dist'));fs.mkdirSync(path.join(fixture,'.openai'));
 fs.copyFileSync(path.join(root,'scripts/build-worker.mjs'),path.join(fixture,'scripts/build-worker.mjs'));fs.copyFileSync(path.join(root,'scripts/validate-worker.mjs'),path.join(fixture,'scripts/validate-worker.mjs'));fs.copyFileSync(path.join(root,'worker/index.js'),path.join(fixture,'worker/index.js'));fs.cpSync(path.join(root,'drizzle'),path.join(fixture,'drizzle'),{recursive:true});
 fs.writeFileSync(path.join(fixture,'.openai/hosting.json'),JSON.stringify({project_id:'fixture-existing-site',d1:'DB'}));fs.writeFileSync(path.join(fixture,'dist/index.html'),page);fs.writeFileSync(path.join(fixture,'dist/app.css'),css);fs.writeFileSync(path.join(fixture,'dist/untracked-secret.txt'),'not in committed source');
 cp.execFileSync('git',['init','-q'],{cwd:fixture});cp.execFileSync('git',['add','dist/index.html','dist/app.css'],{cwd:fixture});
 cp.execFileSync(process.execPath,['scripts/build-worker.mjs'],{cwd:fixture});const built=fs.readFileSync(path.join(fixture,'dist/server/index.js'),'utf8');assert(!built.includes('not in committed source'));
 assert.equal(fs.readFileSync(path.join(fixture,'dist/.openai/drizzle/0000_metrics.sql'),'utf8'),fs.readFileSync(path.join(root,'drizzle/0000_metrics.sql'),'utf8'),'migration SQL uses the official deployment metadata directory');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture,'dist/.openai/drizzle/meta/_journal.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8')),'migration journal is packaged with its SQL');
 assert(!fs.existsSync(path.join(fixture,'dist/drizzle')),'the unsupported migration directory is not retained');
 cp.execFileSync(process.execPath,['scripts/validate-worker.mjs'],{cwd:fixture});cp.execFileSync(process.execPath,['scripts/build-worker.mjs'],{cwd:fixture});assert.equal(fs.readFileSync(path.join(fixture,'dist/server/index.js'),'utf8'),built,'same tracked source produces byte-identical Worker output');
 console.log('PASS: real SQLite migrations, authenticated hashed users, idempotent demo sales, calendar retention, private/filter/pagination boundaries, exact large totals, request limits and deterministic static Worker packaging.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));

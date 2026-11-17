#!/usr/bin/env node
'use strict';
/* Optional LOCAL diagnostic, not a production load generator.
 * node docs/diagnostics/capacity-check.cjs --report /tmp/fas-capacity.json
 * Requires Node 24 and Python 3 sqlite3. Never calls a network endpoint.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'fas-capacity-')),NOW=Date.UTC(2026,10,14,12),CONCURRENCY=4;
const argument=process.argv.indexOf('--report'),output=argument<0?'/tmp/fas-capacity.json':process.argv[argument+1];assert(output,'--report needs a path');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),identity=i=>'capacity-fixture-user-'+i,userHash=i=>hash('fas-site-user:v1:'+identity(i));
const python=String.raw`import datetime,hashlib,json,os,resource,sqlite3,sys,time
db=sqlite3.connect(sys.argv[1],timeout=30);db.row_factory=sqlite3.Row
db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA busy_timeout=30000')
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def execute(command):
 if command['op']=='seed':
  for entry in json.load(open(sys.argv[2]+'/drizzle/meta/_journal.json'))['entries']:db.executescript(open(sys.argv[2]+'/drizzle/'+entry['tag']+'.sql').read())
  n=command['users'];now=datetime.datetime.fromtimestamp(command['now']/1000,datetime.timezone.utc);at=now.isoformat(timespec='milliseconds').replace('+00:00','Z');old=(now-datetime.timedelta(days=2)).isoformat(timespec='milliseconds').replace('+00:00','Z')
  users=[];sales=[]
  for i in range(n):
   owner=digest('fas-site-user:v1:capacity-fixture-user-'+str(i));users.append((owner,old,at if i%100==0 else old));lot=i+1
   sales.append((digest('fas-demo-sale:v1:'+owner+':'+str(lot)+':'+old),owner,lot,'Fixture owner '+str(i),'cars','Cars','Fixture region',100000+i,old,1,1,'auction','demo',at))
  owner=users[0][0]
  for i in range(9999):
   lot=n+i+1;sold=(now-datetime.timedelta(days=1+i%350)).isoformat(timespec='milliseconds').replace('+00:00','Z')
   sales.append((digest('fas-demo-sale:v1:'+owner+':'+str(lot)+':'+sold),owner,lot,'Fixture heavy history '+str(i),'cars','Cars','Fixture region',100000+i,sold,1,1,'auction','demo',at))
  db.executemany('INSERT INTO site_users VALUES(?,?,?)',users);db.executemany('INSERT INTO sale_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',sales);db.commit()
  return {'users':n,'sales':len(sales),'sparseOnline':len(range(0,n,100)),'heavyOwnerSales':10000}
 if command['op']=='stats':
  sizes={name:os.path.getsize(sys.argv[1]+suffix) if os.path.exists(sys.argv[1]+suffix) else 0 for name,suffix in [('databaseBytes',''),('walBytes','-wal'),('sharedMemoryBytes','-shm')]}
  return {'maxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,**sizes,'onDiskBytes':sum(sizes.values())}
 items=command['items'];write=any(not row['sql'].lstrip().upper().startswith(('SELECT','EXPLAIN')) for row in items);start=time.perf_counter();cpu=time.process_time();steps=0;results=[]
 def progress():
  nonlocal steps
  steps+=1000;return 0
 db.set_progress_handler(progress,1000)
 try:
  db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
  for row in items:
   before=db.total_changes;cursor=db.execute(row['sql'],row.get('values',[]));results.append({'results':[dict(item) for item in cursor.fetchall()] if cursor.description else [],'meta':{'changes':db.total_changes-before},'success':True})
  db.commit()
 except:
  db.rollback();raise
 finally:db.set_progress_handler(None,0)
 return {'results':results,'batchWallMs':(time.perf_counter()-start)*1000,'batchCpuMs':(time.process_time()-cpu)*1000,'approxVmSteps':steps}
for line in sys.stdin:
 try:
  message=json.loads(line);result=execute(message);print(json.dumps({'id':message['id'],'result':result}),flush=True)
 except Exception as error:print(json.dumps({'id':message.get('id'),'error':type(error).__name__+': '+str(error)}),flush=True)
`;
class Driver{
 constructor(file){this.child=cp.spawn('python3',['-u','-c',python,file,root],{stdio:['pipe','pipe','pipe']});this.next=0;this.pending=new Map();let buffer='',errors='';this.child.stdout.on('data',part=>{buffer+=part;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const value=JSON.parse(line),wait=this.pending.get(value.id);if(!wait)continue;this.pending.delete(value.id);value.error?wait.reject(Error(value.error)):wait.resolve(value.result)}});this.child.stderr.on('data',part=>errors+=part);this.child.on('error',error=>this.rejectAll(error));this.child.on('close',code=>{if(code)this.rejectAll(Error(errors||'SQLite driver closed: '+code))})}
 rejectAll(error){for(const pending of this.pending.values())pending.reject(error);this.pending.clear()}
 call(command){const id=++this.next;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.child.stdin.write(JSON.stringify({id,...command})+'\n')})}
 close(){this.child.stdin.end()}
}
function makeStorage(drivers){
 let next=0;
 const stats={statements:0,batches:0,batchWallMs:0,batchCpuMs:0,approxVmSteps:0},shapes=new Map();
 const db={stats,shapes,prepare(sql){return{sql,values:[],bind(...values){this.values=values;return this},async run(){return(await db.batch([this]))[0]},async first(){return(await db.batch([this]))[0].results[0]||null}}},async batch(items){
  for(const item of items){stats.statements++;if(!shapes.has(item.sql))shapes.set(item.sql,item.values)}stats.batches++;
  const result=await drivers[next++%drivers.length].call({op:'query',items});
  for(const key of ['batchWallMs','batchCpuMs','approxVmSteps'])stats[key]+=result[key];return result.results;
 }};return db;
}
const percent=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
async function benchmark(db,name,count,make,check,concurrency=CONCURRENCY){const before={...db.stats},times=[],statuses={},start=performance.now(),cpu=process.cpuUsage();let next=0;await Promise.all(Array.from({length:Math.min(count,concurrency)},async()=>{while(next<count){const i=next++,at=performance.now(),response=await make(i),body=await response.json();times.push(performance.now()-at);statuses[response.status]=(statuses[response.status]||0)+1;check(response,body,i)}}));times.sort((a,b)=>a-b);const delta=Object.fromEntries(Object.keys(before).map(key=>[key,Math.round((db.stats[key]-before[key])*1000)/1000])),nodeCpu=process.cpuUsage(cpu);return{name,requests:count,concurrency,statuses,elapsedMs:Math.round((performance.now()-start)*1000)/1000,requestMedianMs:percent(times,.5),requestP95Ms:percent(times,.95),nodeCpuMs:(nodeCpu.user+nodeCpu.system)/1000,db:delta}}
(async()=>{
 const workerSource=fs.readFileSync(path.join(root,'worker/index.js'),'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'))).default;
 const report={createdUtc:new Date().toISOString(),workerSha256:hash(workerSource),migrationHashes:Object.fromEntries(['0000_metrics.sql','0001_api_rate_limits.sql'].map(name=>[name,hash(fs.readFileSync(path.join(root,'drizzle',name)))])),environment:{node:process.version,platform:process.platform,arch:process.arch},method:'Actual unchanged Worker handlers and migrations, isolated Python sqlite3 databases with WAL, four persistent local SQLite connections and at most four concurrent Worker calls. Synthetic data never leaves local temporary storage. No HTTP network calls.',limitations:['10k/100k are seeded registered-account records, not simultaneous visitors or authenticated production accounts.','No common real auction, money, bank, delivery or server-account backend exists to certify at this audience.','Local Node/Python/SQLite timing is not Cloudflare D1 latency, capacity, RPS, mobile rendering or a DDoS test.','Persistent SQLite processes, WAL and OS caches differ from hosted D1. SQL CPU excludes Node but includes local SQLite work; batch wall includes locking.','No cold-disk claim: seeding warms caches. Cases are run serially; report p95 is a small bounded-sample descriptive statistic.','Node memory excludes Python processes; per-process SQLite peaks are reported separately, not summed into a claimed total. The seeding process peak includes fixture construction.','Approximate SQLite VM steps use a 1000-op progress callback: zero means below/coarser-than sampling resolution, not no database work.','Recorded database/WAL/SHM file sizes are one local snapshot; WAL checkpointing and connection lifecycle change disk usage.'],datasets:[]};
 const originalNow=Date.now;Date.now=()=>NOW;const drivers=[];
 try{
  for(const users of [10000,100000]){
   const file=path.join(temp,'accounts-'+users+'.sqlite'),pool=[new Driver(file)];drivers.push(...pool);const seedStart=performance.now(),seed=await pool[0].call({op:'seed',users,now:NOW});for(let i=1;i<4;i++){const driver=new Driver(file);pool.push(driver);drivers.push(driver)}
   const db=makeStorage(pool),results=[],request=(route,{owner=0,method='GET',origin='https://capacity.invalid',authenticated=true}={})=>new Request('https://capacity.invalid'+route,{method,headers:{...(authenticated?{'oai-authenticated-user-id':identity(owner)}:{}),Origin:origin,'Sec-Fetch-Site':origin==='https://capacity.invalid'?'same-origin':'cross-site'}}),call=(route,options)=>worker.fetch(request(route,options),{DB:db});
   const dataset={registeredAccounts:users,seed,seedElapsedMs:performance.now()-seedStart,results};
   results.push(await benchmark(db,'metrics sparse-online GET',24,()=>call('/api/metrics/visit'),(response,body)=>{assert.equal(response.status,200);assert.equal(body.totalUsers,users);assert.equal(body.onlineUsers,seed.sparseOnline)}));
   results.push(await benchmark(db,'sales small-owner page',16,()=>call('/api/analytics/sales?limit=20',{owner:users-1}),(response,body)=>{assert.equal(response.status,200);assert.equal(body.total,1);assert.equal(body.records.length,1);assert.equal(body.records[0].lotId,users)}));
   results.push(await benchmark(db,'sales max-owner-history page/offset',12,i=>call('/api/analytics/sales?limit=20&offset='+[0,20,9980][i%3]),(response,body)=>{assert.equal(response.status,200);assert.equal(body.total,10000);assert.equal(body.records.length,20);assert(body.records.every(row=>row.lotId===1||row.lotId>users));assert(body.records.every(row=>row.source==='demo'))}));
   results.push(await benchmark(db,'metrics existing-account POST',16,i=>call('/api/metrics/visit',{owner:i+1,method:'POST'}),(response,body)=>{assert.equal(response.status,200);assert.equal(body.totalUsers,users)}));
   await db.prepare('UPDATE site_users SET last_seen = ?').bind(new Date(NOW).toISOString()).run();
   results.push(await benchmark(db,'metrics all-accounts-online GET',24,()=>call('/api/metrics/visit'),(response,body)=>{assert.equal(response.status,200);assert.equal(body.totalUsers,users);assert.equal(body.onlineUsers,users)}));
   await db.prepare('INSERT INTO api_rate_limits(user_hash,scope,bucket_start,request_count) VALUES(?,?,?,?) ON CONFLICT(user_hash,scope) DO UPDATE SET request_count=excluded.request_count,bucket_start=excluded.bucket_start').bind(userHash(0),'sales-read',Math.floor(NOW/60000)*60000,60).run();
   results.push(await benchmark(db,'sales exhausted-quota denial',16,()=>call('/api/analytics/sales?limit=1'),(response,body)=>{assert.equal(response.status,429);assert.equal(body.error,'rate-limit');assert.equal(response.headers.get('Cache-Control'),'no-store, private');assert.equal(response.headers.get('Retry-After'),'60')}));
   assert.equal(results.at(-1).db.statements,16,'denials run only one quota statement each');
   results.push(await benchmark(db,'unauthenticated rejection',16,()=>call('/api/metrics/visit',{authenticated:false}),(response,body)=>{assert.equal(response.status,401);assert.equal(body.error,'authentication-required')}));assert.equal(results.at(-1).db.statements,0);
   results.push(await benchmark(db,'cross-origin rejection',16,()=>call('/api/analytics/sales',{origin:'https://foreign.invalid'}),(response,body)=>{assert.equal(response.status,403);assert.equal(body.error,'cross-origin')}));assert.equal(results.at(-1).db.statements,0);
   dataset.queryPlans=[];for(const [sql,values]of db.shapes){if(!/^(SELECT|DELETE)\b/.test(sql))continue;const plan=await pool[0].call({op:'query',items:[{sql:'EXPLAIN QUERY PLAN '+sql,values}]});dataset.queryPlans.push({sql,plan:plan.results[0].results.map(row=>row.detail)})}
   dataset.sqliteProcesses=await Promise.all(pool.map(driver=>driver.call({op:'stats'})));dataset.nodeMaxRssKiB=process.resourceUsage().maxRSS;dataset.nodeRssBytes=process.memoryUsage().rss;dataset.checksPassed=true;report.datasets.push(dataset);console.log(JSON.stringify({registeredAccounts:users,seed,results:results.map(item=>({name:item.name,statuses:item.statuses,dbCpuMs:item.db.batchCpuMs,vmSteps:item.db.approxVmSteps}))}));
   for(const driver of pool)driver.close();
  }
  report.workerSha256After=hash(fs.readFileSync(path.join(root,'worker/index.js')));report.sourceUnchanged=report.workerSha256After===report.workerSha256;assert(report.sourceUnchanged);report.success=true;fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:true,report:output,datasets:report.datasets.length}));
 }finally{Date.now=originalNow;for(const driver of drivers)driver.close();setTimeout(()=>fs.rmSync(temp,{recursive:true,force:true}),100)}
})().catch(error=>{console.error(error);process.exitCode=1});

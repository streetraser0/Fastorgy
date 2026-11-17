const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fas-security-metrics-')),inputFile=path.join(temporary,'query.json');
const baseline='SELECT COUNT(*) AS total_users, COALESCE(SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END), 0) AS online_users FROM site_users';
const runner=String.raw`import sqlite3,json,sys
input=json.load(open(sys.argv[2]))
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.executescript(open(sys.argv[1]).read())
counts=[]
for total in (1000,100000):
 db.execute('DELETE FROM site_users')
 db.executemany('INSERT INTO site_users(user_hash,first_seen,last_seen) VALUES(?,?,?)',((str(i),'2026-01-01T00:00:00.000Z',input['values'][0] if i==0 else '2026-11-14T11:59:00.000Z' if i<5 else '2026-01-01T00:00:00.000Z') for i in range(total)))
 for kind,sql in [('actual',input['sql']),('previous',input['baseline'])]:
  steps=[0]
  def progress():steps[0]+=1;return 0
  db.set_progress_handler(progress,1)
  result=dict(db.execute(sql,input['values']).fetchone())
  db.set_progress_handler(None,0)
  plan=[row['detail'] for row in db.execute('EXPLAIN QUERY PLAN '+sql,input['values'])]
  counts.append({'users':total,'kind':kind,'steps':steps[0],'result':result,'plan':plan})
print(json.dumps(counts))`;
(async()=>{
 const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 let measured=null,profileFailure=null;const db={prepare(sql){return{bind(...values){this.values=values;return this},async run(){assert(sql.startsWith('INSERT INTO api_rate_limits'));return {success:true,meta:{changes:1}}},async first(){let audit;fs.writeFileSync(inputFile,JSON.stringify({sql,values:this.values,baseline}));try{audit=JSON.parse(cp.execFileSync('python',['-c',runner,path.join(root,'drizzle/0000_metrics.sql'),inputFile],{stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:10000}));}catch(error){profileFailure=error;throw error}measured=audit;return audit.find(row=>row.kind==='actual'&&row.users===100000).result}}},batch(){throw Error('GET metrics should not mutate history')}};
 const now=Date.now;Date.now=()=>Date.parse('2026-11-14T12:00:00.000Z');let response;
 try{response=await worker.fetch(new Request('https://audit.example.test/api/metrics/visit',{headers:{'oai-authenticated-user-id':'local-resource-audit',Origin:'https://audit.example.test','Sec-Fetch-Site':'same-origin'}}),{DB:db})}finally{Date.now=now}
 if(profileFailure)throw Error('SQLite profile failed: '+(profileFailure.code||profileFailure.message));assert.equal(response.status,200);const body=await response.json();assert.equal(body.totalUsers,100000);assert.equal(body.onlineUsers,5,'five-minute window includes its exact boundary');
 assert(measured,'the real endpoint SQL was profiled');
 for(const users of [1000,100000]){
  const actual=measured.find(row=>row.users===users&&row.kind==='actual'),old=measured.find(row=>row.users===users&&row.kind==='previous');assert.deepEqual(actual.result,old.result,'resource protection preserves both counts');
  assert(actual.plan.some(detail=>/SEARCH site_users USING COVERING INDEX site_users_last_seen_idx/.test(detail)),'the active window uses the existing index');assert(actual.steps<1000,'inactive history must not force per-row processing');assert(old.steps>users*5,'counterfactual reproduces the global full-row aggregation');
 }
 const small=measured.find(row=>row.users===1000&&row.kind==='actual'),large=measured.find(row=>row.users===100000&&row.kind==='actual');assert(large.steps<=small.steps+10,'100x inactive history does not create 100x per-row VM work');
 console.log('PASS: authenticated metrics endpoint preserves exact counts without per-row aggregation of inactive history growing 100x; indexed window and former full-scan amplification verified locally.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));

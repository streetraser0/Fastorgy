const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fas-rate-test-')),database=path.join(temporary,'db.sqlite');
const hash=user=>createHash('sha256').update('fas-site-user:v1:'+user).digest('hex');
const runner=String.raw`import sqlite3,json,sys
db=sqlite3.connect(sys.argv[1],timeout=20);db.row_factory=sqlite3.Row
result=[]
try:
 db.execute('BEGIN IMMEDIATE')
 for item in json.load(open(sys.argv[2])):
  before=db.total_changes;cursor=db.execute(item['sql'],item.get('values',[]))
  result.append({'results':[dict(row) for row in cursor.fetchall()] if cursor.description else [],'meta':{'changes':db.total_changes-before}})
 db.commit()
except:
 db.rollback();raise
print(json.dumps(result))`;
const initialize=String.raw`import sqlite3,json,sys
db=sqlite3.connect(sys.argv[1])
for entry in json.load(open(sys.argv[2]+'/meta/_journal.json'))['entries']:db.executescript(open(sys.argv[2]+'/'+entry['tag']+'.sql').read())
db.commit()`;
function python(code,args){return new Promise((resolve,reject)=>{const child=cp.spawn('python',['-c',code,...args],{stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>error+=v);child.on('error',reject);child.on('close',status=>status===0?resolve(output):reject(Error(error.slice(-1000))))})}
let serial=0,statements=0;const executed=[];
const db={prepare(sql){return{sql,values:[],bind(...values){this.values=values;return this},async run(){return(await db.batch([this]))[0]},async first(){return(await db.batch([this]))[0].results[0]||null}}},async batch(items){statements+=items.length;executed.push(...items.map(item=>item.sql));const file=path.join(temporary,'query-'+serial+++'.json');fs.writeFileSync(file,JSON.stringify(items));try{return JSON.parse(await python(runner,[database,file]))}finally{fs.unlinkSync(file)}}};
(async()=>{
 await python(initialize,[database,path.join(root,'drizzle')]);
 const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const realNow=Date.now;let now=Date.parse('2026-11-14T13:00:30.000Z');Date.now=()=>now;
 const at=new Date(now-1000).toISOString(),bucket=()=>Math.floor(now/60000)*60000,user='rate-fixture-user';
 const request=(route,{method='GET',body,headers={},identity=user}={})=>new Request('https://rate.example.test'+route,{method,headers:{...(identity===null?{}:{'oai-authenticated-user-id':identity}),Origin:'https://rate.example.test','Sec-Fetch-Site':'same-origin',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 const call=(route,options,storage=db)=>worker.fetch(request(route,options),{DB:storage});
 const sale=id=>({lotId:id,name:'Controlled local demo',category:'cars',amount:1,soldAt:at});
 async function burst(count,make){const results=[];let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<count){const index=next++;results[index]=await make(index)}}));return results}
 const rateState=()=>db.prepare('SELECT user_hash,scope,bucket_start,request_count FROM api_rate_limits ORDER BY user_hash,scope').bind().first();
 try{
  for(const [route,options,status]of [
   ['/api/analytics/sales',{identity:null},401],['/api/analytics/sales',{headers:{Origin:'https://other.example','Sec-Fetch-Site':'same-site'}},403],
   ['/api/analytics/sales?limit=501',{},400],['/api/analytics/sales',{method:'POST',body:'x'.repeat(65537)},413],['/api/analytics/sales',{method:'POST',body:'{'},400],['/api/analytics/sales',{method:'POST',body:{records:Array.from({length:51},()=>sale(1))}},422]
  ]){const before=statements;assert.equal((await call(route,options)).status,status);assert.equal(statements,before,'cheap rejection does not touch storage')}
  assert.equal((await call('/api/metrics/visit')).status,200);assert.equal((await rateState()).request_count,1);
  for(const [scope,limit]of [['metrics',120],['sales-read',60],['sales-write',20]])await db.prepare('INSERT INTO api_rate_limits(user_hash,scope,bucket_start,request_count) VALUES(?,?,?,?) ON CONFLICT(user_hash,scope) DO UPDATE SET request_count=excluded.request_count,bucket_start=excluded.bucket_start').bind(hash(user),scope,bucket(),limit-5).run();
  const bodies=Array.from({length:50},(_,i)=>sale(100000+i));
  for(const [scope,route,options,limit,accepted]of [
   ['metrics','/api/metrics/visit',i=>({method:i%2?'POST':'GET'}),120,200],
   ['sales-read','/api/analytics/sales?limit=1',()=>({}),60,200],
   ['sales-write','/api/analytics/sales',()=>({method:'POST',body:{records:bodies}}),20,200]
  ]){
   const responses=await burst(12,i=>call(route,options(i)));assert.equal(responses.filter(r=>r.status===accepted).length,5,scope+' admits exactly five remaining slots across concurrent connections');assert.equal(responses.filter(r=>r.status===429).length,7);
   for(const response of responses.filter(r=>r.status===429)){assert.equal(response.headers.get('Retry-After'),'30');assert.equal(response.headers.get('Cache-Control'),'no-store, private');assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);const body=await response.json();assert.equal(body.error,'rate-limit');assert(!JSON.stringify(body).includes(user)&&!JSON.stringify(body).includes(hash(user)))}
   const row=await db.prepare('SELECT request_count FROM api_rate_limits WHERE user_hash=? AND scope=?').bind(hash(user),scope).first();assert.equal(row.request_count,limit);
  }
  const before=statements,index=executed.length;const rejected=await burst(12,i=>call('/api/analytics/sales',{method:'POST',body:{records:bodies.map((row,n)=>({...row,lotId:200000+i*50+n}))}}));assert(rejected.every(r=>r.status===429));assert.equal(statements-before,12,'denied writes execute one constant-cost quota statement each');assert(executed.slice(index).every(sql=>sql.startsWith('INSERT INTO api_rate_limits')),'blocked traffic never reaches sale reads, retention or insert fanout');
  assert.equal((await call('/api/metrics/visit',{identity:'another-user'})).status,200,'budgets are isolated between authenticated principals');
  assert.equal((await call('/api/analytics/sales?category=phones&limit=1',{headers:{'x-user-id':'another-user','x-forwarded-for':'different'}})).status,429,'untrusted headers and filters cannot create a new quota key');
  const count=async()=>Number((await db.prepare('SELECT COUNT(*) AS count FROM api_rate_limits').bind().first()).count);assert.equal(await count(),4,'three constant scopes per principal, not one row per request or filter');
  now+=60000;assert.equal((await call('/api/metrics/visit',{method:'POST'})).status,200);assert.equal((await call('/api/analytics/sales')).status,200);assert.equal((await call('/api/analytics/sales',{method:'POST',body:{records:[sale(300000)]}})).status,200);assert.equal(await count(),4,'a new window reuses the same rows');
  now-=60000;assert.equal((await call('/api/metrics/visit')).status,429,'a backwards clock cannot reopen a previous bucket');
  for(const broken of [{prepare(){return{bind(){return this},async run(){return {success:false,meta:{changes:1}}}}},batch(){}},{prepare(){throw Error('private SQL/provider fixture')},batch(){}},{prepare(){return{bind(){return this},async run(){return {success:true}}}},batch(){}}]){const response=await call('/api/metrics/visit',{},broken);assert.equal(response.status,503,'failed or unconfirmed storage never grants access');assert(!JSON.stringify(await response.json()).includes('private SQL'))}
 }finally{Date.now=realNow}
 console.log('PASS: persistent atomic D1 quotas under real concurrent SQLite connections, 429/private/retry headers, one cheap denial operation, principal/scope isolation, bounded state/windows, validation-before-storage and fail-closed errors.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));

const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(require('path').join(__dirname,'../dist/sw.js'),'utf8');
function setup(){
 const listeners={},stores=new Map(),deleted=[],puts=[];let requests=[];
 const s={console,URL,Request,Response,Map,Promise,fetch:async req=>{requests.push(req);return new Response('ok',{headers:{'content-type':'application/javascript'}})},self:{location:{origin:'https://fas.example'},registration:{scope:'https://fas.example/'},clients:{claim:async()=>{s.claimed=true}},addEventListener:(name,fn)=>listeners[name]=fn},caches:{keys:async()=>[...stores.keys()],delete:async key=>{deleted.push(key);return stores.delete(key)},open:async key=>{if(s.openError)throw Error('Cache disabled');if(!stores.has(key))stores.set(key,new Map());const map=stores.get(key);return{put:async(req,res)=>{if(s.putError)throw Error('Quota exceeded');puts.push([key,req.url]);map.set(req.url,res.clone())},match:async req=>map.get(req.url)?.clone()}}}};
 vm.createContext(s);vm.runInContext(code,s);return{...s,s,listeners,stores,deleted,puts,requests};
}
async function dispatch(env,path,options={}){let promise;const event={request:{url:new URL(path,'https://fas.example/').href,method:options.method||'GET',mode:options.mode||'cors'},respondWith:v=>promise=v};env.listeners.fetch(event);return promise===undefined?undefined:await promise;}
function response(body,type,more={}){const res=new Response(body,{status:more.status||200,headers:{'Content-Type':type,...more.headers}});if(more.redirected)Object.defineProperty(res,'redirected',{value:true});return res;}
(async()=>{
 let e=setup(),nav=response('private account','text/html');e.s.fetch=async()=>nav;assert.equal(await dispatch(e,'/',{mode:'navigate'}),nav);assert.equal(e.puts.length,0);
 for(const status of [401,403,302]){const res=response('auth','text/html',{status});e.s.fetch=async()=>res;assert.equal(await dispatch(e,'/',{mode:'navigate'}),res)}
 e.s.fetch=async()=>{throw Error('offline')};const offline=await dispatch(e,'/',{mode:'navigate'});assert.equal(offline.status,503);assert.equal(offline.headers.get('cache-control'),'no-store');assert.match(await offline.text(),/Нет подключения/);assert.equal(e.puts.length,0);
 for(const [path,options] of [['/api/lots',{}],['/auth/login',{}],['/login',{}],['/payments',{}],['/pwa.js?token=x',{}],['/pwa.js?code=x',{}],['/pwa.js?access_token=x',{}],['https://other.example/pwa.js',{}],['/pwa.js',{method:'POST'}],['/unknown.js',{}],['/pwa.js?tracking=x',{}]])assert.equal(await dispatch(e,path,options),undefined,path);
 e=setup();e.s.fetch=async()=>response('JS','application/javascript');assert.equal(await(await dispatch(e,'/pwa.js')).text(),'JS');assert.equal(e.puts.length,1);e.s.fetch=async()=>{throw Error('offline')};assert.equal(await(await dispatch(e,'/pwa.js')).text(),'JS');
 for(const res of [response('private html','text/html'),response('private','application/javascript',{headers:{'cache-control':'private'}}),response('no store','application/javascript',{headers:{'cache-control':'no-store'}}),response('redirect','application/javascript',{redirected:true}),response('bad','application/javascript',{status:403})]){e=setup();e.s.fetch=async()=>res;assert.equal(await dispatch(e,'/pwa.js'),res);assert.equal(e.puts.length,0)}
 e=setup();e.stores.set('other-cache',new Map([['https://fas.example/pwa.js',response('SECRET OTHER CACHE','application/javascript')]]));e.s.fetch=async()=>{throw Error('offline')};assert.equal((await dispatch(e,'/pwa.js')).type,'error');
 e=setup();e.stores.set('fas-static-old',new Map());e.stores.set('unrelated',new Map());let activation;e.listeners.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(e.deleted,['fas-static-old']);assert.equal(e.s.claimed,true);
 e=setup();let install;e.listeners.install({waitUntil:p=>install=p});await install;
 const declared=Array.from(vm.runInContext('[...STATIC_TYPES.keys()]',e.s));
 assert.equal(new Set(declared).size,declared.length,'static manifest has no duplicate paths');assert.equal(e.requests.length,0,'installation does not duplicate all page assets or compete with the lot photos');assert.equal(e.puts.length,0,'the static cache is populated only by used, cacheable responses');
 for(const resource of declared){assert(fs.existsSync(require('path').join(__dirname,'../dist',resource)),resource+' is packaged');assert(!/(?:^|\/)(?:api|auth|oauth|login|payments?)(?:\/|$)/i.test(resource),'only static public assets are declared')}
 for(const resource of ['property-map.js','property-map.css','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css'])assert(declared.includes(resource),resource+' is available through the typed static cache');

 e=setup();e.s.fetch=async()=>response('{"version":1}','application/json');assert.equal(await (await dispatch(e,'/data/car-catalog.json')).text(),'{"version":1}');assert.equal(e.puts.length,1,'requested catalogue may enter the typed static cache');
 console.log('PASS: private navigations, auth/errors/offline, request exclusions, typed allowlist, current-cache-only fallback, activation isolation and demand-only installation.');
 const failures=[];
 for(const key of ['putError','openError']){e=setup();e.s[key]=true;const good=response('NETWORK RESPONSE','application/javascript');e.s.fetch=async()=>good;try{assert.equal(await dispatch(e,'/pwa.js'),good)}catch(error){failures.push(key+': '+error.message.split('\n')[0])}}
 if(failures.length)throw Error('Successful network response lost when cache fails: '+failures.join('; '));
 for(const key of ['putError','openError']){e=setup();e.s[key]=true;let installation;e.listeners.install({waitUntil:p=>installation=p});await installation;e.s.fetch=async()=>{throw Error('offline')};assert.equal((await dispatch(e,'/pwa.js')).type,'error')}
 console.log('PASS: Cache Storage failure never blocks successful network responses.');
})().catch(err=>{console.error(err);process.exitCode=1});

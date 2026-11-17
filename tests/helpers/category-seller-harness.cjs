const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
const compiledScripts = new Map();
// Reuse compiled code only. Every boot still receives a new VM context and storage.
function runCachedScript(file, context, inlineMain = false) {
 const source = fs.readFileSync(path.join(root, 'dist', file), 'utf8');
 const code = inlineMain ? source.match(/<script>([\s\S]*?)<\/script>/)[1] : source;
 const key = file + (inlineMain ? ':inline-main' : '');
 let cached = compiledScripts.get(key);
 if (!cached || cached.code !== code) {
  cached = { code, script: new vm.Script(code, { filename: key }) };
  compiledScripts.set(key, cached);
 }
 return cached.script.runInContext(context);
}
const raw={category:'cars',name:'Частная Toyota Camry',description:'Автомобиль в хорошем состоянии. Собственник, обслуживание по регламенту.',condition:'used',regionCode:'36',city:'Воронеж',startPrice:'1000000',stepMode:'fixed',stepValue:'10000',durationMinutes:60,durationValue:'1',durationUnit:'hours',startMode:'now',startsAt:'',pickup:true,delivery:false,antiSniping:true,antiSnipingWindowMinutes:'2',antiSnipingExtensionMinutes:'2',ownershipConsent:true,deposit:'0',latitude:'',longitude:''};
function boot(options={}){
 const nodes=new Map(),events={},windowEvents={},writes=[],records={...(options.records||{})},forms={};let currentRaw={...raw},failLots=!!options.failLots,mediaFail=false;
 const workspace={version:1,profile:{id:'seller-owner',displayName:'Частный Продавец',phone:'+79991234567',email:'',regionCode:'36',city:'Воронеж',showPhone:false},drafts:[{id:'draft-initial',ownerId:'seller-owner',data:{...raw},mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],updatedAt:new Date().toISOString()}]};
 if(options.profileEmpty)workspace.profile.displayName='';if(options.noMedia)workspace.drafts[0].mediaRefs=[];
 if(!('fas-seller-workspace-v1' in records))records['fas-seller-workspace-v1']=JSON.stringify(workspace);
 function node(selector){if(!nodes.has(selector)){const classes=new Set(),label={hidden:false};const n={selector,value:'',textContent:'',innerHTML:'',hidden:false,style:{setProperty(k,v){this[k]=v}},clientHeight:700,scrollTop:0,dataset:{},classList:{add(...v){v.forEach(x=>classes.add(x))},remove(...v){v.forEach(x=>classes.delete(x))},contains:v=>classes.has(v),toggle(v,on){if(on)classes.add(v);else classes.delete(v)}},elements:{namedItem(name){return {checked:!!currentRaw[name],value:currentRaw[name]??'',closest:()=>label}}},addEventListener(name,fn){(this.events??={})[name]=fn},removeEventListener(){},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},querySelectorAll(sel){if(sel==='.card')return [...this.innerHTML.matchAll(/<article class="card" data-lot="(\d+)"/g)].map(m=>({dataset:{lot:m[1]},querySelectorAll(){return[]}}));return[]},scrollTo(o){if(o.top!==undefined)this.scrollTop=o.top},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false},closest(){return label}};nodes.set(selector,n)}return nodes.get(selector)}
 const document={body:node('body'),documentElement:node('html'),hidden:false,querySelector:node,getElementById:id=>node('#'+id),querySelectorAll(){return[]},addEventListener(name,fn){(events[name]??=[]).push(fn)},createElement:()=>node('created-'+nodes.size)};
 const context={console,Date,JSON,Number,String,Math,Array,Set,Map,Blob,URL,Object,Promise,Intl,document,navigator:{},location:{search:''},URLSearchParams,crypto:{randomUUID:()=>String(nodes.size)+'-unique-test-id'},localStorage:{getItem:key=>records[key]??null,setItem(key,value){if(failLots&&key==='fas-lots')throw Error('quota');records[key]=value;writes.push(key)}},window:{document,crypto:{randomUUID:()=>String(nodes.size)+'-unique-test-id'},addEventListener(name,fn){(windowEvents[name]??=[]).push(fn)},matchMedia(){return{matches:false,addEventListener(){}}}},setInterval(){},setTimeout(){return 1},clearTimeout(){},FormData:function(form){return Object.entries(form.selector==='#seller-profile-form'?workspace.profile:currentRaw)}};
 context.window.navigator=context.navigator;context.window.window=context.window;
 vm.createContext(context);
 for(const file of ['user-agreement.js','ui-icons.js','category-tree.js','demo-profiles.js','geo-data.js','catalog-data.js','region-select.js','search-data.js','search-typos.js','search-identifiers.js','search-intent.js','keyword-search.js','seller-rules.js','listing-quotas.js','countdown.js','auction-renewal.js','lot-location.js'])runCachedScript(file, context);
 // The default fixture is an explicitly registered existing test account.
 // New/legacy consent tests opt out; production never migrates consent this way.
 if(!('fas-seller-workspace-v1' in (options.records||{}))&&!options.profileEmpty&&options.profileAccepted!==false){workspace.profile.agreementAcceptance={version:context.window.FasUserAgreement.version,acceptedAt:'2026-11-14T00:00:00.000Z'};records['fas-seller-workspace-v1']=JSON.stringify(workspace)}
 context.window.FasSellerMedia={serializeLot:lot=>lot,async getMedia(refs){if(mediaFail)throw Error('IDB disabled');return(refs||[]).map(ref=>({ref:ref.id,url:'blob:trusted-'+ref.id,type:ref.kind==='video'?'video':'image',label:'Фото'}))},async hydrateLots(cars){if(options.failHydrate)throw Error('IDB hydration failed');return cars},async deleteMedia(){return {deleted:[],kept:[]}},isSafeObjectUrl:url=>url.startsWith('blob:trusted-')};
 // Functional marketplace models use three explicit fixtures. Avoid generating a
 // 52k unrelated demo catalogue only to discard it after boot; production code
 // and the default full-catalogue test path remain unchanged.
 if (options.fixtureInventory !== undefined) {
  assert(Array.isArray(options.fixtureInventory), 'fixtureInventory must be an array');
  const snapshot = JSON.stringify(options.fixtureInventory);
  vm.runInContext('seedDemoLots = (() => { const snapshot = ' + JSON.stringify(snapshot) + '; return () => JSON.parse(snapshot); })()', context);
 }
 runCachedScript('index.html', context, true);
 runCachedScript('seller-ui.js', context);
 const run=source=>vm.runInContext(source,context);
 return {context,node,run,records,writes,workspace,dispatchWindow(name,event){for(const listener of windowEvents[name]||[])listener(event)},dispatchClick(event){for(const listener of events.click||[])listener(event)},setRaw(v){currentRaw={...v}},setFailLots(v){failLots=v},setMediaFail(v){mediaFail=v},async publish(){await node('#seller-listing-form').onsubmit({preventDefault(){}})},async click(dataset){const target={dataset,closest:()=>target,matches(selectors){return selectors.split(',').some(selector=>{const m=selector.match(/^\[data-([^\]]+)\]$/);if(!m)return false;const key=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return Object.hasOwn(dataset,key)})}};await events.click.at(-1)({target,preventDefault(){}})}};
}

// Positive account fixtures explicitly accept the actual current edition.
// This helper is never called by boot() for supplied legacy/new-account records.
function acceptedAgreementForFixture(){const context=vm.createContext({window:{},Date});runCachedScript('user-agreement.js',context);return JSON.parse(JSON.stringify(context.window.FasUserAgreement.capture({checked:true})))}
module.exports={boot,raw,runCachedScript,acceptedAgreementForFixture};

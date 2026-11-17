const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lifecycle=fs.readFileSync('dist/dialog-lifecycle.js','utf8');
function fixture({observe=true,alreadyOpen=false}={}){
 const nodes=[],observers=[],listeners=new Map(),calls=[];
 function queue(record){for(const observer of observers)observer.records.push(record)}
 class Dialog{
  constructor(id){this.id=id;this.tagName='DIALOG';this.open=false;this.isConnected=true;this.classes=new Set();this.classList={contains:value=>this.classes.has(value)};nodes.push(this)}
  showModal(){const previous=this.open;this.open=true;queue({type:'attributes',attributeName:'open',oldValue:previous?'':null,target:this})}
  close(){if(!this.open)return;this.open=false;calls.push(['closed',this.id]);queue({type:'attributes',attributeName:'open',oldValue:'',target:this})}
  querySelector(selector){return this.id==='category-picker'&&selector==='[data-category-back]'?{disabled:false,click:()=>this.close()}:null}
  querySelectorAll(selector){return selector.includes('[data-dialog-swipe-header]')?[{hidden:false,hasAttribute:()=>true,closest:()=>null}]:[]}
 }
 class Observer{
  constructor(callback){this.callback=callback;this.records=[];observers.push(this)}
  observe(target,options){this.target=target;this.options=options}
  takeRecords(){return this.records.splice(0)}
  disconnect(){this.disconnected=true}
 }
 const document={documentElement:{classList:{add(){}}},querySelectorAll:selector=>selector==='dialog[open]'?nodes.filter(node=>node.open&&node.isConnected):[],addEventListener(type,callback,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({callback,options})},removeEventListener(){}};
 const context={document,console,URL,navigator:{geolocation:{}},HTMLDialogElement:Dialog,addEventListener(){},removeEventListener(){}};context.window=context;if(observe)context.MutationObserver=Observer;
 const modal=new Dialog('modal'),category=new Dialog('category-picker'),map=new Dialog('property-map-dialog'),photo=new Dialog('lot-photo-viewer');
 if(alreadyOpen){category.open=true;map.open=true}
 const originalShow=Dialog.prototype.showModal,originalClose=Dialog.prototype.close;vm.createContext(context);vm.runInContext(lifecycle,context);
 assert.strictEqual(Dialog.prototype.showModal,originalShow);assert.strictEqual(Dialog.prototype.close,originalClose,'lifecycle does not patch native dialog methods');
 function closeEvent(target){let stopped=false;for(const {callback}of listeners.get('close')||[]){callback({target,stopImmediatePropagation(){stopped=true}});if(stopped)break}return stopped}
 return {context,document,nodes,observers,listeners,calls,modal,category,map,photo,api:context.FasDialogLifecycle,closeEvent,deliver(){for(const observer of observers){const records=observer.takeRecords();if(records.length)observer.callback(records)}}};
}
{
 const h=fixture();assert.equal(h.api.version,2);assert.equal(h.api.top(),null);const options=h.observers[0].options;assert.equal(options.attributeOldValue,true);assert.equal(options.subtree,true);assert.deepEqual(Array.from(options.attributeFilter),['open']);
 h.modal.showModal();h.map.showModal();h.category.showModal();assert.equal(h.api.top(),h.category,'an older DOM dialog opened over a newer map is top immediately, before observer delivery');assert.equal(h.map.open,true);
 h.category.close();assert.equal(h.api.top(),h.map);h.photo.showModal();h.category.showModal();assert.equal(h.api.top(),h.category,'actual opening order also beats a later-created photo dialog');h.category.close();assert.equal(h.api.top(),h.photo);h.photo.close();assert.equal(h.api.top(),h.map);
 h.category.showModal();h.deliver();assert.equal(h.api.top(),h.category,'observer delivery and synchronous takeRecords agree');
 // Multiple transitions for one target within one observer batch must use
 // intermediate attribute values instead of each target's final .open flag.
 h.category.close();h.photo.showModal();h.category.showModal();assert.equal(h.api.top(),h.category);assert.equal(h.closeEvent(h.category),true,'queued close cannot clean up the reopened top session');assert.equal(h.api.top(),h.category);
 h.category.close();assert.equal(h.closeEvent(h.category),false);assert.equal(h.api.top(),h.photo);
 h.photo.isConnected=false;assert.equal(h.api.top(),h.map,'disconnected dialogs are pruned even without a close event');h.map.close();assert.equal(h.api.top(),h.modal);h.modal.close();assert.equal(h.api.top(),null);
}
{
 const h=fixture();h.map.showModal();h.category.showModal();h.api.top();h.observers[0].records.push({type:'attributes',attributeName:'open',oldValue:'',target:h.map});assert.equal(h.api.top(),h.category,'resetting an already-present open attribute does not reopen or reorder it');
 h.map.close();h.map.showModal();assert.equal(h.api.top(),h.map);h.category.close();h.category.showModal();assert.equal(h.api.top(),h.category,'close/reopen order remains correct across successive batches');
}
{
 const h=fixture({alreadyOpen:true});assert.equal(h.api.top(),h.map,'existing open dialogs without observed transitions use document-order fallback');
 const fallback=fixture({observe:false});fallback.map.showModal();fallback.category.showModal();assert.equal(fallback.api.top(),fallback.map,'no-observer environments retain the established DOM-order fallback');fallback.map.close();assert.equal(fallback.api.top(),fallback.category);
}
{
 // Run the actual swipe route and Android bridge against the tracked stack.
 const h=fixture(),c=h.context,nativeListeners={};Object.assign(c,{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},App:{addListener:(type,callback)=>nativeListeners[type]=callback,minimizeApp:()=>Promise.resolve()},Browser:{open:()=>Promise.resolve()},Geolocation:{requestPermissions:async()=>({}),getCurrentPosition:async()=>({})},Share:{share:async()=>({})},StatusBar:{setStyle:()=>Promise.resolve(),setOverlaysWebView:()=>Promise.resolve(),setBackgroundColor:()=>Promise.resolve()},Style:{Dark:'dark'},location:{origin:'https://localhost'},history:{back(){throw Error('A nested dialog must not navigate browser history')}}});
 vm.runInContext(fs.readFileSync('dist/back-swipe.js','utf8'),c);vm.runInContext(fs.readFileSync('mobile/scripts/native-bridge.js','utf8').replace(/^import .*;\n/gm,''),c);
 h.modal.classes.add('seller-dialog');let sellerCalls=0;c.FasSellerUI={back(){sellerCalls++;return false}};
 h.modal.showModal();h.map.showModal();h.category.showModal();nativeListeners.backButton({canGoBack:true});assert.equal(h.category.open,false);assert.equal(h.map.open,true);assert.equal(h.modal.open,true);assert.equal(sellerCalls,0,'native Back must not reach an underlying seller form');
 h.category.showModal();h.photo.showModal();nativeListeners.backButton({canGoBack:true});assert.equal(h.photo.open,false);assert.equal(h.category.open,true);assert.equal(h.map.open,true,'photo closes without discarding its parent map');nativeListeners.backButton({canGoBack:true});assert.equal(h.category.open,false);assert.equal(h.map.open,true);
 nativeListeners.backButton({canGoBack:true});assert.equal(h.map.open,false);assert.equal(h.modal.open,true);nativeListeners.backButton({canGoBack:true});assert.equal(sellerCalls,1);assert.equal(h.modal.open,true,'seller refusal still protects the dirty form');
}
{
 const {boot}=require('./helpers/category-seller-harness.cjs'),h=boot();h.run('window.FasSellerUI.openEditor("draft-initial")');const before=h.node('#modal-content').innerHTML;h.context.window.FasDialogLifecycle={top:()=>({id:'category-picker',open:true})};assert.equal(h.run('window.FasSellerUI.back()'),false);assert.equal(h.node('#modal-content').innerHTML,before,'seller safe Back respects the central top layer, even when its own DOM-order fallback is empty');
}
console.log('PASS: real dialog opening order across map/category/photo, synchronous pending mutations, batched close/reopen, stale-close isolation, disconnect/fallback/no prototype patch, actual native hierarchical Back and seller top-layer protection.');

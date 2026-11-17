const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {integration,settle}=require('./helpers/category-multi-harness.cjs');
const read=name=>fs.readFileSync('dist/'+name,'utf8'),A=999892001,B=A+12;
const base={category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',bank:'Публичный продавец',sellerName:'Публичный продавец',sellerType:'private',sellerOwnerId:'public-owner',demo:true,privateSellerDemo:true,status:'live',startsAt:new Date(Date.now()-3600000).toISOString(),ends:new Date(Date.now()+6*3600000).toISOString(),durationMinutes:420,price:100000,start:100000,startPrice:100000,step:1000,stepValue:1000,stepMode:'fixed',deposit:0,bids:0,city:'Воронеж',regionCode:'36',latitude:51.66,longitude:39.2,media:[{url:'https://example.org/car.jpg',type:'image'}]};
const fixtures=Array.from({length:15},(_,i)=>({...base,id:A+i,name:'Toyota RAV4 '+i}));

async function setup(){
 const h=integration({fixtures,strictSelect:true}),f=h.field,c=h.context;f('modal').appendChild(f('modal-content'));
 // Model native top-layer order, including the fact that showModal() on an
 // already-open dialog does not promote it above a more recent modal.
 const layers=[],wrap=dialog=>{const show=dialog.showModal.bind(dialog),close=dialog.close.bind(dialog);dialog.showModal=()=>{const wasOpen=dialog.open;show();if(!wasOpen)layers.push(dialog)};dialog.close=()=>{const i=layers.lastIndexOf(dialog);if(i>=0)layers.splice(i,1);close()};return dialog};
 h.document.querySelectorAll('dialog').forEach(wrap);const create=h.document.createElement.bind(h.document);h.document.createElement=tag=>{const node=create(tag);return String(tag).toLowerCase()==='dialog'?wrap(node):node};
 c.window.FasDialogLifecycle={top:()=>layers.filter(dialog=>dialog.open).at(-1)||null};
 const holder=h.document.createElement('div');holder.innerHTML=read('index.html').match(/<button class="close"[\s\S]*?<\/button>/)[0];const close=holder.firstChild;close.onclick=h.node('.close').onclick;f('modal').appendChild(close);
 for(const[type,handler]of Object.entries(h.node('#modal').events||{}))f('modal').addEventListener(type,handler);
 const frames=[];c.window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
 const flush=()=>{for(let i=0;i<10&&frames.length;i++)frames.splice(0).forEach(callback=>callback())};
 h.run('openCar('+A+')');f('bid').value='125000';f('modal').scrollTop=430;
 vm.runInContext(read('quickbar.js'),c);flush();
 vm.runInContext(read('back-swipe.js'),c);vm.runInContext(read('seller-storefront.js'),c);
 const api=c.window.FasSellerStorefront,dialog=f('seller-storefront-dialog'),originalInput=f('bid'),originalForm=f('bid-form');
 let mapCalls=0;const map=c.window.FasPropertyMap;c.window.FasPropertyMap={...map,returnFromLot(){mapCalls++;return map.returnFromLot()}};
 const show=()=>{
  assert.equal(api.open(A),true);
  // Keyboard activation is deliberate and must not model a ghost click left
  // over from the immediately preceding synthetic swipe in this tight loop.
  dialog.dispatchEvent({type:'click',detail:0,target:dialog.querySelector('[data-storefront-page="1"]'),preventDefault(){}});
  assert.equal(api.state().page,1);dialog.scrollTop=480;
  const state=JSON.parse(JSON.stringify(api.state()));assert(state.visibleIds.includes(B));
  assert.equal(api.openLot(B),true);h.dispatchWindow('resize',{});flush();assert.equal(Number(f('modal-content').querySelector('[data-open-lot-id]').dataset.openLotId),B);return state;
 };
 const restored=before=>{
  assert.equal(dialog.open,true);const after=api.state();for(const key of ['lotId','tab','page','visibleIds'])assert.deepEqual(JSON.parse(JSON.stringify(after[key])),before[key],key+' survives seller → lot → seller');
  assert.equal(dialog.scrollTop,480);assert.equal(f('bid'),originalInput);assert.equal(f('bid-form'),originalForm);assert.equal(f('bid').value,'125000');assert.equal(Number(f('bid').min),151000,'return preserves typed input while refreshing its canonical minimum');assert.equal(f('modal').scrollTop,430);assert.equal(mapCalls,0,'seller return short-circuits the older map return hook');
  api.close();assert.equal(f('modal').open,true);assert.equal(f('bid'),originalInput);assert.equal(f('bid-form'),originalForm);assert.equal(f('bid').value,'125000');assert.equal(f('modal').scrollTop,430);
 };
 return {...h,f,c,api,dialog,close,show,restored,flush,originalInput,originalForm,get mapCalls(){return mapCalls}};
}

function nativeBack(h,{helper=true}={}){
 const listeners={},c=h.c;
 c.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};c.App={addListener:(type,fn)=>listeners[type]=fn,minimizeApp:()=>Promise.resolve()};c.Browser={open:()=>Promise.resolve()};c.Geolocation={};c.Share={share:()=>Promise.resolve()};c.StatusBar={setStyle:()=>Promise.resolve(),setOverlaysWebView:()=>Promise.resolve(),setBackgroundColor:()=>Promise.resolve()};c.Style={Dark:'dark'};
 vm.runInContext(fs.readFileSync('mobile/scripts/native-bridge.js','utf8').replace(/^import .*;\n/gm,''),c);
 const existing=c.window.FasBackSwipe;if(!helper)c.window.FasBackSwipe=undefined;
 listeners.backButton({canGoBack:true});c.window.FasBackSwipe=existing;
}

function swipe(h,target,dx,dy){
 const emit=(type,x,y,at)=>{const touch={identifier:8,clientX:180+x,clientY:260+y};h.f('modal').dispatchEvent({type,target,cancelable:true,timeStamp:at,touches:type==='touchend'?[]:[touch],changedTouches:[touch],preventDefault(){},stopPropagation(){}})};
 emit('touchstart',0,0,0);emit('touchmove',dx,dy,100);emit('touchend',dx,dy,200);
}

(async()=>{
 const h=await setup();
 let before=h.show();assert.equal(h.run('window.FasApplyAuctionUpdate({lotId:'+A+',price:150000,actorOwn:false,occurredAt:new Date().toISOString()}).ok'),true);h.close.onclick();await settle(h);h.restored(before);
 before=h.show();h.click(h.f('modal-content').querySelector('[data-close-lot]'));await settle(h);h.restored(before);
 before=h.show();let prevented=false;h.f('modal').dispatchEvent({type:'cancel',target:h.f('modal'),preventDefault(){prevented=true}});assert(prevented,'Escape prevents the browser from also closing the restored original lot');await settle(h);h.restored(before);
 before=h.show();assert.equal(h.c.window.FasBackSwipe.back(),true);await settle(h);h.restored(before);
 before=h.show();h.click(h.f('modal-content').querySelector('[data-quick="back"]'));await settle(h);h.restored(before);
 before=h.show();nativeBack(h);await settle(h);h.restored(before);
 before=h.show();nativeBack(h,{helper:false});await settle(h);h.restored(before);
 // The modern recognizer and the legacy fallback must both use the same route.
 vm.runInContext(read('lot-close-gesture.js'),h.c);
 for(const [dx,dy]of [[120,0],[-120,0],[0,120],[0,-120]]){
  before=h.show();const button=h.f('modal-content').querySelector('.lot-quick-access').querySelector('[data-quick="bid"]');swipe(h,button,dx,dy);await settle(h);h.restored(before);
 }
 before=h.show();const photo=h.f('modal-content').querySelector('.gallery-track').querySelector('img');swipe(h,photo,-120,0);assert.equal(h.dialog.open,false,'horizontal photo browsing does not return from the lot');assert.equal(Number(h.f('modal-content').querySelector('[data-open-lot-id]').dataset.openLotId),B);
 const overlay=h.document.createElement('dialog');overlay.id='copy-overlay';h.document.body.appendChild(overlay);overlay.showModal();assert.equal(h.api.returnFromLot(),false);assert.equal(h.c.window.FasBackSwipe.back(),true);assert.equal(overlay.open,false);assert.equal(h.dialog.open,false,'closing a copy/photo overlay does not reopen the seller profile');assert.equal(h.api.returnFromLot(),true);h.restored(before);
 const legacy=await setup();before=legacy.show();assert.equal(legacy.run('window.FasApplyAuctionUpdate({lotId:'+A+',price:150000,actorOwn:false,occurredAt:new Date().toISOString()}).ok'),true);legacy.f('modal').scrollTop=0;const header=legacy.f('modal-content').querySelector('.lot-quick-access');swipe(legacy,header,0,-120);await settle(legacy);legacy.restored(before);
 // A map already above A must be suspended through its own route, so opening
 // B re-enters the native top layer instead of changing a dialog behind it.
 const mapped=await setup(),maps=[];let activeMap;
 const layer=()=>({on(){return this},addTo(){return this},bindTooltip(){return this},bindPopup(){return this},clearLayers(){}});
 mapped.c.window.L={map(){const map={handlers:{},center:{lat:51.66,lng:39.2},zoom:5,on(type,fn){this.handlers[type]=fn;return this},setView(value,zoom){this.center=Array.isArray(value)?{lat:value[0],lng:value[1]}:value;this.zoom=zoom;return this},getCenter(){return this.center},getZoom(){return this.zoom},removeLayer(){},remove(){this.removed=true},fitBounds(){},invalidateSize(){}};maps.push(map);activeMap=map;return map},layerGroup:layer,circleMarker:layer,marker:layer,divIcon:v=>v,tileLayer:layer,popup(){return{setLatLng(){return this},setContent(){return this},openOn(){return this}}},latLngBounds:v=>v};
 const map=mapped.c.window.FasPropertyMap;map.configure({getLots:()=>Array.from(mapped.run('visibleLots')),getAllLots:()=>Array.from(mapped.run('cars')),getOrigin:()=>({point:[51.66,39.2],approximate:false})});
 map.open();await settle(mapped);mapped.f('property-map-query').value='Toyota';mapped.f('property-map-query').oninput();mapped.f('property-map-radius').value='30';mapped.f('property-map-radius').onchange();map.setOrigin([51.66,39.2],'Моя точка',false);await settle(mapped);mapped.f('property-map-dialog').scrollTop=380;activeMap.setView([51.68,39.24],12);
 const mapBefore=JSON.parse(JSON.stringify(map.state()));before=mapped.show();assert.equal(mapped.f('property-map-dialog').open,false,'the pre-existing map is suspended while its child lot is above it');
 mapped.run('window.FasApplyAuctionUpdate({lotId:'+A+',price:150000,actorOwn:false,occurredAt:new Date().toISOString()})');mapped.close.onclick();await settle(mapped);
 assert.equal(mapped.dialog.open,true);assert.equal(mapped.api.state().page,before.page);assert.equal(mapped.dialog.scrollTop,480);assert.equal(mapped.f('property-map-dialog').open,true);
 const mapAfter=map.state();for(const key of ['query','scope','category','radius','reference','limit'])assert.deepEqual(JSON.parse(JSON.stringify(mapAfter[key])),mapBefore[key],key+' survives map → seller → lot → seller');
 assert.equal(mapped.f('property-map-dialog').scrollTop,380);assert.equal(maps.length,1);assert.equal(maps[0].removed,undefined);assert.equal(maps[0].zoom,12);assert.deepEqual(JSON.parse(JSON.stringify(maps[0].center)),{lat:51.68,lng:39.24});assert.equal(mapped.f('bid'),mapped.originalInput);assert.equal(mapped.f('bid-form'),mapped.originalForm);assert.equal(mapped.f('bid').value,'125000');assert.equal(Number(mapped.f('bid').min),151000);
 mapped.api.close();assert.equal(mapped.f('property-map-dialog').open,true,'ordinary profile Back leaves the earlier map open');map.close();assert.equal(mapped.f('modal').open,true);assert.equal(mapped.f('bid'),mapped.originalInput);assert.equal(mapped.f('modal').scrollTop,430);
 console.log('PASS: actual X, lot header, Escape, quickbar, generic/native Back, four toolbar swipe directions and legacy fallback return to the seller profile with page/scroll and original typed bid DOM intact; gallery movement and nested overlays remain native, seller history wins over map fallback.');
})().catch(error=>{console.error(error);process.exitCode=1});

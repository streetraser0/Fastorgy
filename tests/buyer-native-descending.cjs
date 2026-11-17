const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot:bootApp}=require('./helpers/category-seller-harness.cjs');
const {setup}=require('./helpers/quickbar-dom.cjs');
const app=bootApp(),now=Date.now(),lot={id:999777200,demo:true,name:'Станок на понижение',category:'equipment',city:'Воронеж',bank:'Демо-продавец',price:1000000,start:1000000,step:10000,deposit:0,bids:0,auctionDirection:'descending',floorPrice:500000,decreaseStep:50000,decreaseIntervalMinutes:30,startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),image:'assets/equipment.svg'};
vm.runInContext(fs.readFileSync('dist/auction-modes.js','utf8'),app.context);app.run('cars.push('+JSON.stringify(lot)+');openCar('+lot.id+')');
const actualMarkup=app.node('#modal-content').innerHTML;
assert(actualMarkup.includes('data-open-lot-id="'+lot.id+'"'));assert(!actualMarkup.includes('id="bid-form"'));
const source=fs.readFileSync('dist/buyer-tools.js','utf8');
function boot(options={}){
 const h=setup({mobile:true}),ctx=h.context,records={},copied=[],shared=[];
 Object.assign(ctx,{URL,URLSearchParams,navigator:{clipboard:{writeText:async text=>copied.push(text)},share:async()=>{throw Error('native adapter must take precedence')}},location:{href:'https://fas.example/?lot='+lot.id,search:options.restore?'?lot='+lot.id:''},localStorage:{getItem:key=>records[key]??null,setItem:(key,value)=>records[key]=value},cars:[{...lot}],isLotLive:row=>Date.parse(row.ends)>Date.now(),current:row=>row.price,money:value=>String(value)+' ₽',image:row=>row.image});
 ctx.showModalContent=html=>{h.modal.classList.remove('lot-dialog');h.content.innerHTML=html;h.modal.open=true};
 ctx.openCar=id=>{if(id!==lot.id)return;h.content.innerHTML=actualMarkup;h.modal.classList.add('lot-dialog');h.modal.open=true};
 ctx.FasNativeShare={async share(data){shared.push(data);if(options.throwCancel)throw Error('Share canceled.');return options.cancel?{cancelled:true}:{}}};
 vm.runInContext(source,ctx);return {...h,api:ctx.FasBuyerTools,shared,copied,records};
}
(async()=>{
 let h=boot();h.context.openCar(lot.id);assert.equal(h.api.getRecentIds()[0],lot.id,'real descending markup enters history without a bid form');assert(h.content.querySelector('.buyer-lot-tools'),'descending lot gets share/history actions');
 const result=await h.api.shareLot(lot.id);assert.equal(result.method,'share');assert.equal(h.shared.length,1);assert.equal(h.shared[0].url,'https://fas.example/?lot='+lot.id);assert.equal(h.copied.length,0);
 h=boot({restore:true});assert.equal(h.api.getRecentIds()[0],lot.id,'descending share deep link restores through the actual marker');assert(h.modal.open);
 for(const options of [{cancel:true},{throwCancel:true}]){h=boot(options);const result=await h.api.shareLot(lot.id);assert.equal(result.cancelled,true);assert.equal(result.ok,false);assert.equal(h.copied.length,0,'native cancellation never silently copies the link');assert.equal(h.modal.open,false,'cancel does not open a manual-copy dialog')}
 h=boot();h.context.cars[0].demo=false;h.context.cars[0].sellerOwnerId='private';const local=await h.api.shareLot(lot.id);assert.equal(local.local,true);assert.equal(h.shared.length,0,'local-only lot is never exposed to native sharing');assert.equal(h.copied[0],'Лот № '+lot.id);
 console.log('PASS: actual descending lot markup supports recent/history/deep links; native lot sharing takes precedence, cancellation stays quiet and local lots keep their privacy.');
})().catch(error=>{console.error(error);process.exitCode=1});

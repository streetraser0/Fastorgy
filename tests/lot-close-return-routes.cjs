const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(mapReturn){
 const h=setup({mobile:true});let returned=0,closed=0;h.add('close','button',h.modal).className='close';h.modal.classList.add('lot-dialog');h.modal.showModal();
 const ordinaryClose=h.modal.close.bind(h.modal);h.modal.close=()=>{closed++;ordinaryClose()};
 h.context.FasPropertyMap={returnFromLot(){returned++;return mapReturn}};
 h.context.$=selector=>h.document.querySelector(selector);h.context.clearLotDialog=()=>{};h.context.recenterFeed=()=>{};
 h.context.lotSwipeStart=()=>{};h.context.lotSwipeMove=()=>{};h.context.lotSwipeEnd=()=>{};h.context.resetLotSwipe=()=>{};
 const start=main.indexOf("$('.close').onclick="),end=main.indexOf(";$('#more').onclick=",start);
 assert(start>=0&&end>start);vm.runInContext(main.slice(start,end+1),h.context);
 const initStart=main.indexOf('function initLotDismiss()'),initEnd=main.indexOf('\nfunction openCar(',initStart);
 assert(initStart>=0&&initEnd>initStart);vm.runInContext(main.slice(initStart,initEnd)+';initLotDismiss();',h.context);
 return {...h,get returned(){return returned},get closed(){return closed}};
}
for(const mapReturn of [true,false])for(const action of ['X','backdrop','lot-return','Escape']){
 const h=fixture(mapReturn);
 if(action==='X')h.document.querySelector('.close').onclick();
 if(action==='backdrop')h.modal.onclick({target:h.modal});
 if(action==='lot-return'){const button=h.add('lot-return','button',h.content);button.setAttribute('data-close-lot','');h.modal.dispatchEvent({type:'click',target:button})}
 if(action==='Escape'){let prevented=false;h.modal.dispatchEvent({type:'cancel',preventDefault(){prevented=true}});assert.equal(prevented,mapReturn,'only a handled map return cancels the browser default close');if(!prevented)h.modal.close()}
 assert.equal(h.returned,1,action+' delegates once');assert.equal(h.closed,mapReturn?0:1,action+' avoids closing the underlying restored lot/map');assert.equal(h.modal.open,mapReturn,action+' retains a restored underlying window');
}
for(const mapReturn of [true,false]){
 const h=fixture(mapReturn);vm.runInContext(read('back-swipe.js'),h.context);
 assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(h.returned,1);assert.equal(h.closed,mapReturn?0:1,'native Back follows map return before ordinary close');
}
{
 const h=fixture(true),sheet=h.add('copy-sheet','dialog');sheet.showModal();h.context.FasDialogLifecycle={top:()=>sheet};vm.runInContext(read('back-swipe.js'),h.context);
 assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(sheet.open,false);assert.equal(h.returned,0,'Back on a copy sheet closes only that top layer');assert.equal(h.modal.open,true);assert.equal(h.closed,0);
}
console.log('PASS: actual X/backdrop/lot-return/Escape/native Back use map return once, preserve restored windows, retain ordinary closing, and close a top copy sheet independently.');

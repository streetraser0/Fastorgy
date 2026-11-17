const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
const main=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const code=main.slice(main.indexOf('let lotSwipeState='),main.indexOf('function openCar('));
function harness(options={}){
 const classes=new Set(options.otherDialog?[]:['lot-dialog']),listeners=new Map();let prevented=0,recenters=0;
 const dialog={open:options.closed!==true,scrollTop:options.scrollTop??0,clientHeight:options.clientHeight??500,scrollHeight:options.scrollHeight??1600,style:{transform:'',opacity:''},closed:0,dataset:{},contains:target=>target.inside!==false,classList:{contains:name=>classes.has(name),add(...names){names.forEach(name=>classes.add(name))},remove(...names){names.forEach(name=>classes.delete(name))},toggle(name,force){const on=force??!classes.has(name);on?classes.add(name):classes.delete(name);return on}},addEventListener(type,fn){listeners.set(type,fn)},close(){this.open=false;this.closed++;listeners.get('close')?.()}};
 const target={inside:true,closest(selector){for(const item of selector.split(',').map(s=>s.trim())){if(item==='.lot-swipe-surface'&&options.surface!=='body'&&options.surface!=='toolbar')return this;if(item==='.lot-quick-access'&&options.surface==='toolbar')return this;if(options.control&&(item===options.control||item==='[contenteditable]'&&options.control==='contenteditable'||item==='[role="button"]'&&options.control==='role-button'))return this}return null}};
 const state={$:selector=>selector==='#modal'?dialog:null,reelsMode:true,recenterFeed(){recenters++},window:{matchMedia:()=>({matches:!!options.reduced})}};
 vm.createContext(state);vm.runInContext(code,state);state.initLotDismiss();
 const event=(x,y,time=100,extra={})=>({target,touches:[{identifier:1,clientX:x,clientY:y}],changedTouches:[{identifier:1,clientX:x,clientY:y}],timeStamp:time,cancelable:true,preventDefault(){prevented++},...extra});
 const swipe=(dx=0,dy=-120,duration=300)=>{state.lotSwipeStart(event(120,230));state.lotSwipeMove(event(120+dx,230+dy,100+duration));state.lotSwipeEnd(event(120+dx,230+dy,100+duration,{touches:[]}))};
 return{state,dialog,target,event,swipe,listeners,classes,prevented:()=>prevented,recenters:()=>recenters};
}
// The lot dialog is shared by house/property and transport lots. Photo/header
// dismissal must not depend on whether the description has already scrolled.
for(const options of [{},{scrollTop:25},{scrollTop:300},{surface:'toolbar',scrollTop:900},{surface:'body',scrollTop:1100},{surface:'body',scrollTop:1096}]){
 const h=harness(options),before=h.dialog.scrollTop;h.swipe();assert.equal(h.dialog.closed,1,JSON.stringify(options));assert.equal(h.dialog.scrollTop,before,'closing preserves the background/description position');assert.equal(h.dialog.style.transform,'');assert.equal(h.recenters(),1);assert(h.prevented()>0);
}
for(const options of [{surface:'body',scrollTop:0},{surface:'body',scrollTop:500},{surface:'body',scrollTop:1090},{otherDialog:true},{closed:true}]){
 const h=harness(options);h.swipe();assert.equal(h.dialog.closed,0,JSON.stringify(options));assert.equal(h.prevented(),0);
}
for(const control of ['video','button','input','textarea','select','a','summary','contenteditable','role-button']){
 const h=harness({surface:'body',scrollTop:1100,control});h.swipe();assert.equal(h.dialog.closed,0,control);assert.equal(h.prevented(),0,control);
}
for(const [dx,dy,duration,closed] of [[0,-47,50,0],[0,-48,80,1],[0,-48,100,0],[0,-89,400,0],[0,-90,500,1],[100,-100,100,0],[120,0,100,0],[0,120,100,0]]){
 const h=harness();h.swipe(dx,dy,duration);assert.equal(h.dialog.closed,closed,[dx,dy,duration].join('/'));
}
for(const cancellation of ['multitouch','wrong-move-id','missing-end','wrong-end-id','notcancelable-move','notcancelable-end','cancel','closed','changed-dialog']){
 const h=harness();h.state.lotSwipeStart(h.event(120,230));h.state.lotSwipeMove(h.event(122,110,200));
 if(cancellation==='multitouch')h.state.lotSwipeMove(h.event(122,100,220,{touches:[{},{}]}));
 if(cancellation==='wrong-move-id')h.state.lotSwipeMove(h.event(122,100,220,{touches:[{identifier:2,clientX:122,clientY:100}]}));
 if(cancellation==='notcancelable-move')h.state.lotSwipeMove(h.event(122,100,220,{cancelable:false}));
 if(cancellation==='cancel')h.listeners.get('touchcancel')();
 if(cancellation==='closed')h.dialog.open=false;
 if(cancellation==='changed-dialog')h.classes.delete('lot-dialog');
 const extra={touches:[]};if(cancellation==='missing-end')extra.changedTouches=[];if(cancellation==='wrong-end-id')extra.changedTouches=[{identifier:2,clientX:122,clientY:100}];if(cancellation==='notcancelable-end')extra.cancelable=false;
 h.state.lotSwipeEnd(h.event(122,100,250,extra));assert.equal(h.dialog.closed,0,cancellation);assert.equal(h.dialog.style.transform,'',cancellation);
}
{
 const h=harness({surface:'body',scrollTop:500});h.state.lotSwipeStart(h.event(120,230));h.dialog.scrollTop=1100;h.state.lotSwipeMove(h.event(122,100,200));h.state.lotSwipeEnd(h.event(122,100,250,{touches:[]}));assert.equal(h.dialog.closed,0,'reaching the bottom during a reading gesture must not dismiss the house');
}
assert(!/\b(?:render|setReels|scrollTo|pushState|history\.back)\s*\(/.test(code),'dismissal must not rebuild the lot feed or navigate browser history');
console.log('PASS: upward close from photos/sticky lot header/scrolled description bottom; ordinary reading/gallery/control priority, thresholds, touch cancellation and unchanged feed position.');

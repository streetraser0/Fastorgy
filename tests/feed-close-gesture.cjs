const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../dist/feed-close-gesture.js'),'utf8');
const context={};vm.createContext(context);vm.runInContext(source,context);
class Surface{
 constructor(...matches){this.selectors=new Set(matches);this.children=[];this.parentElement=null;this.dataset={};this.scrollLeft=0;this.listeners=new Map();this.added=0;this.removed=0}
 appendChild(node){node.parentElement=this;this.children.push(node);return node}
 contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false}
 matches(selector){return this.selectors.has(selector)}
 closest(selector){for(let current=this;current;current=current.parentElement)if(selector.split(',').some(part=>current.selectors.has(part)))return current;return null}
 querySelector(selector){return this.children.flatMap(child=>[child,child.querySelector(selector)]).find(child=>child?.selectors.has(selector))||null}
 addEventListener(type,handler,settings){this.listeners.set(type,{handler,settings});this.added++}
 removeEventListener(type,handler){if(this.listeners.get(type)?.handler===handler)this.listeners.delete(type);this.removed++}
}
function setup(){
 const document=new Surface(),view=new Surface(),header=new Surface('.reels-header'),grid=new Surface('#grid');
 const headerText=header.appendChild(new Surface('span')),body=grid.appendChild(new Surface('.card-body'));
 const photoSurface=grid.appendChild(new Surface('.car-photo','[role="button"]')),gallery=photoSurface.appendChild(new Surface('.lot-gallery')),track=gallery.appendChild(new Surface('.gallery-track')),photo=track.appendChild(new Surface('img'));
 const button=body.appendChild(new Surface('button')),buttonText=button.appendChild(new Surface('span')),video=track.appendChild(new Surface('video'));
 track.clientWidth=300;track.scrollWidth=600;let clock=1000;
 const state={open:true,blocked:false,closed:0,position:1234};
 const controller=context.createFasFeedSwipeClose({document,window:view,header,grid,now:()=>clock,isFeedOpen:()=>state.open,isBlocked:()=>state.blocked,closeFeed(){state.open=false;state.closed++;assert.equal(state.position,1234)}});
 const event=(target,x,y,time,kind='move',more={})=>({target,timeStamp:time,cancelable:true,touches:kind==='end'?[]:[{identifier:7,clientX:x,clientY:y}],changedTouches:kind==='end'?[{identifier:7,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++},stopPropagation(){},stopImmediatePropagation(){},...more});
 function gesture(target,dx,dy=0,duration=200){const start=event(target,100,180,0,'start'),move=event(target,100+dx,180+dy,duration/2),end=event(target,100+dx,180+dy,duration,'end');controller.start(start);controller.move(move);controller.end(end);return {start,move,end}}
 return {document,view,header,grid,headerText,body,photoSurface,gallery,track,photo,button,buttonText,video,state,controller,event,gesture,advance(ms){clock+=ms}};
}
for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){
 const h=setup(),events=h.gesture(h.headerText,dx,dy);assert.equal(h.state.closed,1,'header return works in all four directions');assert.equal(events.move.prevented,1);assert.equal(events.end.prevented,1);h.controller.end(events.end);assert.equal(h.state.closed,1);
}
for(const dx of [120,-120]){const h=setup(),events=h.gesture(h.body,dx,1);assert.equal(h.state.closed,1);assert.equal(events.move.prevented,1)}
for(const dy of [-200,200]){const h=setup(),events=h.gesture(h.body,0,dy);assert.equal(h.state.closed,0,'vertical feed browsing stays native');assert.equal(events.move.prevented+events.end.prevented,0)}
for(const offset of [0,150,300])for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){
 const h=setup();h.track.scrollLeft=offset;const events=h.gesture(h.photo,dx,dy);assert.equal(h.state.closed,0,'photo viewing never returns to the page, even at gallery edges');assert.equal(events.move.prevented+events.end.prevented,0);
}
for(const name of ['button','buttonText','video'])for(const dx of [120,-120]){const h=setup();h.gesture(h[name],dx);assert.equal(h.state.closed,0,name+' keeps native controls')}
for(const tag of ['input','textarea','select','label','audio','[contenteditable]']){const h=setup(),target=h.header.appendChild(new Surface(tag));h.gesture(target,0,-120);assert.equal(h.state.closed,0,tag+' is not a return handle')}
for(const kind of ['button','a','[role="button"]'])for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){const h=setup(),target=h.header.appendChild(new Surface(kind));h.gesture(target,dx,dy);assert.equal(h.state.closed,1,kind+' on the actual toolbar returns in all four directions')}
for(const kind of ['button','a','[role="button"]']){const h=setup(),target=h.header.appendChild(new Surface(kind)),events=h.gesture(target,0,0);assert.equal(h.state.closed,0);assert.equal(events.move.prevented+events.end.prevented,0,'a toolbar tap remains native');const click=h.event(target,100,180,210,'move',{detail:1});h.controller.suppressClick(click);assert.equal(click.prevented,0,'taps do not block control clicks')}
for(const [dx,dy,time] of [[40,0,200],[100,95,200],[0,70,400]]){const h=setup();h.gesture(h.headerText,dx,dy,time);assert.equal(h.state.closed,0,'short and diagonal gestures do not return')}
for(const duration of [1200,4000])for(const dx of [-120,120]){const h=setup();h.gesture(h.headerText,dx,0,duration);assert.equal(h.state.closed,1,'deliberate slow header swipe returns')}
for(const reason of ['modal','detach','touchcancel','visibilitychange','resize','blur','wrong-id','multi-touch']){
 const h=setup();h.controller.start(h.event(h.headerText,100,180,0));
 if(reason==='modal')h.state.blocked=true;if(reason==='detach')h.headerText.parentElement=null;
 if(reason==='touchcancel'||reason==='visibilitychange')h.document.listeners.get(reason).handler();if(reason==='resize'||reason==='blur')h.view.listeners.get(reason).handler();
 const extra=reason==='wrong-id'?{touches:[{identifier:99,clientX:100,clientY:300}]}:reason==='multi-touch'?{touches:[{},{}]}:{};
 h.controller.move(h.event(h.headerText,100,300,100,'move',extra));h.controller.end(h.event(h.headerText,100,300,200,'end'));assert.equal(h.state.closed,0,reason+' cancels stale return');
}
for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){
 const h=setup();h.controller.start(h.event(h.headerText,100,180,0));const move=h.event(h.headerText,100+dx,180+dy,100,'move',{cancelable:false}),end=h.event(h.headerText,100+dx,180+dy,200,'end',{cancelable:false});h.controller.move(move);h.controller.end(end);assert.equal(h.state.closed,1,'coalesced/noncancelable header swipes still return');assert.equal(move.prevented+end.prevented,0);
}
{
 const h=setup();h.controller.start(h.event(h.headerText,100,180,0));h.controller.end(h.event(h.headerText,100,60,100,'end'));assert.equal(h.state.closed,1,'header return does not require an intermediate touchmove');
}
{
 const h=setup();h.gesture(h.headerText,0,120);const ghost=h.event(h.body,100,180,210,'move',{detail:1});h.controller.suppressClick(ghost);assert.equal(ghost.prevented,1,'return cannot click a page control below the feed');h.state.open=true;h.gesture(h.headerText,120);h.advance(451);const later=h.event(h.body,100,180,800,'move',{detail:1});h.controller.suppressClick(later);assert.equal(later.prevented,0);
}
{
 const dom=require('./helpers/quickbar-dom.cjs').setup({mobile:true});dom.document.removeEventListener=()=>{};dom.context.removeEventListener=()=>{};const header=dom.add('reels-header');header.className='reels-header';header.innerHTML='<a role="button"><img alt="ФАС торги"></a><button aria-label="Поиск"><svg><path></path></svg></button>';let closed=0;
 const controller=context.createFasFeedSwipeClose({document:dom.document,window:dom.context,header,grid:dom.grid,isFeedOpen:()=>true,isBlocked:()=>false,closeFeed(){closed++}});
 for(const selector of ['img','button','path'])for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){const target=header.querySelector(selector),event=(x,y,at,end=false)=>({target,timeStamp:at,cancelable:true,touches:end?[]:[{identifier:8,clientX:x,clientY:y}],changedTouches:end?[{identifier:8,clientX:x,clientY:y}]:[],preventDefault(){}});controller.start(event(180,180,0));controller.move(event(180+dx,180+dy,100));controller.end(event(180+dx,180+dy,200,true))}
 assert.equal(closed,12,'real DOM clickable logo, button and SVG path are reachable four-way return targets');controller.destroy();
}
let h=setup();h.controller.destroy();h.gesture(h.headerText,120);assert.equal(h.state.closed,0);assert.equal(h.document.removed+h.view.removed,12);
// Installation delegates return to the existing page-position-aware API.
h=setup();h.controller.destroy();let closedWith;
h.document.querySelector=selector=>selector==='.reels-header'?h.header:selector==='#grid'?h.grid:selector==='dialog[open]'&&h.state.blocked?{}:null;
h.document.createElement=()=>new Surface('span');
const installed={document:h.document,window:h.view,reelsMode:true,setReels(value){closedWith=value;installed.reelsMode=value}};vm.createContext(installed);vm.runInContext(source,installed);
assert.equal(h.header.children.at(-1).textContent,'Свайп по верхней панели в любую сторону — назад');assert.equal(installed.installFasFeedSwipeClose(),null,'installer is idempotent');
h.document.listeners.get('touchstart').handler(h.event(h.headerText,100,180,0));h.document.listeners.get('touchmove').handler(h.event(h.headerText,100,300,100));h.document.listeners.get('touchend').handler(h.event(h.headerText,100,300,200,'end'));assert.equal(closedWith,false);

// Exercise the actual production setReels implementation and both entry buttons.
const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');

// Run the actual canonical multi-region model and select-option restoration.
function installRegionRestore(context){
 const catalog=fs.readFileSync(path.join(__dirname,'../dist/catalog-data.js'),'utf8'),model=fs.readFileSync(path.join(__dirname,'../dist/region-select.js'),'utf8');
 vm.runInContext(catalog.slice(0,catalog.indexOf('\n')),context);
 vm.runInContext(model.slice(0,model.indexOf(' let control='))+'\n})();',context);
 for(const name of ['escapeText','regionOptions','setRegionValue']){const line=html.split(/\r?\n/).find(row=>row.startsWith('function '+name+'('));assert(line,'production '+name+' exists');vm.runInContext(line,context)}
}
const first=html.indexOf('function setReels('),last=html.indexOf("\n$('#open-reels')",first);
assert(first>=0&&last>first,'production feed entry implementation exists');
h=setup();h.controller.destroy();let returned=0,rendered=0;h.view.scrollTo=()=>returned++;
const entryNodes={'#grid':h.grid,'#lot-results':{scrollIntoView(){returned++}},'#open-reels':{},'#home-open-feed':{}};
const playingVideo={controls:false,pause(){this.paused=true}};h.grid.querySelectorAll=selector=>selector==='video'?[playingVideo]:[];
h.document.body={classList:{toggle(name,on){this[name]=on}}};
h.document.querySelector=selector=>selector==='.reels-header'?h.header:selector==='#grid'?h.grid:selector==='dialog[open]'&&h.state.blocked?{}:null;
h.document.querySelectorAll=()=>[];
h.document.createElement=()=>new Surface('span');
const production={document:h.document,window:h.view,reelsMode:false,recommendationSession:null,feedTouchActive:false,catalogLimit:100,tab:'fav',ADV_IDS:['price-min','radius'],keywordCategoryQuery:'old',keywordCategoryAuto:'cars',keywordCategoryAutomatic:true,syncSearchFields(){},cancelFeedSettle(){},render(){rendered++},$:selector=>entryNodes[selector]??(entryNodes[selector]={value:''})};
production.discoverySessionKey='previous';production.discoverySeenSnapshot=new Map([[1042,true]]);
const resetFirst=html.indexOf('function resetDiscoverySession()'),resetLast=html.indexOf('\nfunction prioritizeDiscovery',resetFirst);
assert(resetFirst>=0&&resetLast>resetFirst,'production discovery session reset exists');
vm.createContext(production);installRegionRestore(production);production.setRegionValue("78,77,77");assert.equal(entryNodes["#region-filter"].value,"77,78");vm.runInContext(html.slice(resetFirst,resetLast),production);vm.runInContext(html.slice(first,last),production);
const localFirst=html.indexOf('function openLocalFeed()');assert(localFirst>=0&&localFirst<first,'production home feed reset exists');vm.runInContext(html.slice(localFirst,first),production);
for(const selector of ['#open-reels','#home-open-feed']){
 // Execute the actual callbacks: the home entry clears stale filters while
 // the result-list entry preserves its selected search criteria.
 const assignmentStart=html.indexOf("$('"+selector+"').onclick=");assert(assignmentStart>=0);
 const assignment=html.slice(assignmentStart,html.indexOf(';',assignmentStart)+1);
 assert.equal(assignment,"$('"+selector+"').onclick="+(selector==='#home-open-feed'?'openLocalFeed':'()=>setReels(true)')+';');
 vm.runInContext(assignment,production);
}
vm.runInContext(source,production);
for(const selector of ['#open-reels','#home-open-feed'])for(const dx of [120,-120]){
 production.discoverySessionKey='previous';production.discoverySeenSnapshot.set(1042,true);
 entryNodes[selector].onclick();assert.equal(production.reelsMode,true,selector+' opens production feed');assert.equal(production.discoverySessionKey,'');assert.equal(production.discoverySeenSnapshot.size,0,'a new feed entry refreshes the viewed-lot ordering snapshot');h.track.scrollLeft=dx<0?300:0;
 h.document.listeners.get('touchstart').handler(h.event(h.headerText,150,180,0));
 h.document.listeners.get('touchmove').handler(h.event(h.headerText,150+dx,180,100,'move',{cancelable:false}));
 h.document.listeners.get('touchend').handler(h.event(h.headerText,150+dx,180,200,'end',{cancelable:false}));
 assert.equal(production.reelsMode,false,selector+' feed closes from its free header with native noncancelable events');assert.equal(entryNodes['#region-filter'].value,'77,78','both entries restore the canonical multi-region value');assert.match(entryNodes['#region-filter'].innerHTML,/value="77,78" selected/,'restored select contains the matching multi-region option');
}
assert.equal(returned,4);assert.equal(rendered,8);assert.equal(playingVideo.paused,true);assert.equal(playingVideo.controls,true);
console.log('PASS: feed header four-way close, native vertical browsing/photo/control priority, thresholds, cancellation, modal guards and existing catalog-return route.');

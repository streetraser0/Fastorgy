'use strict';
// Real feed controller and production return APIs; modeled touch events, not a physical browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'dist/feed-close-gesture.js'),'utf8');
const factoryContext={};vm.createContext(factoryContext);vm.runInContext(source,factoryContext);
class Surface{
 constructor(...selectors){this.selectors=new Set(selectors);this.children=[];this.parentElement=null;this.dataset={};this.scrollLeft=0;this.scrollTop=0;this.clientHeight=600;this.clientWidth=390;this.scrollHeight=3000;this.listeners=new Map();this.nodeType=1;this.tagName=(selectors.find(value=>/^[a-z][a-z0-9-]*$/.test(value))||'div').toUpperCase();this.isConnected=true;this.style={setProperty(){}};this.hidden=false;}
 appendChild(node){node.parentElement=this;this.children.push(node);return node}
 contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false}
 matches(selector){return selector.split(',').some(part=>this.selectors.has(part.trim()))}
 closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null}
 querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const found=child.querySelector(selector);if(found)return found}return null}
 querySelectorAll(selector){const result=[];for(const child of this.children){if(child.matches(selector))result.push(child);result.push(...child.querySelectorAll(selector))}return result}
 addEventListener(type,handler,settings){this.listeners.set(type,{handler,settings})}
 removeEventListener(type,handler){if(this.listeners.get(type)?.handler===handler)this.listeners.delete(type)}
}
function fixture(){
 const document=new Surface(),view=new Surface(),header=new Surface('.reels-header'),grid=new Surface('#grid');
 const heading=header.appendChild(new Surface('span')),logo=header.appendChild(new Surface('a','[role="button"]')).appendChild(new Surface('img'));
 const headerButton=header.appendChild(new Surface('button')),body=grid.appendChild(new Surface('.card-body'));
 const card=grid.appendChild(new Surface('.card')),photoSurface=card.appendChild(new Surface('.car-photo','[role="button"]')),gallery=photoSurface.appendChild(new Surface('.lot-gallery')),track=gallery.appendChild(new Surface('.gallery-track')),photo=track.appendChild(new Surface('img','[role="button"]'));
 const button=body.appendChild(new Surface('button')),input=body.appendChild(new Surface('input')),video=track.appendChild(new Surface('video'));
 track.clientWidth=300;track.scrollWidth=900;
 const state={open:true,blocked:false,index:0,closed:0,context:{entry:'first'},position:1234,selection:null};let clock=1000;
 view.getSelection=()=>state.selection;
 const controller=factoryContext.createFasFeedSwipeClose({document,window:view,header,grid,now:()=>clock,isFeedOpen:()=>state.open,isBlocked:()=>state.blocked,isAtStart:()=>state.index===0&&grid.scrollTop<=1,getContext:()=>state.context,closeFeed(){state.closed++;state.open=false;assert.equal(state.position,1234)}});
 const event=(target,x=180,y=260,time=0,end=false,extra={})=>({target,timeStamp:time,cancelable:true,touches:end?[]:[{identifier:7,clientX:x,clientY:y}],changedTouches:end?[{identifier:7,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...extra});
 function swipe(target,dx,dy,duration=200){const start=event(target),move=event(target,180+dx,260+dy,duration/2),end=event(target,180+dx,260+dy,duration,true);controller.start(start);controller.move(move);controller.end(end);return{start,move,end}}
 return{document,view,header,grid,heading,logo,headerButton,body,card,photoSurface,gallery,track,photo,button,input,video,state,controller,event,swipe,advance(ms){clock+=ms}};
}
// Native scrolling inside compact lot details must never dismiss the feed.
for(const scrollTop of [0,180,300])for(const [dx,dy]of[[0,140],[0,-140],[140,0],[-140,0]]){
 const h=fixture(),text=h.body.appendChild(new Surface('dd'));h.body.clientHeight=300;h.body.scrollHeight=600;h.body.scrollTop=scrollTop;h.view.getComputedStyle=node=>({overflowY:node===h.body?'auto':'visible'});
 const events=h.swipe(text,dx,dy);assert.equal(h.state.closed,0,'compact details keep native gestures at every scroll position');assert.equal(events.move.prevented+events.end.prevented,0,'details scroll is not intercepted by feed return');
}
for(const [overflowY,height]of[['auto',300],['visible',600]]){
 const h=fixture();h.body.clientHeight=300;h.body.scrollHeight=height;h.view.getComputedStyle=()=>({overflowY});h.swipe(h.body,0,140);assert.equal(h.state.closed,1,'non-scrollable ordinary content still supports first-lot return');
}
// The first real lot can be pulled down from ordinary content and the photo,
// regardless of which image is selected. Photo swipes in the other axes stay native.
for(const target of ['body','photo'])for(const offset of [0,150,600])for(const duration of [200,1200,4000]){
 const h=fixture();h.track.scrollLeft=offset;const events=h.swipe(h[target],0,140,duration);assert.equal(h.state.closed,1,target+' pull-down at first lot returns, including slow gestures');assert(events.move.prevented>0);assert(events.end.prevented>0);
}
for(const target of ['heading','logo','headerButton'])for(const [dx,dy]of[[140,0],[-140,0],[0,140],[0,-140]])for(const duration of [200,1200,4000]){
 const h=fixture();h.state.index=20;h.grid.scrollTop=600;h.swipe(h[target],dx,dy,duration);assert.equal(h.state.closed,1,'header returns in four directions at every position and pace');
}
for(const dx of [140,-140])for(const index of [0,12]){const h=fixture();h.state.index=index;h.swipe(h.body,dx,0,4000);assert.equal(h.state.closed,1,'free body horizontal return remains available at every lot')}
for(const offset of [0,150,600])for(const [dx,dy]of[[140,0],[-140,0],[0,-140]]){
 const h=fixture();h.track.scrollLeft=offset;const events=h.swipe(h.photo,dx,dy);assert.equal(h.state.closed,0,'photo horizontal browsing and upward feed scrolling stay native');assert.equal(events.move.prevented+events.end.prevented,0);
}
for(const target of ['body','photo'])for(const [index,scrollTop]of[[1,600],[35,0],[0,20]]){
 const h=fixture();h.state.index=index;h.grid.scrollTop=scrollTop;const events=h.swipe(h[target],0,140);assert.equal(h.state.closed,0,'only the true initial edge may pull down, not a virtual window origin');assert.equal(events.move.prevented+events.end.prevented,0);
}
for(const target of ['body','photo']){
 const h=fixture();h.state.index=2;h.grid.scrollTop=1200;h.controller.start(h.event(h[target]));h.controller.move(h.event(h[target],180,320,100));h.state.index=0;h.grid.scrollTop=0;h.controller.move(h.event(h[target],180,400,180));h.controller.end(h.event(h[target],180,400,220,true));assert.equal(h.state.closed,0,'reaching the first lot during native scrolling does not turn that same gesture into a return');
}
for(const target of ['body','photo']){
 const h=fixture();h.controller.start(h.event(h[target]));h.controller.move(h.event(h[target],180,380,100));h.state.index=1;h.controller.end(h.event(h[target],180,400,200,true));assert.equal(h.state.closed,0,'the true beginning must still be current at release');
}
for(const target of ['heading','body','photo']){
 const h=fixture();h.controller.start(h.event(h[target]));const first=h.event(h[target],180,261,10);h.controller.move(first);assert(first.prevented>0,'first downward pixel is reserved before WebKit native-scroll commitment');const end=h.event(h[target],180,400,1400,true,{cancelable:false});h.controller.end(end);assert.equal(h.state.closed,1,'a claimed slow pull survives a noncancelable final event');
}
for(const [dx,dy]of[[0,40],[90,85],[0,-140]]){const h=fixture();h.swipe(h.body,dx,dy);assert.equal(h.state.closed,0,'short, diagonal and upward body gestures do not return')}
for(const target of ['button','input','video'])for(const [dx,dy]of[[140,0],[-140,0],[0,140]]){const h=fixture();const events=h.swipe(h[target],dx,dy);assert.equal(h.state.closed,0,target+' keeps its native interaction');assert.equal(events.move.prevented+events.end.prevented,0)}
// An image can itself be a role=button photo target, but a real enclosing
// link/button remains its own native control even inside a gallery.
for(const tag of ['button','a'])for(const [dx,dy]of[[0,140],[140,0],[-140,0]]){
 const h=fixture(),control=h.track.appendChild(new Surface(tag)),image=control.appendChild(new Surface('img','[role="button"]'));const events=h.swipe(image,dx,dy);assert.equal(h.state.closed,0,'a gallery image inside a real '+tag+' remains native');assert.equal(events.move.prevented+events.end.prevented,0);
}
for(const reason of ['context','selection','contextmenu','dialog-close','dialog-cancel','modal','detach','touchcancel','multi-touch','wrong-touch']){
 const h=fixture();h.controller.start(h.event(h.photo));
 if(reason==='context')h.state.context={entry:'reopened'};
 if(reason==='selection')h.state.selection={isCollapsed:false,anchorNode:h.photo,focusNode:h.photo};
 if(reason==='contextmenu')h.document.listeners.get('contextmenu')?.handler({target:h.photo});
 if(reason==='dialog-close'||reason==='dialog-cancel')h.document.listeners.get(reason.slice(7))?.handler({target:{tagName:'DIALOG'}});
 if(reason==='modal')h.state.blocked=true;
 if(reason==='detach')h.card.parentElement=null;
 if(reason==='touchcancel')h.document.listeners.get('touchcancel').handler();
 const extra=reason==='multi-touch'?{touches:[{},{}]}:reason==='wrong-touch'?{touches:[{identifier:999,clientX:180,clientY:400}]}:{};
 h.controller.move(h.event(h.photo,180,400,100,false,extra));h.controller.end(h.event(h.photo,180,400,200,true));assert.equal(h.state.closed,0,reason+' cancels stale return');
}
{
 const h=fixture();h.state.selection={isCollapsed:false,anchorNode:h.photo,focusNode:h.photo};const events=h.swipe(h.photo,0,140);assert.equal(h.state.closed,0,'selection already present prevents gesture start');assert.equal(events.move.prevented,0);
}
{
 const h=fixture();h.swipe(h.photo,0,140);const ghost=h.event(h.body,180,400,210,false,{detail:1});h.controller.suppressClick(ghost);assert(ghost.prevented>0,'feed dismissal cannot activate the page underneath');h.advance(451);const later=h.event(h.body,180,400,800,false,{detail:1});h.controller.suppressClick(later);assert.equal(later.prevented,0);
}
// Execute the actual setReels, entry callbacks and virtual-index helpers. The
// installer must distinguish the first real item from scrollTop=0 in a later window.
{
 const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),h=fixture();h.controller.destroy();

// Run the actual canonical multi-region model and select-option restoration.
function installRegionRestore(context){
 const catalog=fs.readFileSync(path.join(__dirname,'../dist/catalog-data.js'),'utf8'),model=fs.readFileSync(path.join(__dirname,'../dist/region-select.js'),'utf8');
 vm.runInContext(catalog.slice(0,catalog.indexOf('\n')),context);
 vm.runInContext(model.slice(0,model.indexOf(' let control='))+'\n})();',context);
 for(const name of ['escapeText','regionOptions','setRegionValue']){const line=html.split(/\r?\n/).find(row=>row.startsWith('function '+name+'('));assert(line,'production '+name+' exists');vm.runInContext(line,context)}
}
 const fields=new Map(),track={scrollLeft:72};h.grid.querySelectorAll=()=>[];h.grid.scrollTop=1234;
 const $=selector=>selector==='#grid'?h.grid:selector==='#featured-track'?track:fields.get(selector)||fields.set(selector,{value:'',scrollIntoView(){}}).get(selector);
 const page={scrollTop:456,scrollLeft:12},scrolls=[];h.document.scrollingElement=page;h.document.documentElement={style:{scrollBehavior:'smooth'}};h.document.body={classList:{toggle(){}}};h.document.querySelectorAll=()=>[];
 h.document.querySelector=selector=>selector==='.reels-header'?h.header:selector==='#grid'?h.grid:selector==='dialog[open]'&&h.state.blocked?{}:null;h.document.createElement=()=>new Surface('span');
 h.view.scrollX=12;h.view.scrollY=456;h.view.scrollTo=options=>scrolls.push(options);
 const p={document:h.document,window:h.view,$,reelsMode:false,tab:'fav',catalogLimit:72,recommendationSession:null,feedTouchActive:false,feedWindowStart:0,feedWindowLength:5,feedPageHeight:600,visibleLots:Array.from({length:100},(_,i)=>({id:i+1})),ADV_IDS:['price-min','radius'],keywordCategoryQuery:'красный седан',keywordCategoryAuto:'cars',keywordCategoryAutomatic:true,cars:[],saved:[],syncSearchFields(){},cancelFeedSettle(){},resetDiscoverySession(){},render(){if(p.reelsMode)h.grid.scrollTop=0}};
 for(const id of ['category','region-filter','brand','budget','city','search','sort'])$('#'+id).value=id==='search'?'красный седан':id==='sort'?'low':'saved-'+id;
 $('#adv-price-min').value='100000';$('#adv-radius').value='500';
 vm.createContext(p);installRegionRestore(p);p.setRegionValue("78,77,77");assert.equal($("#region-filter").value,"77,78");
 const setStart=html.indexOf('function setReels('),setEnd=html.indexOf("\n$('#open-reels')",setStart);assert(setStart>=0&&setEnd>setStart);vm.runInContext(html.slice(setStart,setEnd),p);
 const localStart=html.indexOf('function openLocalFeed()'),localEnd=html.indexOf('function openFeaturedFeed(',localStart);vm.runInContext(html.slice(localStart,localEnd),p);
 for(const [name,next]of[['clampFeedIndex','reelWindowIndices'],['activeFeedIndex','mountReelWindow'],['lotStep','swipeIndex'],['swipeIndex','updateSwipePosition']]){const start=html.indexOf('function '+name+'('),end=html.indexOf('function '+next+'(',start);assert(start>=0&&end>start,name);vm.runInContext(html.slice(start,end),p)}
 for(const selector of ['#open-reels','#home-open-feed']){const start=html.indexOf("$('"+selector+"').onclick=");assert(start>=0);vm.runInContext(html.slice(start,html.indexOf(';',start)+1),p)}
 vm.runInContext(source,p);
 const touch=(target,x,y,time,end=false)=>h.event(target,x,y,time,end);
 const pull=()=>{h.document.listeners.get('touchstart').handler(touch(h.photo,180,260,0));h.document.listeners.get('touchmove').handler(touch(h.photo,180,400,100));h.document.listeners.get('touchend').handler(touch(h.photo,180,400,1400,true))};
 for(const selector of ['#open-reels','#home-open-feed']){
  const original={region:$('#region-filter').value,query:$('#search').value,category:$('#category').value,sort:$('#sort').value,minimum:$('#adv-price-min').value,radius:$('#adv-radius').value,tab:p.tab,limit:p.catalogLimit};h.grid.scrollTop=1234;track.scrollLeft=72;p.feedWindowStart=0;$(selector).onclick();assert.equal(p.reelsMode,true);assert.equal(p.activeFeedIndex(),0);pull();assert.equal(p.reelsMode,false,'first-lot pull closes actual '+selector+' feed');assert.equal(h.grid.scrollTop,1234);assert.equal(track.scrollLeft,72);assert.equal($('#region-filter').value,original.region,'return preserves selected regions');assert.match($('#region-filter').innerHTML,/value="77,78" selected/,'restored multi-region option exists');assert.equal($('#search').value,original.query);assert.equal($('#category').value,original.category);assert.equal($('#sort').value,original.sort);assert.equal($('#adv-price-min').value,original.minimum);assert.equal($('#adv-radius').value,original.radius);assert.equal(p.tab,original.tab);assert(p.catalogLimit>=original.limit);assert.equal(scrolls.at(-1).top,456);assert.equal(scrolls.at(-1).left,12);
 }
 $('#open-reels').onclick();p.feedWindowStart=50;h.grid.scrollTop=0;assert.equal(p.activeFeedIndex(),50);pull();assert.equal(p.reelsMode,true,'zero scroll offset of a later virtual window is not first item');p.setReels(false);
 $('#open-reels').onclick();p.feedWindowStart=0;h.grid.scrollTop=0;h.document.listeners.get('touchstart').handler(touch(h.photo,180,260,0));p.setReels(false);$('#open-reels').onclick();h.document.listeners.get('touchmove').handler(touch(h.photo,180,400,100));h.document.listeners.get('touchend').handler(touch(h.photo,180,400,200,true));assert.equal(p.reelsMode,true,'a gesture from the old feed entry cannot dismiss a reopened entry');
}
console.log('PASS: first-lot photo/body pull-down and slow left/right returns preserve native gallery/feed directions, true virtual boundary, controls, selection/modal/context cancellation and actual catalog/filter/scroll restoration. No physical Safari/device test claimed.');

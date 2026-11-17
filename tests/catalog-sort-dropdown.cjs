const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const script=fs.readFileSync(path.join(__dirname,'../dist/catalog-sort-dropdown.js'),'utf8');
function boot(fail=false){
 const h=setup({mobile:false}),{context,document,Element}=h;
 const toolbar=h.add('catalog-toolbar'),select=h.add('sort','select',toolbar);select.setAttribute('aria-label','Сортировка');select.className='sort';
 const texts=['Сначала ближайшие','По категориям','Сначала дешевле','Сначала дороже'];
 const values=['nearest','popular','low','high'];
 select.options=values.map((value,i)=>{const o=document.createElement('option');o.value=value;o.label=texts[i];o.textContent=texts[i];select.appendChild(o);return o});
 let selected=0;Object.defineProperty(select,'selectedIndex',{get:()=>selected,set:v=>selected=Number(v)});Object.defineProperty(select,'value',{get:()=>select.options[selected]?.value||'',set:v=>selected=select.options.findIndex(o=>o.value===v)});
 context.innerWidth=1366;context.innerHeight=900;document.documentElement.clientWidth=1366;h.viewport.width=1366;h.viewport.height=900;
 context.getComputedStyle=node=>({display:node.hidden?'none':'block'});h.viewport.offsetTop=0;h.viewport.offsetLeft=0;
 let changes=0,inputs=0;select.onchange=()=>{changes++};select.addEventListener('input',()=>inputs++);
 select.dispatchEvent=e=>{(select.events[e.type]||[]).forEach(fn=>fn(e));select['on'+e.type]?.(e);return true};
 if(fail){const append=document.body.appendChild;document.body.appendChild=function(n){if(n.id==='catalog-sort-options')throw Error('fixture insertion failure');return append.call(this,n)};context.console={warn(){}}}
 vm.runInContext(script,context);
 const trigger=document.getElementById('catalog-sort-trigger'),panel=document.getElementById('catalog-sort-options');
 if(trigger)trigger.getBoundingClientRect=()=>({left:1000,right:1220,top:250,bottom:294,width:220,height:44});
 if(panel)panel.scrollHeight=200;
 const key=(name,extras={})=>{const e={type:'keydown',key:name,target:trigger,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},...extras};trigger.dispatchEvent(e);return e};
 const click=()=>{trigger.focus();h.click(trigger)};
 return {...h,select,trigger,panel,key,click,counts:()=>({changes,inputs})};
}
const h=boot(),{context,select,trigger,panel,key,document}=h;
const selected=()=>panel.children.find(n=>n.getAttribute('aria-selected')==='true');
const active=()=>trigger.getAttribute('aria-activedescendant');
assert(select.hidden);assert.equal(trigger.getAttribute('role'),'combobox');assert.equal(trigger.getAttribute('aria-label'),'Сортировка: Сначала ближайшие');assert.equal(panel.parentElement,document.body,'portal avoids ancestor clipping');
h.click();assert(!panel.hidden);assert.equal(selected().id,'catalog-sort-option-0');assert.equal(document.activeElement,trigger);assert.equal(active(),'catalog-sort-option-0');
key('ArrowDown');key('ArrowDown');assert.equal(active(),'catalog-sort-option-2');assert.equal(select.value,'nearest','highlighting does not sort until committed');assert.deepEqual(h.counts(),{changes:0,inputs:0});
key('Escape');assert(panel.hidden);assert.equal(select.value,'nearest');assert.equal(document.activeElement,trigger);
key('End');assert.equal(active(),'catalog-sort-option-3');key('Enter');assert(panel.hidden);assert.equal(select.value,'high');assert.deepEqual(h.counts(),{changes:1,inputs:1});assert.equal(trigger.getAttribute('aria-label'),'Сортировка: Сначала дороже');
h.click();key('Enter');assert.deepEqual(h.counts(),{changes:1,inputs:1},'same option does not dispatch redundant change');
h.click();key('Home');key('Tab');assert(panel.hidden);assert.equal(select.value,'nearest');assert.deepEqual(h.counts(),{changes:2,inputs:2});
select.options[1].disabled=true;h.click();key('ArrowDown');assert.equal(active(),'catalog-sort-option-2');panel.children[1].dispatchEvent({type:'click'});assert(!panel.hidden);assert.equal(select.value,'nearest');
panel.children[2].dispatchEvent({type:'click'});assert(panel.hidden);assert.equal(select.value,'low');assert.deepEqual(h.counts(),{changes:3,inputs:3});
select.value='high';h.notify();assert.equal(trigger.getAttribute('aria-label'),'Сортировка: Сначала дороже','programmatic render/reset synchronises the label without emitting a new sort');assert.deepEqual(h.counts(),{changes:3,inputs:3});
h.click();select.value='nearest';h.notify();assert(panel.hidden,'external reset closes stale pending choice');assert.equal(trigger.getAttribute('aria-label'),'Сортировка: Сначала ближайшие');
h.click();const outside=h.add('outside-sort','button');outside.focus();h.event('pointerdown',outside);assert(panel.hidden);assert.equal(document.activeElement,outside,'outside click does not steal focus');
h.click();outside.focus();h.event('focusin',outside);assert(panel.hidden,'keyboard focus may leave the combobox');
select.disabled=true;h.notify();assert(trigger.disabled);h.click();assert(panel.hidden);select.disabled=false;h.notify();
h.click();key('с');key('н');assert.equal(active(),'catalog-sort-option-0');key('Escape');
h.click();select.options[0]=Object.assign(document.createElement('option'),{value:'replacement',label:'Другая сортировка'});panel.children[0].dispatchEvent({type:'click'});assert(panel.hidden);assert.deepEqual(h.counts(),{changes:3,inputs:3},'stale detached option cannot alter the catalogue');
select.options[0].value='nearest';select.options[0].label='Сначала ближайшие';
// Geometry: clamp narrow viewports, flip above the dock, and follow the visual viewport.
for(const [width,height,left,top,dockTop]of [[1366,900,1150,250,null],[390,800,220,650,720],[320,640,10,480,560]]){
 document.documentElement.clientWidth=width;h.viewport.width=width;h.viewport.height=height;
 trigger.getBoundingClientRect=()=>({left,right:left+160,top,bottom:top+44,width:160,height:44});
 let dock=document.getElementById('quick-access');if(!dock)dock=h.add('quick-access','nav');dock.hidden=dockTop===null;dock.getBoundingClientRect=()=>({top:dockTop,height:76});
 h.click();assert(!panel.hidden);const x=parseFloat(panel.style.left),y=parseFloat(panel.style.top),w=parseFloat(panel.style.width),max=parseFloat(panel.style.maxHeight);
 assert(x>=10&&x+w<=width-10,'menu fits horizontal viewport');assert(y>=10);assert(y+Math.min(panel.scrollHeight,max)<=(dockTop??height)-10,'options stay above the quickbar');if(dockTop)assert.equal(panel.dataset.placement,'above');key('Escape');
}
h.click();h.body.classList.add('reels');h.notify();assert(panel.hidden,'entering the fullscreen feed closes the catalog menu');
const failure=boot(true);assert(!failure.select.hidden,'initialisation failure keeps native sort available');assert(!failure.select.classList.contains('catalog-sort-native'));
console.log('PASS: catalog sorter preserves native change handlers, commits once, cancels safely, supports keys/typeahead/disabled/stale options/programmatic reset, clamps and flips above mobile navigation, and falls back to native select on failure.');

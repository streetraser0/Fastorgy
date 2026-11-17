const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const h=setup({mobile:false}),{context,document,Element}=h;
Element.prototype.insertAdjacentElement=function(where,node){const parent=this.parentElement,index=parent.children.indexOf(this);node.parentElement=parent;parent.children.splice(index+1,0,node)};
const native=h.add('category','select',h.document.querySelector('#filters'));native.value='cars';
context.escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
context.cars=[{id:1,category:'cars',name:'Автомобиль'},{id:2,category:'property',subcategory:'houses',name:'Дом'},{id:3,category:'other',subcategory:'phones',name:'Телефон'}];
context.FasDesktopWeb={active:()=>true};let changes=0,visible=[],keyword='';
native.onchange=()=>{changes++;visible=context.cars.filter(lot=>context.FasCategories.matches(lot,native.value)).map(lot=>lot.id)};
context.FasGlobalSearch=query=>keyword=query;
for(const name of ['category-tree.js','category-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),context);
const panel=document.querySelector('#category-dropdown-panel'),modal=document.querySelector('#category-picker'),trigger=document.querySelector('[data-browse-categories]'),anchor=trigger.parentElement,UI=context.FasCategoryUI;
const q=selector=>panel.querySelector(selector),click=selector=>{const target=q(selector);assert(target,selector);const event={type:'click',target,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};panel.dispatchEvent(event);if(!event.stopped)for(const fn of h.docEvents.click||[])fn(event);h.flush()};
const key=(key,target=trigger)=>anchor.dispatchEvent({type:'keydown',key,target,preventDefault(){this.defaultPrevented=true},stopPropagation(){}});
const open=()=>{trigger.focus();h.click(trigger);assert(!panel.hidden);assert(!modal.open);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(document.activeElement.id,'category-dropdown-search');assert(!document.body.classList.contains('category-picker-open'))};
assert.equal(trigger.getAttribute('aria-controls'),'category-dropdown-panel');assert.equal(panel.tagName,'DIV');assert.equal(native.parentElement,anchor);
open();const baseline=changes;const emptyEnter={key:'Enter',preventDefault(){this.prevented=true}};q('#category-dropdown-search').onkeydown(emptyEnter);assert(emptyEnter.prevented,'empty search Enter cannot submit the surrounding catalogue form');assert(!panel.hidden);
click('[data-category-node="real_estate"]');assert(!panel.hidden,'group navigation stays open after the replaced target bubbles');assert.equal(native.value,'cars','opening a group in the dropdown does not apply the desktop tile filter');assert.equal(changes,baseline);
click('[data-category-toggle="houses"]');assert(!panel.hidden,'checkbox staging stays open after the replaced target bubbles');assert.equal(native.value,'cars');assert.equal(document.activeElement.dataset.categoryToggle,'houses','re-rendered checkbox retains keyboard focus');
key('Escape',document.activeElement);assert(panel.hidden);assert.equal(document.activeElement,trigger);assert.equal(native.value,'cars');
open();click('[data-category-node="transport"]');assert(q('[data-category-toggle="cars"]').checked,'cancelled draft is reset to the applied selection');click('[data-category-back]');click('[data-category-clear-all]');assert(q('[data-category-apply]').disabled);
click('[data-category-toggle="electronics"]');click('[data-category-node="real_estate"]');click('[data-category-toggle="houses"]');click('[data-category-apply]');assert(panel.hidden);assert.equal(document.activeElement,trigger);assert.equal(changes,baseline+1);assert.deepEqual(visible,[2,3],'applying combined group and leaf filters the actual category tree');
const committed=native.value;open();click('[data-category-clear-all]');const outside=h.add('outside-search','button');outside.focus();for(const fn of h.docEvents.pointerdown||[])fn({target:outside});assert(panel.hidden);assert.equal(native.value,committed);assert.equal(document.activeElement,outside,'outside pointer dismissal does not steal focus from Find');
open();click('[data-category-clear-all]');h.click(trigger);assert(panel.hidden);assert.equal(native.value,committed,'trigger toggling cancels the draft');
open();outside.focus();anchor.dispatchEvent({type:'focusout',relatedTarget:outside});assert(panel.hidden);assert.equal(document.activeElement,outside,'Tab-away does not trap focus');
key('ArrowDown');assert(!panel.hidden);assert.equal(document.activeElement.id,'category-dropdown-search');click('[data-category-select-all]');click('[data-category-apply]');assert.equal(native.value,'');assert.deepEqual(visible,[1,2,3]);
open();q('#category-dropdown-search').oninput({target:{value:'телефон'}});assert(q('[data-category-node="phones"]'));assert(!q('[data-category-node="houses"]'));click('[data-category-node="phones"]');assert.equal(native.value,'phones');assert.deepEqual(visible,[3]);
open();q('#category-dropdown-search').oninput({target:{value:'дом'}});q('#category-dropdown-search').onkeydown({key:'Enter',preventDefault(){}});assert(panel.hidden);assert.equal(keyword,'дом','keyword search keeps its existing route');
// A catalog update closes an outdated pending selection instead of applying stale filters later.
open();click('[data-category-clear-all]');UI.setValue('cars');UI.sync();assert(panel.hidden);assert.equal(native.value,'cars');
// Switching surfaces keeps the seller picker modal and does not duplicate search IDs.
open();h.modal.open=true;h.content.innerHTML='<textarea>Несохранённое объявление</textarea>';let selected='';
UI.open({purpose:'sell',onSelect:id=>selected=id});assert(panel.hidden);assert(modal.open);assert(h.modal.open);assert.equal(document.querySelectorAll('#category-tree-search').length,1);assert.equal(document.querySelectorAll('#category-dropdown-search').length,1);
modal.dispatchEvent({type:'click',target:modal.querySelector('[data-category-node="real_estate"]')});modal.dispatchEvent({type:'click',target:modal.querySelector('[data-category-node="houses"]')});assert.equal(selected,'houses');assert(h.modal.open);assert(h.content.innerHTML.includes('Несохранённое'));assert.equal(native.value,'cars');h.modal.open=false;
// The panel stays under its anchor and clamps horizontally at narrow and wide viewports.
for(const [width,left,anchorWidth,panelWidth]of [[1366,980,220,440],[850,580,220,440],[390,210,145,366]]){
 document.documentElement.clientWidth=width;anchor.getBoundingClientRect=()=>({left,bottom:250,width:anchorWidth});panel.getBoundingClientRect=()=>({width:panelWidth});open();const actual=left+parseFloat(panel.style.left);assert(actual>=8);assert(actual+panelWidth<=width-8);key('Escape');
}
console.log('PASS: anchored category dropdown opens without a modal, stages groups and checkboxes, applies actual multi-category filters, handles search/Escape/outside/Tab/toggle, preserves seller dialogs and clamps to 1366/850/390 viewports.');

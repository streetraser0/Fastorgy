const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const h=setup({mobile:true}),{context,document,Element}=h;
Element.prototype.insertAdjacentElement=function(where,node){if(where==='afterend'&&this.parentElement){const parent=this.parentElement,index=parent.children.indexOf(this);node.parentElement=parent;parent.children.splice(index+1,0,node)}else this.appendChild(node)};
const native=h.add('category','select');native.value='electronics';let categoryChanges=0;
native.onchange=()=>categoryChanges++;
context.escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
context.cars=[{id:1,category:'cars',brand:'Toyota',model:'Camry',name:'Toyota Camry',city:'Воронеж'},{id:2,category:'property',name:'Квартира',city:'Москва'},{id:3,category:'other',subcategory:'phones',name:'Телефон'}];
const queries=[];context.FasGlobalSearch=query=>queries.push(query);
for(const name of ['category-tree.js','search-typos.js','search-intent.js','keyword-search.js','category-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),context);
const picker=document.querySelector('#category-picker'),UI=context.FasCategoryUI;
function type(value){picker.querySelector('#category-tree-search').oninput({target:{value}})}
function choose(selector){const node=picker.querySelector(selector);assert(node,selector);picker.dispatchEvent({type:'click',target:node,preventDefault(){}});return node}

for(const query of ['Toyota','Тойота']){
 UI.open({purpose:'browse',group:'electronics'});type(query);
 assert(picker.querySelector('[data-search-keywords]'),'global keyword action exists for '+query);
 assert(picker.querySelector('[data-category-node="cars"]'),'real car category matches '+query);
 assert(!picker.innerHTML.includes('Категория не найдена'),'no category-only dead end');
 assert.equal(queries.length,query==='Toyota'?0:1,'typing never executes a search');
 choose('[data-search-keywords]');assert.equal(queries.at(-1),query);assert.equal(picker.open,false);
 assert.equal(native.value,'electronics','the global search callback controls filters');
}
assert.equal(categoryChanges,0);

UI.open({purpose:'browse'});type('  diesel truck Voronezh  ');
let prevented=false;const input=picker.querySelector('#category-tree-search');
input.onkeydown({key:'Enter',isComposing:true,preventDefault(){prevented=true}});assert.equal(queries.length,2);assert.equal(prevented,false,'IME confirmation is not a search');
input.onkeydown({key:'Enter',isComposing:false,preventDefault(){prevented=true}});assert.equal(queries.at(-1),'diesel truck Voronezh');assert.equal(prevented,true);assert.equal(picker.open,false);

UI.open({purpose:'browse'});type('not-a-known-category');assert(picker.querySelector('[data-search-keywords]'),'arbitrary lot keywords remain searchable');
type('\"><img src=x onerror=alert(1)>');assert(picker.querySelector('[data-search-keywords]'));
assert(picker.querySelector('.category-browser-list').innerHTML.includes('&lt;img'));
assert(picker.querySelectorAll('img').every(img=>!img.hasAttribute('onerror')),'query text cannot create executable markup');

// Placement remains a category chooser above the unsaved form, even for brand queries.
h.modal.open=true;h.content.innerHTML='<form><textarea>Не потерять описание</textarea></form>';const original=h.content.innerHTML;let selected;
UI.open({purpose:'sell',value:'phones',onSelect:(id,node)=>selected={id,node}});type('Тойота');
assert(!picker.querySelector('[data-search-keywords]'));
assert(picker.querySelector('[data-category-node="cars"]'));choose('[data-category-node="cars"]');assert.equal(selected.id,'cars');assert.equal(h.content.innerHTML,original);assert.equal(h.modal.open,true);assert.equal(queries.length,3);
UI.open({purpose:'sell',onSelect:(id,node)=>selected={id,node}});type('phone');choose('[data-category-node="phones"]');assert.equal(selected.id,'phones');assert.equal(selected.node.legacyCategory,'other');assert.equal(h.content.innerHTML,original);

UI.open({purpose:'browse',group:'electronics'});type('phone');choose('[data-category-back]');assert(picker.open);assert.equal(picker.querySelector('#category-tree-search').value,'');assert(picker.querySelector('[data-category-node="transport"]'));assert(!picker.querySelector('[data-search-keywords]'));
for(const query of ['Ситрак','SITRAK','Ситрк','cbnhfr']){
 UI.open({purpose:'browse'});type(query);
 assert(picker.querySelector('[data-category-node="trucks"]'),'commercial name or correction suggests the truck category');
 assert(!picker.querySelector('[data-category-node="cars"]'),'commercial-only brand does not suggest passenger cars');
 choose('[data-category-close]');
}
console.log('PASS: bilingual category keywords route to all-lot search, safe Enter/IME and escaping, while placement/back preserve the current form.');

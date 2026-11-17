const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const h=setup({mobile:true}),{context,document,Element}=h;
const originalSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){originalSet.call(this,k,v);if(k==='disabled')this.disabled=true;if(k==='hidden')this.hidden=true};
Element.prototype.insertAdjacentElement=function(where,node){if(where==='afterend'&&this.parentElement){const p=this.parentElement,i=p.children.indexOf(this);node.parentElement=p;p.children.splice(i+1,0,node)}else this.appendChild(node)};
const native=h.add('category','select');native.onchange=()=>context.categoryChanges++;
context.categoryChanges=0;context.escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
context.cars=[{id:1,category:'cars',name:'Автомобиль'},{id:2,category:'property',name:'Дом с участком'},{id:3,category:'other',subcategory:'phones',name:'Телефон'}];
for(const name of ['category-tree.js','category-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),context);
const picker=document.querySelector('#category-picker'),UI=context.FasCategoryUI;
const choose=selector=>{const node=picker.querySelector(selector);assert(node,selector);picker.dispatchEvent({type:'click',target:node,preventDefault(){}});h.flush()};
// A nested category dialog must preserve the existing seller editor and its unsaved input.
h.modal.open=true;h.content.innerHTML='<form id="unchanged-editor"><textarea>Мой несохранённый текст</textarea></form>';const before=h.content.innerHTML;let selected;
UI.open({purpose:'sell',value:'cars',onSelect:(id,node)=>selected={id,node}});assert(picker.open);assert(h.modal.open);assert.equal(h.content.innerHTML,before);
for(const id of ['work','services','personal','parts','hobby','animals'])assert(!picker.querySelector('[data-category-node="'+id+'"]'),id+' is removed from placement');assert(picker.querySelector('[data-category-node="electronics"]'));
choose('[data-category-node="real_estate"]');choose('[data-category-node="houses"]');assert.equal(selected.id,'houses');assert.equal(selected.node.legacyCategory,'property');assert.equal(picker.open,false);assert.equal(h.modal.open,true);assert.equal(h.content.innerHTML,before);
// Tapping blank surfaces dismisses only the picker, keeping the previous editor intact.
const editor=h.content.querySelector('#unchanged-editor'),description=editor.querySelector('textarea'),returnTo=h.add('category-return-focus','button',h.content);
description.value='Текст, введённый без сохранения';h.modal.scrollTop=410;h.grid.scrollTop=925;
const changesBeforeBlank=context.categoryChanges;
for(const selector of ['dialog','.category-browser','.category-browser-list','.category-brand','.category-browser-head']){
 returnTo.focus();UI.open({purpose:'sell',value:'cars',onSelect(){throw Error('Dismissal must not select a category')}});
 choose('[data-category-node="real_estate"]');
 const target=selector==='dialog'?picker:picker.querySelector(selector),event={type:'click',target,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};
 picker.dispatchEvent(event);h.flush();
 assert.equal(picker.open,false,selector+' closes the picker even within a group');assert.equal(h.modal.open,true);
 assert.equal(h.content.querySelector('#unchanged-editor'),editor);assert.equal(description.value,'Текст, введённый без сохранения');
 assert.equal(h.modal.scrollTop,410);assert.equal(h.grid.scrollTop,925);assert.equal(document.activeElement,returnTo);
 assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true,'dismissal cannot propagate into the underlying window');
 assert(!document.body.classList.contains('category-picker-open'));
}
assert.equal(context.categoryChanges,changesBeforeBlank,'blank dismissal does not alter category filters');
UI.open({purpose:'sell',value:'cars'});
const contentTargets=[['#category-tree-search',picker.querySelector('#category-tree-search')],['.category-browser-search',picker.querySelector('.category-browser-search')],['brand image',picker.querySelector('.category-brand').querySelector('img')],['heading',picker.querySelector('.category-browser-head').querySelector('h2')]];
for(const [selector,target] of contentTargets){
 assert(target,selector);picker.dispatchEvent({type:'click',target,preventDefault(){throw Error('A control or visible content is not a blank surface')}});
 assert(picker.open,selector+' remains usable');
}
picker.dispatchEvent({type:'click',target:picker.querySelector('.category-browser'),defaultPrevented:true});assert(picker.open,'consumed gesture clicks do not close the picker');
choose('[data-category-node="transport"]');assert(picker.open,'category row navigation still works');choose('[data-category-close]');
// Browsing accepts a whole group and resets only the tab/category through the main onchange route.
h.modal.open=false;context.tab='fav';UI.open({purpose:'browse'});choose('[data-category-node="transport"]');choose('[data-category-use="transport"]');assert.equal(native.value,'transport');assert.equal(context.tab,'all');assert.equal(context.categoryChanges,1);assert.equal(picker.open,false);
UI.open({purpose:'browse'});picker.querySelector('#category-tree-search').oninput({target:{value:'телефон'}});assert(picker.querySelector('[data-category-node="phones"]'));assert(!picker.querySelector('[data-category-node="houses"]'));choose('[data-category-node="phones"]');assert.equal(native.value,'phones');
// A previously saved private draft migrates its hidden fields, while keeping the description and media owned by the editor.
for(const subcategory of ['shoes','auto_parts','sports','pet_supplies']){const draft={category:'other',subcategory,name:'Сохранённое имущество',description:'Моё описание',mediaRefs:[{id:'saved-photo'}]},original=JSON.stringify(draft),field=h.add('retired-'+subcategory,'div',h.content);field.innerHTML=UI.fieldHTML(draft,'seller');assert.equal(field.querySelector('[name="category"]').getAttribute('value'),'other');assert.equal(field.querySelector('[name="subcategory"]').getAttribute('value'),'other');assert(field.innerHTML.includes('Прочее имущество'));assert.equal(JSON.stringify(draft),original,'rendering preserves unsaved draft metadata')}
// Home goods are available for both seller selection and restoration of a previously migrated draft.
UI.open({purpose:'sell',onSelect:(id,node)=>selected={id,node}});assert(picker.querySelector('[data-category-node="home_garden"]'));choose('[data-category-node="home_garden"]');choose('[data-category-node="furniture"]');assert.equal(selected.id,'furniture');assert.equal(selected.node.groupId,'home_garden');
const restoredField=h.add('restored-home-field','div',h.content);restoredField.innerHTML=UI.fieldHTML({category:'other',subcategory:'other',previousSubcategory:'furniture'},'seller');assert.equal(restoredField.querySelector('[name="subcategory"]').getAttribute('value'),'furniture');assert(restoredField.innerHTML.includes('Товары для дома'));
// Bank placement updates both the compatibility field and the selected leaf, together.
const form=h.add('bank-category-form','form',h.content);form.innerHTML=UI.fieldHTML({category:'cars'},'bank');form.elements={namedItem:name=>form.querySelector('[name="'+name+'"]')};for(const input of form.querySelectorAll('input'))input.value=input.getAttribute('value')||'';
h.modal.open=true;h.click(form.querySelector('[data-category-form="bank"]'));choose('[data-category-node="real_estate"]');choose('[data-category-node="houses"]');assert.equal(form.elements.namedItem('category').value,'property');assert.equal(form.elements.namedItem('subcategory').value,'houses');assert(h.modal.open);
console.log('PASS: category picker hides retired sections, retains electronics and home, preserves seller editor, restores home drafts and migrates retired draft fields and synchronizes bank category fields.');

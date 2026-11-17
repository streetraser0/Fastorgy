/* One category tree for discovery, search and asset placement. */
(()=>{
 const T=window.FasCategories;if(!T)return;
 const esc=escapeText,qs=selector=>document.querySelector(selector);
 const modalPicker=document.createElement('dialog');modalPicker.id='category-picker';modalPicker.className='category-dialog';modalPicker.setAttribute('aria-label','Выбор категории');document.body.appendChild(modalPicker);
 const dropdown=document.createElement('div');dropdown.id='category-dropdown-panel';dropdown.className='category-dropdown-panel';dropdown.hidden=true;dropdown.setAttribute('role','group');dropdown.setAttribute('aria-label','Выбор категорий имущества');
 let picker=modalPicker,current=null,origin=null,totals=new Map(),totalLots=0,selectionExplicit=false,dropdownAnchor=null,dropdownTrigger=null,openedValue='';
 const isDropdown=()=>picker===dropdown,isOpen=()=>isDropdown()?!dropdown.hidden:modalPicker.open;
 const searchField=()=>picker.querySelector('.category-browser-search')?.querySelector('input');
 function finishClose(returnFocus=true){const previousOrigin=origin;current=null;origin=null;document.body.classList.remove('category-picker-open');sync();if(returnFocus&&previousOrigin?.isConnected)previousOrigin.focus?.({preventScroll:true})}
 function closePicker(returnFocus=true){
  if(!isOpen())return;
  if(isDropdown()){dropdown.hidden=true;finishClose(returnFocus)}
  else{if(!returnFocus)origin=null;modalPicker.close();if(current&&picker===modalPicker&&!modalPicker.open)finishClose(returnFocus)}
 }
 function positionDropdown(){
  if(dropdown.hidden||!dropdownAnchor)return;
  const anchor=dropdownAnchor.getBoundingClientRect(),viewport=document.documentElement.clientWidth||window.innerWidth,width=dropdown.getBoundingClientRect().width,height=(window.visualViewport?.height||window.innerHeight)+(window.visualViewport?.offsetTop||0);
  if(Number.isFinite(viewport)&&Number.isFinite(width))dropdown.style.left=Math.max(8-anchor.left,Math.min(0,viewport-8-anchor.left-width))+'px';
  if(Number.isFinite(height))dropdown.style.setProperty('--category-panel-height',Math.max(180,Math.min(540,height-anchor.bottom-16))+'px');
 }
 function rebuildCounts(){totals=new Map();totalLots=0;for(const lot of cars){if(!isLotLive(lot))continue;const id=T.canonicalId(lot),group=T.groupOf(lot)?.id;totalLots++;if(id)totals.set(id,(totals.get(id)||0)+1);if(group)totals.set(group,(totals.get(group)||0)+1)}}
 const count=id=>id?totals.get(id)||0:totalLots;
 const expand=value=>{const ids=T.selection(value);if(ids===null)return new Set();return new Set((ids.length?ids:T.groups().map(group=>group.id)).flatMap(id=>{const node=T.get(id);return node?.kind==='group'?node.children.map(child=>child.id):node?[id]:[]}))};
 function setValue(value){
  if(typeof window.FasSetCategoryValue==='function')return window.FasSetCategoryValue(value);
  const select=qs('#category'),normalized=T.selectionValue(value);
  select.innerHTML=T.optionsHTML(normalized??'',{includeAll:true,includeGroups:true});
  if(normalized===null){const option=document.createElement('option');option.value='__invalid_category__';option.textContent='Категория недоступна';select.appendChild(option);select.value=option.value;return false}
  select.value=normalized;return normalized;
 }
 function checkState(id){const node=T.get(id),ids=node.kind==='group'?node.children.map(child=>child.id):[id],selected=ids.filter(value=>current.pending.has(value)).length;return {all:selected===ids.length,some:selected>0&&selected<ids.length,ids}}
 function toggle(id){const state=checkState(id);for(const value of state.ids)if(state.all)current.pending.delete(value);else current.pending.add(value);renderPicker(current.query,'none');picker.querySelector('[data-category-toggle="'+id+'"]')?.focus?.({preventScroll:true})}
 function syncFooter(){const footer=picker.querySelector('.category-multi-actions');if(!footer)return;const size=current.pending.size;footer.querySelector('[data-category-selection-count]').textContent=size===T.leaves().length?'Выбраны все категории':'Выбрано видов имущества: '+size;footer.querySelector('[data-category-apply]').disabled=!size}

 function fieldHTML(data={},scope='seller'){
  const leaf=T.canonicalId(data)||'cars',base=T.legacyCategory(leaf)||'cars';
  return `<label class="seller-field">Категория имущества<input type="hidden" name="category" value="${esc(base)}"><input type="hidden" name="subcategory" value="${esc(leaf)}"><button type="button" class="category-picker-trigger" data-category-form="${scope}" aria-haspopup="dialog" aria-controls="category-picker"><span>${esc(T.label(leaf))}</span>${uiIcon('chevron-right')}</button><small class="category-path">${esc(T.groupOf(leaf)?.label||'')}</small><span class="seller-field-error" data-error-for="category"></span></label>`;
 }
 function row(node){const group=node.kind==='group',blocked=current.purpose==='sell'&&!T.isAuction(node.id),total=count(node.id),selected=current.value===node.id;
  const button=`<button type="button" class="category-browser-row" data-category-node="${esc(node.id)}" ${blocked?'disabled':''} ${selected?'aria-current="true"':''}>${group?`<img src="assets/categories/${node.id}.webp" alt="" width="48" height="48">`:''}<span class="category-row-label"><strong>${esc(node.label)}</strong>${node.mode==='directory'?'<small>Раздел объявлений · без имущественных аукционов</small>':''}</span>${current.purpose==='browse'?`<span class="category-row-count">${total?total.toLocaleString('ru-RU'):''}</span>`:''}${uiIcon(group?'chevron-right':selected?'check':'chevron-right')}</button>`;
  if(current.purpose==='sell')return button;const state=checkState(node.id);
  return `<div class="category-multi-row"><label class="category-multi-checkbox"><input type="checkbox" data-category-toggle="${esc(node.id)}" ${state.all?'checked':''} aria-checked="${state.some?'mixed':state.all}" aria-label="Выбрать ${esc(node.label)}"></label>${button}</div>`;
 }
 function renderPicker(query='',direction='none'){
  if(!current)return;current.query=String(query).trim().slice(0,300);const term=current.query.toLocaleLowerCase('ru').replace(/ё/g,'е'),group=current.group?T.get(current.group):null,search=window.FasKeywordSearch,compiled=term&&search?.compile?.(current.query);
  const nodes=term?T.leaves().filter(node=>search?.matchesCategory?search.matchesCategory(node,compiled||current.query,T.groupOf(node.id)?.label||''):(node.label+' '+T.groupOf(node.id).label).toLocaleLowerCase('ru').replace(/ё/g,'е').includes(term)):group?T.leaves(group.id):T.groups();
  const keywordAction=current.purpose==='browse'&&term?`<button type="button" class="category-browser-row category-keyword-action" data-search-keywords>${uiIcon('search')}<span class="category-row-label"><strong>Найти лоты «${esc(current.query)}»</strong><small>Все виды имущества · русский и английский</small></span>${uiIcon('chevron-right')}</button>`:'';
  const list=picker.querySelector('.category-browser-list');list.innerHTML=keywordAction+(current.purpose==='browse'&&!term?`<button type="button" class="category-browser-row" data-category-use="${group?group.id:''}"><span class="category-row-label"><strong>${group?'Весь раздел «'+esc(group.label)+'»':'Все категории'}</strong></span><span class="category-row-count">${count(group?.id||'').toLocaleString('ru-RU')}</span>${uiIcon('chevron-right')}</button>`:'')+nodes.map(row).join('')||'<div class="category-browser-empty">Категория не найдена. Попробуйте другое название или вид имущества.</div>';
  picker.querySelectorAll('[data-category-toggle]').forEach(input=>{const state=checkState(input.dataset.categoryToggle);input.checked=state.all;input.indeterminate=state.some});syncFooter();
  if(isOpen())window.FasMotion?.categoryEnter(list,direction);
  picker.querySelector('.category-browser-head h2').textContent=term&&current.purpose==='browse'?'Поиск лотов':group?.label||'Категория';picker.querySelector('[data-category-back]').setAttribute('aria-label',group?'Вернуться ко всем категориям':'Закрыть выбор категории');
 }
 function open(options={}){
  // Desktop category tiles apply their section immediately; the open picker
  // still lets the buyer narrow it to a child. Seller and callback pickers own
  // their staged choice and must not change the public catalog behind them.
  if(!options.dropdown&&options.purpose!=='sell'&&!options.onSelect&&T.get(options.group)?.kind==='group'&&window.FasDesktopWeb?.active?.()){
   selectBrowse(options.group,{scroll:false});options={...options,value:options.group};
  }
  closePicker(false);picker=options.dropdown?dropdown:modalPicker;rebuildCounts();origin=options.dropdown?dropdownTrigger:document.activeElement;openedValue=qs('#category').value;current={purpose:options.purpose==='sell'?'sell':'browse',value:options.value||'',pending:expand(options.value||''),group:T.get(options.group)?.kind==='group'?options.group:'',onSelect:options.onSelect||null,onSearch:typeof options.onSearch==='function'?options.onSearch:null};
  picker.innerHTML=`<div class="category-browser"><div class="category-browser-head"><button type="button" class="category-back" data-category-back aria-label="Назад">${uiIcon('chevron-left')}</button><h2>Категория</h2><button type="button" class="category-close" data-category-close aria-label="Закрыть">${uiIcon('close')}</button></div><div class="category-brand"><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть"></div><label class="category-browser-search"><input type="search" id="category-tree-search" placeholder="${current.purpose==='browse'?'Категория, марка или ключевые слова':'Категория или вид имущества'}" aria-label="${current.purpose==='browse'?'Поиск лотов и категорий на русском и английском':'Поиск категории имущества'}" autocomplete="off" maxlength="300"></label><div class="category-browser-list"></div>${current.purpose==='sell'?'<div class="category-empty-note">Выберите подкатегорию имущества, которое выставляете на торги.</div>':'<div class="category-multi-actions"><p data-category-selection-count></p><div class="category-multi-tools"><button type="button" data-category-select-all>Выбрать все</button><button type="button" data-category-clear-all>Снять все</button></div><button type="button" class="primary" data-category-apply>Применить выбор</button></div>'}</div>`;
  if(isDropdown())searchField().id='category-dropdown-search';
  renderPicker();picker.scrollTop=0;
  if(isDropdown()){
   dropdown.hidden=false;window.FasRegionSelect?.close?.(false);
   const anchor=dropdownAnchor.getBoundingClientRect(),height=window.visualViewport?.height||window.innerHeight;
   if(Number.isFinite(height)&&height-anchor.bottom<320)dropdownTrigger.scrollIntoView?.({block:'center',behavior:'auto'});
   positionDropdown();sync();searchField().focus({preventScroll:true});
  }else{picker.showModal();window.FasMotion?.dialogEnter(picker);document.body.classList.add('category-picker-open');picker.querySelector('[data-category-back]').focus({preventScroll:true})}
  searchField().oninput=event=>renderPicker(event.target.value,'search');searchField().onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&current?.purpose==='browse'){if(isDropdown()||current.query)event.preventDefault();if(current.query)searchLots()}};
 }
 function searchLots(){if(!current||current.purpose!=='browse'||!current.query)return;const query=current.query,onSearch=current.onSearch;closePicker();if(onSearch){onSearch(query);return}if(typeof window.FasGlobalSearch==='function')window.FasGlobalSearch(query);else{qs('#search').value=query;selectBrowse('')}}
 function choose(id){
  if(!current)return;const node=T.get(id),callback=current.onSelect,purpose=current.purpose;if(purpose==='sell'&&(!node||!T.isAuction(id)||node.kind==='group'))return;
  closePicker();if(callback){callback(id,node);return}selectBrowse(id);
 }
 function selectBrowse(id,options={}){
  if(T.selectionValue(id)===null)return false;if(reelsMode)setReels(false);tab='all';document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.tab==='all'));
  selectionExplicit=true;setValue(id);const result=qs('#category').onchange();if(options.scroll!==false)qs('#lot-results').scrollIntoView?.({block:'start'});sync();return result;
 }
 function sync(){
  const value=qs('#category').value,trigger=qs('[data-browse-categories]');if(!dropdown.hidden&&value!==openedValue){closePicker(false);return}if(trigger){trigger.querySelector('span').textContent=value?T.label(value):'Все категории';trigger.setAttribute('aria-expanded',String(!dropdown.hidden))}dropdownAnchor?.classList.toggle('is-open',!dropdown.hidden);
  document.querySelectorAll('[data-home-category]').forEach(tile=>tile.setAttribute('aria-pressed',String((T.selection(value)||[]).some(id=>T.groupOf(id)?.id===tile.dataset.homeCategory))));
 }
 function onPickerClick(event){
  if(!isOpen()||event.defaultPrevented||!picker.contains(event.target))return;
  // The list re-renders after navigation/checks; its original click target is then detached.
  // Keep this owned event from reaching the document's outside-dismiss handler.
  if(isDropdown())event.stopPropagation?.();
  if(!isDropdown()&&(event.target===picker||event.target.matches?.('.category-browser,.category-browser-list,.category-brand,.category-browser-head'))){event.preventDefault();event.stopPropagation?.();closePicker();return}
  if(current.purpose==='browse'){
   const checkbox=event.target.closest('[data-category-toggle]');if(checkbox){toggle(checkbox.dataset.categoryToggle);return}
   if(event.target.closest('[data-category-select-all]')){current.pending=expand('');renderPicker(current.query);return}
   if(event.target.closest('[data-category-clear-all]')){current.pending.clear();renderPicker(current.query);return}
   if(event.target.closest('[data-category-apply]')){if(current.pending.size){const value=T.selectionValue([...current.pending]);choose(value)}return}
  }
  if(event.target.closest('[data-category-close]')){closePicker();return}
  if(event.target.closest('[data-category-back]')){if(current.group){current.group='';searchField().value='';renderPicker('','back');picker.scrollTop=0;if(isDropdown())picker.querySelector('[data-category-back]').focus({preventScroll:true})}else closePicker();return}
  if(event.target.closest('[data-search-keywords]')){event.preventDefault();searchLots();return}
  const use=event.target.closest('[data-category-use]');if(use){choose(use.dataset.categoryUse);return}
  const target=event.target.closest('[data-category-node]');if(!target||target.disabled)return;const node=T.get(target.dataset.categoryNode);if(node.kind==='group'){
   if(!isDropdown()&&current.purpose==='browse'&&!current.onSelect&&window.FasDesktopWeb?.active?.()){
    selectBrowse(node.id,{scroll:false});current.value=node.id;current.pending=expand(node.id);
   }
   current.group=node.id;searchField().value='';renderPicker('','forward');picker.scrollTop=0;if(isDropdown())picker.querySelector('[data-category-back]').focus({preventScroll:true});
  }else choose(node.id);
 }
 modalPicker.addEventListener('click',onPickerClick);dropdown.addEventListener('click',onPickerClick);
 modalPicker.addEventListener('close',()=>{if(picker!==modalPicker||modalPicker.open)return;finishClose()});
 document.addEventListener('click',event=>{
  const browse=event.target.closest('[data-browse-categories]');if(browse){event.preventDefault();if(!dropdown.hidden)closePicker();else open({value:qs('#category').value,dropdown:true});return}
  if(!dropdown.hidden&&!dropdownAnchor.contains(event.target))closePicker(false);
  if(event.target.closest('#all-categories,[data-open-categories]')){event.preventDefault();open({value:qs('#category').value});return}
  const target=event.target.closest('[data-category-form="bank"]');if(!target)return;const form=target.closest('form');if(!form)return;
  const sub=form.elements.namedItem('subcategory'),base=form.elements.namedItem('category');open({purpose:'sell',value:sub?.value||base?.value,onSelect:id=>{const node=T.get(id);base.value=node.legacyCategory;if(sub)sub.value=id;target.querySelector('span').textContent=node.label;target.parentElement.querySelector('.category-path').textContent=T.groupOf(id).label;window.FasCarCatalog?.refresh(form)}});
 });
 const native=qs('#category'),selected=native.value;setValue(selected);native.hidden=true;native.classList.add('category-native-select');
 const trigger=document.createElement('button');trigger.type='button';trigger.className='category-picker-trigger';trigger.setAttribute('data-browse-categories','');trigger.setAttribute('aria-controls','category-dropdown-panel');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<span>Все категории</span>'+uiIcon('sliders');
 dropdownAnchor=document.createElement('div');dropdownAnchor.className='category-dropdown-anchor';native.insertAdjacentElement('afterend',dropdownAnchor);dropdownAnchor.appendChild(native);dropdownAnchor.appendChild(trigger);dropdownAnchor.appendChild(dropdown);dropdownTrigger=trigger;
 dropdownAnchor.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!dropdown.hidden){event.preventDefault();event.stopPropagation?.();closePicker()}
  else if(event.key==='ArrowDown'&&event.target===trigger){event.preventDefault();if(dropdown.hidden)open({value:native.value,dropdown:true});else searchField()?.focus({preventScroll:true})}
 });
 dropdownAnchor.addEventListener('focusout',event=>{if(!dropdown.hidden&&event.relatedTarget&&!dropdownAnchor.contains(event.relatedTarget))closePicker(false)});
 document.addEventListener('pointerdown',event=>{if(!dropdown.hidden&&!dropdownAnchor.contains(event.target))closePicker(false)});
 window.addEventListener('resize',positionDropdown,{passive:true});window.addEventListener('scroll',positionDropdown,{passive:true});window.visualViewport?.addEventListener?.('resize',positionDropdown,{passive:true});
 const originalRender=render;render=function(...args){const result=originalRender.apply(this,args);sync();return result};
 window.FasCategoryUI=Object.freeze({open,selectBrowse,setValue,fieldHTML,sync,isExplicit:()=>selectionExplicit,setExplicit:value=>{selectionExplicit=value===true}});sync();
})();

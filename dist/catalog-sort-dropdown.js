/* Enhance only the catalogue sorter; its select remains the source of truth. */
(()=>{
 'use strict';
 const select=document.getElementById('sort');
 if(!select||select.tagName!=='SELECT'||document.getElementById('catalog-sort-trigger'))return;
 let trigger,panel,caption,items=[],active=-1,openedValue='',typed='',typedAt=0,frame=0;
 const label=()=>select.getAttribute('aria-label')||'Сортировка';
 const options=()=>Array.from(select.options);
 const disabled=option=>option.disabled||option.parentElement?.tagName==='OPTGROUP'&&option.parentElement.disabled;
 const isOpen=()=>panel&&!panel.hidden;
 const enabled=()=>items.map((item,index)=>!disabled(item.option)?index:-1).filter(index=>index>=0);
 function close(focus=false){
  if(!panel)return;panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');typed='';
  if(focus&&trigger.isConnected&&!trigger.disabled)trigger.focus({preventScroll:true});
 }
 function sync(){
  const list=options(),current=list[select.selectedIndex],text=current?.label||current?.textContent||'Выберите сортировку';
  if(caption.textContent!==text)caption.textContent=text;
  trigger.setAttribute('aria-label',label()+': '+text);trigger.disabled=select.disabled;
  if(isOpen()&&(select.disabled||select.value!==openedValue||document.body.classList.contains('reels')))close(false);
 }
 function focusOption(index){
  if(!items[index]||disabled(items[index].option))return;active=index;
  for(const [i,item]of items.entries())item.node.classList.toggle('is-active',i===index);
  trigger.setAttribute('aria-activedescendant',items[index].node.id);
  items[index].node.scrollIntoView?.({block:'nearest'});
 }
 function build(){
  panel.textContent='';items=options().map((option,index)=>{
   const node=document.createElement('div'),text=document.createElement('span'),check=document.createElement('span');
   node.id='catalog-sort-option-'+index;node.className='catalog-sort-option';node.setAttribute('role','option');node.setAttribute('aria-selected',String(index===select.selectedIndex));
   if(disabled(option))node.setAttribute('aria-disabled','true');
   text.textContent=option.label||option.textContent;check.className='catalog-sort-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
   node.append(text,check);node.addEventListener('pointermove',()=>focusOption(index));node.addEventListener('click',()=>commit(index));panel.appendChild(node);return {node,option};
  });
 }
 function position(){
  if(!isOpen())return;
  const r=trigger.getBoundingClientRect(),vv=window.visualViewport;
  const x=vv?.offsetLeft||0,y=vv?.offsetTop||0,vw=Math.min(document.documentElement.clientWidth||window.innerWidth,vv?.width||Infinity),vh=vv?.height||window.innerHeight;
  let bottom=y+vh-10;const dock=document.getElementById('quick-access');
  if(dock&&!dock.hidden&&getComputedStyle(dock).display!=='none'){
   const d=dock.getBoundingClientRect();if(d.height>0&&d.top>y&&d.top<bottom)bottom=d.top-10;
  }
  const top=y+10,width=Math.min(Math.max(r.width,240),Math.max(0,vw-20));
  if(r.bottom<=top||r.top>=bottom||r.width<=0){close(false);return}
  const below=Math.max(0,bottom-r.bottom-8),above=Math.max(0,r.top-top-8),desired=items.length*46+16;
  const up=below<Math.min(desired,180)&&above>below,available=up?above:below;
  if(available<44){close(false);return}
  panel.style.width=width+'px';panel.style.maxHeight=Math.min(320,available)+'px';
  panel.style.left=Math.max(x+10,Math.min(r.right-width,x+vw-width-10))+'px';
  const height=Math.min(panel.scrollHeight||desired,320,available);
  panel.style.top=(up?r.top-height-8:r.bottom+8)+'px';panel.dataset.placement=up?'above':'below';
 }
 function open(edge){
  sync();if(trigger.disabled)return;build();const available=enabled();if(!available.length)return;
  openedValue=select.value;panel.hidden=false;trigger.setAttribute('aria-expanded','true');position();
  if(!isOpen())return;
  const selected=available.includes(select.selectedIndex)?select.selectedIndex:available[0];
  focusOption(edge==='first'?available[0]:edge==='last'?available.at(-1):selected);
 }
 function commit(index=active){
  const item=items[index];if(!isOpen()||!item||select.disabled||disabled(item.option))return;
  // Options may have been replaced while the menu was open. Never apply a stale index.
  if(options()[index]!==item.option){close(true);sync();return}
  const changed=select.selectedIndex!==index;select.selectedIndex=index;close(true);sync();
  if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync()}
 }
 function onKey(event){
  if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
  const key=event.key;
  if(key==='Escape'&&isOpen()){event.preventDefault();event.stopPropagation();close(true);return}
  if(key==='Tab'){if(isOpen())commit();return}
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)){
   event.preventDefault();
   if(!isOpen()){open(key==='Home'?'first':key==='End'?'last':undefined);return}
   if(key==='Enter'||key===' '){commit();return}
   const list=enabled(),current=list.indexOf(active);if(!list.length)return;
   const next=key==='Home'?0:key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,current+(key==='ArrowDown'?1:-1)));
   focusOption(list[next]);return;
  }
  if(key.length===1&&!/\s/.test(key)){
   event.preventDefault();if(!isOpen())open();if(!isOpen())return;
   const now=Date.now();typed=now-typedAt>700?key:typed+key;typedAt=now;
   const term=typed.toLocaleLowerCase('ru'),list=enabled(),match=list.find(index=>(items[index].option.label||items[index].option.textContent).toLocaleLowerCase('ru').startsWith(term));
   if(match!==undefined)focusOption(match);
  }
 }
 function schedulePosition(){if(frame||!isOpen())return;frame=requestAnimationFrame(()=>{frame=0;position()})}
 try{
  trigger=document.createElement('button');trigger.id='catalog-sort-trigger';trigger.type='button';trigger.className='sort catalog-sort-trigger';
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','catalog-sort-options');
  caption=document.createElement('span');caption.className='catalog-sort-caption';const chevron=document.createElement('span');chevron.className='catalog-sort-chevron';chevron.setAttribute('aria-hidden','true');trigger.append(caption,chevron);
  panel=document.createElement('div');panel.id='catalog-sort-options';panel.className='catalog-sort-options';panel.setAttribute('role','listbox');panel.setAttribute('aria-label',label());panel.hidden=true;
  select.parentElement.insertBefore(trigger,select);document.body.appendChild(panel);sync();
  trigger.addEventListener('click',()=>{if(isOpen())close();else open()});trigger.addEventListener('keydown',onKey);
  // Focus stays on the combobox. Pointer choices do not blur it before click.
  panel.addEventListener('pointerdown',event=>event.preventDefault());
  document.addEventListener('pointerdown',event=>{if(isOpen()&&!trigger.contains(event.target)&&!panel.contains(event.target))close(false)},true);
  document.addEventListener('focusin',event=>{if(isOpen()&&!trigger.contains(event.target)&&!panel.contains(event.target))close(false)});
  select.addEventListener('change',sync);select.addEventListener('input',sync);
  const observer=new MutationObserver(()=>{if(isOpen())close(false);sync()});observer.observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','label','value','aria-label']});
  // Search, region and feed resets assign select.value and render the existing grid.
  const grid=document.getElementById('grid');if(grid)new MutationObserver(sync).observe(grid,{childList:true});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  select.form?.addEventListener('reset',()=>setTimeout(sync,0));
  document.addEventListener('scroll',event=>{if(!panel.contains(event.target))schedulePosition()},true);
  window.addEventListener('resize',schedulePosition);window.visualViewport?.addEventListener('resize',schedulePosition);window.visualViewport?.addEventListener('scroll',schedulePosition);
  window.addEventListener('hashchange',()=>close(false));
  select.classList.add('catalog-sort-native');select.hidden=true;
  window.FasCatalogSort=Object.freeze({refresh:sync,close});
 }catch(error){
  // Preserve the working native sorter if optional enhancement cannot initialise.
  trigger?.remove();panel?.remove();select.classList.remove('catalog-sort-native');select.hidden=false;
  console.warn('Catalogue sort enhancement unavailable',error);
 }
})();

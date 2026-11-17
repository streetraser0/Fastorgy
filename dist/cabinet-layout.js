/* Reuse existing controls and draft rows; leaving this layout restores the same nodes. */
(()=>{
 'use strict';
 if(window.FasCabinetLayout)return;
 const root=document.documentElement;let state=null;
 function ios(){const n=window.navigator||{};return /iPhone|iPad|iPod/i.test(n.userAgent||'')||n.platform==='MacIntel'&&n.maxTouchPoints>1}
 function native(){return root.classList.contains('native-app')||window.Capacitor?.isNativePlatform?.()===true}
 function mobile(){return ios()||/Android/i.test(window.navigator?.userAgent||'')||native()}
 function active(){return window.FasDesktopWeb?.active?.()===true||mobile()}
 function phone(){return mobile()&&window.matchMedia?.('(max-width:699px)')?.matches===true}
 function text(node,value){if(node&&node.textContent!==value)node.textContent=value}
 function restoreCompact(s){
  const compact=s?.compact;if(!compact)return;s.compact=null;
  // Move the same controls back. In particular, never rebuild profile inputs
  // or replace message/support controls while changing screen width.
  for(const entry of [...compact.moved].reverse())entry.parent.insertBefore(entry.node,entry.next?.parentElement===entry.parent?entry.next:null);
  compact.label.remove();compact.details.remove();text(compact.title,compact.titleText);
  s.shell.classList.remove('seller-mobile-simple');s.shell.removeAttribute('data-cabinet-section');
 }
 function compact(s){
  if(!phone()){restoreCompact(s);return}
  const layout=s.shell.querySelector('.seller-desktop-layout'),nav=s.shell.querySelector('.seller-account-tabs');if(!layout||!nav)return;
  if(!s.compact){
   const label=document.createElement('label');label.className='seller-mobile-section';
   const caption=document.createElement('span');caption.textContent='Раздел';label.appendChild(caption);
   const select=document.createElement('select');select.setAttribute('aria-label','Раздел личного кабинета');label.appendChild(select);
   const choices=[['all','Мои объявления','[data-seller-tab="all"]'],['draft','Мои черновики','[data-seller-tab="draft"]'],['bids','Мои ставки','[data-seller-bids]'],['purchases','Мои покупки','[data-seller-purchases]'],['profile','Мой профиль','[data-seller-tab="profile"]']];
   for(const [value,title]of choices){const option=document.createElement('option');option.value=value;option.textContent=title;select.appendChild(option)}
   const details=document.createElement('details');details.className='seller-mobile-more';
   const summary=document.createElement('summary');summary.textContent='Дополнительно';details.appendChild(summary);
   const body=document.createElement('div');body.className='seller-mobile-more-body';details.appendChild(body);
   const nodes=[s.shell.querySelector('.seller-shortcuts'),s.shell.querySelector('.seller-desktop-sidebar .seller-help-footer'),s.shell.querySelector('.seller-dashboard-notice'),s.shell.querySelector('[data-listing-quota-help]'),s.shell.querySelector('.seller-desktop-support')].filter(Boolean);
   const moved=nodes.map(node=>({node,parent:node.parentElement,next:node.nextElementSibling}));
   layout.parentElement.insertBefore(label,layout);s.shell.appendChild(details);for(const node of nodes)body.appendChild(node);
   const title=s.shell.querySelector('.seller-list-title');s.compact={label,select,details,moved,title,titleText:title?.textContent,choices};
   select.onchange=()=>{const selected=select.value,choice=choices.find(item=>item[0]===selected);select.value=s.shell.getAttribute('data-cabinet-section')||'all';if(choice)nav.querySelector(choice[2])?.click?.()};
   s.shell.classList.add('seller-mobile-simple');
  }
  const view=s.draftButton.getAttribute('aria-pressed')==='true'?'draft':nav.querySelector('[data-seller-tab="profile"]')?.getAttribute('aria-pressed')==='true'?'profile':'all';
  if(s.shell.getAttribute('data-cabinet-section')!==view)s.shell.setAttribute('data-cabinet-section',view);
  if(s.compact.select.value!==view)s.compact.select.value=view;
  for(const option of s.compact.select.children){const choice=s.compact.choices.find(item=>item[0]===option.value);if(!choice)continue;const count=option.value==='draft'?s.draftButton.querySelector('b')?.textContent:option.value==='all'?s.shell.querySelector('[data-seller-count="all"]')?.textContent:null;text(option,choice[1]+(count!==null&&count!==undefined?' ('+count+')':''))}
  const activeStatus=s.shell.querySelector('.seller-tabs [aria-pressed="true"]')?.dataset?.sellerTab;
  text(s.compact.title,view==='draft'?'Мои черновики':view==='profile'?'Мой профиль':({live:'На торгах',scheduled:'Запланировано',archive:'Архив и пауза'}[activeStatus]||'Мои объявления'));
 }
 // Desktop: the drafts section gets its own heading and hides listing status filters, like the phone layout.
 function view(s){const nav=s.shell.querySelector('.seller-account-tabs');return s.draftButton.getAttribute('aria-pressed')==='true'?'draft':nav?.querySelector('[data-seller-tab="profile"]')?.getAttribute('aria-pressed')==='true'?'profile':'all'}
 function section(s){
  const current=view(s);if(s.shell.getAttribute('data-cabinet-view')!==current)s.shell.setAttribute('data-cabinet-view',current);
  if(s.compact)return;
  const title=s.shell.querySelector('.seller-list-title');if(!title)return;
  if(title!==s.viewTitle){s.viewTitle=title;s.viewTitleText=title.textContent}
  text(title,current==='draft'?'Мои черновики':s.viewTitleText);
 }
 // Same geometry and stroke as the shared sidebar icons: a page with text lines.
 function draftIcon(){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
  for(const [k,v] of Object.entries({class:'ui-icon',width:'20',height:'20',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(k,v);
  path.setAttribute('d','M13 3H5v18h14V9l-6-6Zm0 0v6h6M8 13h8M8 17h5');svg.appendChild(path);return svg;
 }
 function restore(){
  if(!state)return;const s=state;state=null;
  restoreCompact(s);
  s.shell.removeAttribute('data-cabinet-view');if(s.viewTitle?.isConnected)text(s.viewTitle,s.viewTitleText);s.draftIcon?.remove();
  if(s.details){
   const list=s.details.parentElement;
   if(list){for(const row of s.rowOrder)if(row.parentElement===list||s.details.contains(row))list.insertBefore(row,s.details);for(const row of Array.from(s.details.querySelectorAll('.seller-row')))list.insertBefore(row,s.details);s.details.remove()}
  }
  if(s.draftButton&&s.originalParent){s.originalParent.insertBefore(s.draftButton,s.next?.parentElement===s.originalParent?s.next:null);text(s.draftLabel,s.label)}
  if(s.accountAll&&s.allPressed!==null)s.accountAll.setAttribute('aria-pressed',s.allPressed);
  text(s.createLabel,s.createText);
 }
 function drafts(s){
  const all=s.shell.querySelector('.seller-tabs [data-seller-tab="all"]')?.getAttribute('aria-pressed')==='true';
  if(!all)return;
  const list=s.shell.querySelector('.seller-list');if(!list)return;
  if(s.details?.parentElement!==list)s.details=null;
  if(!s.details){
   s.rowOrder=Array.from(list.children);
   s.details=document.createElement('details');s.details.className='cabinet-drafts';
   const summary=document.createElement('summary');summary.textContent='Мои черновики';
   s.count=document.createElement('span');s.count.className='cabinet-draft-count';summary.appendChild(s.count);
   s.draftList=document.createElement('div');s.draftList.className='cabinet-draft-list';
   s.empty=document.createElement('p');s.empty.className='cabinet-drafts-empty';s.empty.textContent='Черновиков пока нет.';
   s.details.appendChild(summary);s.details.appendChild(s.draftList);s.details.appendChild(s.empty);list.appendChild(s.details);
  }
  for(const row of Array.from(list.children))if(row.classList.contains('seller-row')&&row.querySelector('.seller-status[data-status="draft"]'))s.draftList.appendChild(row);
  const count=s.draftList.querySelectorAll('.seller-row').length;
  text(s.count,String(count));if(s.empty.hidden!==(count>0))s.empty.hidden=count>0;
 }
 function refresh(){
  const on=active(),isIOS=on&&ios(),isMobile=on&&mobile();
  if(root.classList.contains('cabinet-layout-on')!==on)root.classList.toggle('cabinet-layout-on',on);
  if(root.classList.contains('ios-cabinet')!==isIOS)root.classList.toggle('ios-cabinet',isIOS);
  if(root.classList.contains('mobile-cabinet')!==isMobile)root.classList.toggle('mobile-cabinet',isMobile);
  const shell=document.querySelector('#modal .seller-shell');
  if(!on){restore();return}
  if(state&&state.shell!==shell)restore();
  if(!shell?.querySelector('.seller-dashboard-heading'))return;
  if(!state){
   const button=shell.querySelector('.seller-tabs [data-seller-tab="draft"]'),nav=shell.querySelector('.seller-account-tabs');if(!button||!nav)return;
   const label=button.querySelector('span'),all=nav.querySelector('[data-seller-tab="all"]'),createLabel=shell.querySelector('.seller-create-button > span');
   state={shell,draftButton:button,draftLabel:label,label:label?.textContent,originalParent:button.parentElement,next:button.nextElementSibling,accountAll:all,allPressed:all?.getAttribute('aria-pressed'),createLabel,createText:createLabel?.textContent,details:null,rowOrder:[]};
   nav.insertBefore(button,all?.nextElementSibling||null);
   if(!button.querySelector('.ui-icon')&&typeof document.createElementNS==='function'){state.draftIcon=draftIcon();button.insertBefore(state.draftIcon,button.firstChild)}
   text(label,'Мои черновики');text(createLabel,'Разместить');
   if(all&&button.getAttribute('aria-pressed')==='true')all.setAttribute('aria-pressed','false');
  }
  drafts(state);compact(state);section(state);
 }
 window.FasCabinetLayout=Object.freeze({active,refresh});
 function ready(){refresh();const content=document.querySelector('#modal-content');if(content){const observer=new MutationObserver(refresh);observer.observe(content,{childList:true,subtree:true})}const classes=new MutationObserver(refresh);classes.observe(root,{attributes:true,attributeFilter:['class']});window.addEventListener('resize',refresh);window.addEventListener('pageshow',refresh)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();

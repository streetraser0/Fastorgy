const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/cabinet-layout.js','utf8');
function boot({width=390,view='draft',ua='iPhone Mobile Safari',desktop=false}={}){
 const h=setup({mobile:true}),clicks=[];let screenWidth=width;
 const proto=h.Element.prototype;
 proto.insertBefore=function(node,before){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(item=>item!==node);const at=this.children.indexOf(before);node.parentElement=this;if(at<0)this.children.push(node);else this.children.splice(at,0,node);return node};
 Object.defineProperty(proto,'nextElementSibling',{get(){const items=this.parentElement?.children||[];return items[items.indexOf(this)+1]||null},configurable:true});
 proto.querySelectorAll=function(selector){const found=[],parts=selector.trim().split(/\s+/);const accepts=node=>{let current=node;if(!current.matches(parts.at(-1)))return false;for(let i=parts.length-2;i>=0;i--){if(parts[i]==='>'){i--;current=current.parentElement;if(!current?.matches(parts[i]))return false}else{current=current.parentElement?.closest(parts[i]);if(!current)return false}}return true};function walk(node){for(const child of node.children){if(accepts(child))found.push(child);walk(child)}}walk(this);return found};
 proto.click=function(){if(this.onclick)this.onclick()};
 h.context.navigator={userAgent:ua};h.context.FasDesktopWeb={active:()=>desktop};h.context.matchMedia=query=>({matches:query==='(max-width:699px)'&&screenWidth<=699});
 h.content.innerHTML=`<div class="seller-shell"><div class="seller-desktop-toolbar"><div class="seller-dashboard-heading"><h2>Личный кабинет</h2></div><button class="seller-create-button"><span>Разместить объявление</span></button></div><div class="seller-desktop-layout"><div class="seller-desktop-sidebar"><nav class="seller-account-tabs"><button data-seller-tab="all" aria-pressed="${view!=='profile'}"><span>Мои лоты</span></button><button data-seller-bids><span>Мои ставки</span></button><button data-seller-purchases><span>Мои покупки</span></button><button data-seller-tab="profile" aria-pressed="${view==='profile'}"><span>Профиль</span></button></nav><nav class="seller-shortcuts"><button data-seller-favorites>Избранное</button></nav><section class="seller-help-footer" id="messages-fixture"><button data-messages-open>Сообщения</button></section></div><div class="seller-desktop-main"><details class="seller-dashboard-notice"><summary>Демоверсия</summary></details><details data-listing-quota-help><summary>Лимиты</summary></details><h3 class="seller-list-title">Мои объявления</h3><nav class="seller-tabs"><button data-seller-tab="all" data-seller-count="all" aria-pressed="${view==='all'}"><span>Все объявления</span><b>3</b></button><button data-seller-tab="draft" aria-pressed="${view==='draft'}"><span>Черновики</span><b data-seller-count="draft">2</b></button><button data-seller-tab="live" aria-pressed="false"><span>На торгах</span></button></nav>${view==='profile'?'<form id="seller-profile-form"><input id="unsaved-profile"></form>':'<div class="seller-list"><article class="seller-row"><span class="seller-status" data-status="draft">Черновик</span><button data-seller-edit="one">Продолжить</button></article></div>'}</div><section class="seller-help-footer seller-desktop-support"><button data-open-support>Поддержка</button></section></div></div>`;
 // Use the same nodes, including a realistic separate counter element.
 const all=h.content.querySelector('[data-seller-count="all"]');all.removeAttribute('data-seller-count');all.querySelector('b').setAttribute('data-seller-count','all');
 const shell=h.content.querySelector('.seller-shell'),main=shell.querySelector('.seller-desktop-main'),sidebar=shell.querySelector('.seller-desktop-sidebar'),layout=shell.querySelector('.seller-desktop-layout');
 const originals={main:[...main.children],sidebar:[...sidebar.children],layout:[...layout.children],messages:shell.querySelector('[data-messages-open]'),support:shell.querySelector('[data-open-support]'),quota:shell.querySelector('[data-listing-quota-help]'),draft:shell.querySelector('[data-seller-tab="draft"]')};
 for(const button of shell.querySelectorAll('button'))button.onclick=()=>clicks.push(button);
 vm.runInContext(source,h.context);
 return {...h,shell,main,sidebar,layout,originals,clicks,api:h.context.FasCabinetLayout,width(value){screenWidth=value;h.context.FasCabinetLayout.refresh()}};
}
for(const ua of ['iPhone Mobile Safari','Android Mobile Chrome'])for(const width of [320,390,699]){
 const h=boot({ua,width}),select=h.shell.querySelector('.seller-mobile-section select'),extra=h.shell.querySelector('.seller-mobile-more');
 assert(h.shell.classList.contains('seller-mobile-simple'));assert(select);assert.equal(select.value,'draft');assert.equal(select.children.length,5);assert.match(select.children[1].textContent,/2/);assert.equal(extra.open,false);
 assert.equal(h.shell.querySelector('.seller-list-title').textContent,'Мои черновики');assert.equal(h.shell.getAttribute('data-cabinet-section'),'draft');
 assert.equal(extra.querySelector('[data-messages-open]'),h.originals.messages);assert.equal(extra.querySelector('[data-open-support]'),h.originals.support);assert.equal(extra.querySelector('[data-listing-quota-help]'),h.originals.quota);
 assert.equal(h.shell.querySelectorAll('[data-messages-open]').length,1);assert.equal(h.shell.querySelectorAll('[data-open-support]').length,1);assert.equal(h.shell.querySelectorAll('[data-seller-tab="draft"]').length,1);
 select.value='bids';select.onchange();assert.equal(h.clicks.at(-1),h.sidebar.querySelector('[data-seller-bids]'));assert.equal(select.value,'draft','selection waits for the guarded existing action, retaining the old view on failure');
 select.value='purchases';select.onchange();assert.equal(h.clicks.at(-1),h.sidebar.querySelector('[data-seller-purchases]'));
 h.originals.draft.querySelector('b').textContent='1';h.api.refresh();assert.match(select.children[1].textContent,/1/,'draft count follows a successful in-place deletion');assert.equal(h.shell.querySelector('.seller-mobile-more'),extra,'refresh retains disclosure identity/open state');
 h.width(700);assert(!h.shell.classList.contains('seller-mobile-simple'));assert.equal(h.shell.querySelector('.seller-mobile-section'),null);assert.deepEqual(h.main.children,h.originals.main);assert.deepEqual(h.sidebar.children,h.originals.sidebar);assert.deepEqual(h.layout.children,h.originals.layout);assert.equal(h.shell.querySelector('[data-messages-open]'),h.originals.messages);assert.equal(h.originals.draft.getAttribute('aria-pressed'),'true');
 h.width(390);assert(h.shell.querySelector('.seller-mobile-section'));assert.equal(h.shell.querySelectorAll('[data-messages-open]').length,1);assert.equal(h.shell.querySelectorAll('[data-open-support]').length,1);
}
{
 const h=boot({view:'profile'}),input=h.shell.querySelector('#unsaved-profile');input.value='Несохранённое имя';h.originals.quota.open=true;
 h.width(1200);assert.equal(h.shell.querySelector('#unsaved-profile'),input);assert.equal(input.value,'Несохранённое имя');assert.equal(h.originals.quota.open,true);h.width(390);assert.equal(h.shell.querySelector('#unsaved-profile'),input);assert.equal(h.shell.querySelector('.seller-mobile-section select').value,'profile');
}
{
 const h=boot({ua:'Windows Chrome',desktop:true,width:390});assert(!h.shell.classList.contains('seller-mobile-simple'),'compact controls never replace desktop navigation');assert.equal(h.shell.querySelector('.seller-mobile-section'),null);
}
const css=fs.readFileSync('dist/mobile-cabinet-simple.css','utf8');assert.match(css,/@media\(max-width:699px\)/);assert.match(css,/data-cabinet-section="draft"\] \.seller-tabs\{display:none\}/);assert.match(css,/\.seller-desktop-layout\{display:block\}/);assert.match(css,/16px/);
console.log('PASS: iPhone/Android compact cabinet at 320/390/699px, guarded section actions, unique moved controls, count refresh, desktop restoration with original sibling order and unchanged profile fields.');

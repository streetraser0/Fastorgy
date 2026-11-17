const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const code=fs.readFileSync(path.join(__dirname,'../dist/home-navigation.js'),'utf8');

function fixture(options={}){
 const h=setup({mobile:true});h.context.URL=URL;
 h.context.location={href:'https://fas.example/market?lot=42&view=favorites&lang=ru#catalog'};h.document.baseURI=h.context.location.href;
 h.context.history={state:{previous:'catalog'},replaceState(state,title,url){h.calls.push(['url',url]);h.context.location.href=new URL(url,h.context.location.href).href}};
 h.context.scrollTo=value=>h.calls.push(['window-scroll',value]);
 h.context.KeyboardEvent=class{constructor(type,settings){this.type=type;Object.assign(this,settings)}};
 h.document.dispatchEvent=event=>{h.calls.push(['dispatch',event.key]);(h.docEvents[event.type]||[]).forEach(fn=>fn(event));return true};
 const observedListeners=[],listen=h.document.addEventListener;
 h.document.addEventListener=(type,fn,settings)=>{observedListeners.push([type,settings]);return listen(type,fn,settings)};
 const home=h.add('home','section'),heading=h.add('home-heading','h1',home);heading.textContent='Федеральная аукционная сеть';
 const anchor=h.add('main-brand','a',h.top);anchor.setAttribute('href','#home');anchor.className='brand-lockup';
 const logo=h.add('main-brand-image','img',anchor);logo.className='brand-logo';logo.setAttribute('src','assets/brand/fas-torgi-logo.png?v=20261113-brand-cream1');
 const partner=h.add('partner-logo','img');partner.className='brand-logo';partner.setAttribute('src','assets/brand/company-logo-original.jpg');
 const external=h.add('external-logo','img');external.setAttribute('src','https://another.example/assets/brand/fas-torgi-logo.png');
 const category=h.add('category','select',h.document.getElementById('filters')),brand=h.add('brand','select'),city=h.add('city','input'),budget=h.add('budget','select');
 const advanced=h.add('advanced-search','details');advanced.open=true;
 const reset=h.add('advanced-reset','button');reset.onclick=()=>{h.calls.push(['reset']);for(const node of [h.document.getElementById('search'),category,brand,city,budget])node.value='';h.context.render()};
 h.document.getElementById('search').value='Toyota';category.value='cars';brand.value='Toyota';city.value='Воронеж';budget.value='3000000';
 h.context.tab='fav';h.context.userRegion={code:'36',scope:'region'};h.context.userGeo={point:[51.66,39.2],approximate:false};
 const recommendationHistory={ids:[42,43]};h.context.FasRecommendations={state:()=>recommendationHistory};
 h.context.FasCategoryUI={sync:()=>h.calls.push(['category-sync'])};
 h.context.FasBackSwipe={cancel:()=>h.calls.push(['cancel-back'])};h.context.FasSellerBackGesture={cancel:()=>h.calls.push(['cancel-seller'])};
 const popover=h.add('open-popover','div');popover.setAttribute('popover','auto');popover.hidePopover=()=>h.calls.push(['hide-popover']);
 if(options.beforeLoad)options.beforeLoad(h);
 vm.runInContext(code,h.context);
 const passiveLogo=(parent,id='dialog-brand')=>{const image=h.add(id,'img',parent);image.setAttribute('src','assets/brand/fas-torgi-logo.png?v=cache');h.context.FasHomeNavigation.refresh(parent);return image};
 const click=target=>{const event={target,type:'click',defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};for(const fn of h.docEvents.click||[])fn(event);return event};
 const key=(target,key)=>{const event={target,type:'keydown',key,defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};for(const fn of h.docEvents.keydown||[])fn(event);return event};
 return {...h,home,heading,anchor,logo,partner,external,advanced,reset,category,brand,city,budget,observedListeners,passiveLogo,click,key,recommendationHistory};
}

{
 const h=fixture(),geo=h.context.userGeo,region=h.context.userRegion;
 assert.equal(h.anchor.getAttribute('aria-label'),'На главную страницу ФАС торги');assert.equal(h.anchor.getAttribute('href'),'#home');
 assert.equal(h.partner.hasAttribute('data-fas-home-navigation'),false);assert.equal(h.external.hasAttribute('data-fas-home-navigation'),false);
 h.click(h.partner);h.click(h.external);assert(!h.calls.some(call=>call[0]==='reset'));
 const event=h.click(h.logo);assert.equal(event.defaultPrevented,true);assert.equal(h.context.tab,'all');
 for(const input of [h.document.getElementById('search'),h.category,h.brand,h.city,h.budget])assert.equal(input.value,'');
 assert.strictEqual(h.context.userGeo,geo);assert.strictEqual(h.context.userRegion,region);assert.deepEqual(h.recommendationHistory.ids,[42,43]);
 assert.equal(h.advanced.open,false);assert.equal(h.document.activeElement,h.heading);assert(h.calls.some(call=>call[0]==='window-scroll'&&call[1].top===0));
 assert(h.calls.some(call=>call[0]==='hide-popover'));assert(h.calls.some(call=>call[0]==='dispatch'&&call[1]==='Escape'));
 assert.equal(h.context.location.href,'https://fas.example/market?lang=ru#home','only lot/favorites URL state is removed');
 assert(h.observedListeners.filter(([type])=>type==='click').every(([,settings])=>settings!==true&&!settings?.capture),'home clicks do not bypass capture-phase swipe gates');
}
for(const kind of ['login','payment','lot','category']){
 const h=fixture();h.modal.showModal();h.modal.classList.add(kind==='lot'?'lot-dialog':'auth-dialog');
 let target=h.passiveLogo(h.content);let closeCalls=0;
 if(kind==='payment'){
  const payment=h.add('payment-dialog','dialog');payment.showModal();target=h.passiveLogo(payment,'payment-logo');
  h.context.FasPayments={close(){closeCalls++;payment.close()}};
 }
 if(kind==='category'){const picker=h.add('category-picker','dialog');picker.showModal();target=h.passiveLogo(picker,'category-logo')}
 h.context.reelsMode=true;h.click(target);
 assert.equal(h.modal.open,false,kind+' closes main dialog');assert.equal(h.document.querySelectorAll('dialog[open]').length,0);
 assert.equal(h.context.reelsMode,false,kind+' leaves video feed');assert(h.calls.some(call=>call[0]==='reset'));
 if(kind==='payment')assert.equal(closeCalls,1,'payment closes through its own API');
}
for(const key of ['Enter',' ','Spacebar']){
 const h=fixture(),image=h.passiveLogo(h.content);assert.equal(image.getAttribute('role'),'button');assert.equal(image.getAttribute('tabindex'),'0');assert.equal(image.style.pointerEvents,'auto');
 h.modal.showModal();const event=h.key(image,key);assert.equal(event.defaultPrevented,true);assert.equal(h.modal.open,false);assert(h.calls.some(call=>call[0]==='reset'));
}
{
 const h=fixture(),event=h.key(h.anchor,'Enter');assert.equal(event.defaultPrevented,false,'native links retain their Enter click semantics');
 assert(!h.calls.some(call=>call[0]==='reset'));h.click(h.anchor);assert(h.calls.some(call=>call[0]==='reset'));
}
{
 const h=fixture(),image=h.passiveLogo(h.content);let calls=0;h.modal.classList.add('seller-dialog');h.modal.showModal();
 const category=h.add('category-picker','dialog');category.showModal();const logo=h.passiveLogo(category);
 h.context.FasSellerUI.back=()=>{calls++;assert.equal(category.open,false,'nested picker closes before the seller guard');assert.equal(h.modal.open,true);h.calls.push(['seller-error','quota']);return false};
 h.click(logo);assert.equal(calls,1);assert.equal(h.modal.open,true);assert(!h.calls.some(call=>call[0]==='reset'));
 assert.equal(h.document.getElementById('search').value,'Toyota');assert(h.calls.some(call=>call[0]==='seller-error'));
 // Retry uses the same guarded flow after the save problem is resolved.
 h.context.FasSellerUI.back=()=>{calls++;if(calls===3)h.modal.close();return true};h.click(image);assert.equal(h.modal.open,false);assert(h.calls.some(call=>call[0]==='reset'));
}
{
 const h=fixture();h.modal.classList.add('seller-dialog');h.modal.showModal();let backCalls=0;
 h.context.FasSellerUI.back=()=>{backCalls++;if(backCalls===3)h.modal.close();return true};
 assert.equal(h.context.FasHomeNavigation.goHome(),true);assert.equal(backCalls,3,'dirty editor → profile → dashboard remains guarded at every step');
}
for(const scenario of ['missing','stuck','throw']){
 const h=fixture();h.modal.classList.add('seller-dialog');h.modal.showModal();let backCalls=0;
 if(scenario==='stuck')h.context.FasSellerUI.back=()=>{backCalls++;return true};
 if(scenario==='throw')h.context.FasSellerUI.back=()=>{throw Error('storage failure')};
 assert.equal(h.context.FasHomeNavigation.goHome(),false);assert.equal(h.modal.open,true,scenario+' cannot bypass seller preservation');assert(!h.calls.some(call=>call[0]==='reset'));
 if(scenario==='stuck')assert.equal(backCalls,4,'broken navigation cannot loop forever');else assert(h.calls.some(call=>call[0]==='toast'));
}
{
 const h=fixture();h.partner.setAttribute('data-fas-home-navigation','');h.click(h.partner);assert(!h.calls.some(call=>call[0]==='reset'),'a marker alone never routes a partner logo');
 const event={target:h.logo,defaultPrevented:true,preventDefault(){throw Error('ghost tap was already suppressed')}};
 for(const fn of h.docEvents.click)fn(event);assert(!h.calls.some(call=>call[0]==='reset'),'a suppressed swipe ghost tap never navigates home');
}
// Use the real seller guard as well as the navigation DOM fixture above.
{
 const {boot,raw}=require('./helpers/category-seller-harness.cjs');
 for(const quotaFailure of [false,true]){
  const h=boot(),query=h.context.document.querySelector;
  h.context.URL=URL;h.context.location.href='https://fas.example/';h.context.document.baseURI=h.context.location.href;
  h.context.document.querySelector=selector=>selector==='#home'?null:query(selector);
  vm.runInContext(code,h.context);
  h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Сохранить перед главной'});
  if(quotaFailure)h.context.localStorage.setItem=()=>{throw Error('quota')};
  assert.equal(h.run('window.FasHomeNavigation.goHome()'),!quotaFailure);
  assert.equal(h.node('#modal').open,quotaFailure);
  if(quotaFailure){assert.equal(h.node('#seller-error').hidden,false);assert.match(h.node('#seller-error').textContent,/только в памяти этой страницы/)}
  else assert(JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(draft=>draft.data.name==='Сохранить перед главной'),'real dirty draft is durable before home');
 }
}
console.log('PASS: trusted FAS logos across dialogs, keyboard semantics, partner isolation, swipe click gates, seller save/error guards, nested overlays, feed exit and home filters without location/history loss.');

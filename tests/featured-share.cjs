const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
async function main(){
 const h=setup({mobile:true}),c=h.context,section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);h.add('featured-note','p',section);h.add('featured-empty','p',section);
 const shared=[],copied=[],records=new Map(),now=Date.now();
 const privacy=[{demo:true},{demo:false},{demo:true,demoEdited:true},{demo:true,sellerOwnerId:'local-owner'},{demo:'true'}];
 Object.assign(c,{URL,Date:class extends Date{static now(){return now}},location:{href:'https://fas.example/catalog/?private=secret#filters',search:''},navigator:{share:async value=>shared.push(value),clipboard:{writeText:async value=>copied.push(value)}},localStorage:{getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)},cars:privacy.map((fields,i)=>({id:i+1,name:'Лот '+(i+1),category:'cars',price:100000,status:'live',ends:new Date(now+3600000).toISOString(),...fields})),bids:{},saved:[],isLotLive:lot=>lot.status==='live'&&Date.parse(lot.ends)>now,current:lot=>lot.price,userOrigin:()=>null,image:()=> 'assets/cars.svg',money:value=>value+' ₽',escapeText:value=>String(value??'')});
 // Match production order: document sharing handler is already installed when
 // featured cards render, and receives the click after the strip's own handler.
 vm.runInContext(read('buyer-tools.js'),c);vm.runInContext(read('featured-lots.js'),c);
 async function click(target){const event={type:'click',target,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};for(let node=target;node&&!event.stopped;node=node.parentElement)node.dispatchEvent(event);if(!event.stopped)for(const listener of h.docEvents.click||[])listener(event);await new Promise(setImmediate);return event}
 for(const lot of c.cars){
  const card=track.querySelector('[data-featured-lot="'+lot.id+'"]'),favorite=card.querySelector('[data-featured-fav]'),share=card.querySelector('.featured-share');
  assert(share);assert.equal(share.dataset.buyerShare,String(lot.id));assert.strictEqual(share.parentElement,favorite.parentElement,'share stays in the photo overlay after the heart');assert(share.parentElement.children.indexOf(share)>share.parentElement.children.indexOf(favorite));
  assert.equal(share.querySelector('span').textContent,lot.id===1?'Поделиться':'Номер лота');assert.equal(share.querySelector('svg').dataset.icon,lot.id===1?'share':'copy');assert.equal(share.getAttribute('aria-label'),lot.id===1?'Поделиться ссылкой на лот':'Копировать номер локального лота');
  assert.equal((await click(share.querySelector('span'))).defaultPrevented,true,'nested label reaches the existing buyer-tools handler');
 }
 assert.equal(shared.length,1,'only the public unmodified seeded demo can share a link');assert.equal(shared[0].url,'https://fas.example/catalog/?lot=1');assert.deepEqual(copied,['Лот № 2','Лот № 3','Лот № 4','Лот № 5'],'local/edited/owned/invalid demo records copy only an identifier');
 assert.equal(h.calls.filter(([kind])=>kind==='open'||kind==='favorite').length,0,'sharing neither opens the lot/photo nor toggles the heart');assert.equal(records.size,0,'sharing does not manufacture browsing history or preference writes');assert.equal(h.modal.open,false);
 await click(track.querySelector('[data-featured-fav="1"]'));assert.deepEqual(Array.from(c.saved),[1],'heart remains independent');
 c.cars[0].demoEdited=true;c.FasFeaturedLots.refresh();const updated=track.querySelector('[data-buyer-share="1"]');assert.equal(updated.querySelector('span').textContent,'Номер лота','privacy changes invalidate the rendered share label');await click(updated);assert.equal(shared.length,1);assert.equal(copied.at(-1),'Лот № 1');
 c.cars[1].status='sold';await click(track.querySelector('[data-buyer-share="2"]'));assert.equal(copied.length,5,'the authoritative handler rejects unavailable lots');assert(h.calls.some(([kind,text])=>kind==='toast'&&text==='Лот больше недоступен'));
 console.log('PASS: featured photo share action after heart delegates actual bubbled clicks to buyer-tools; public demo URL sanitization, local/edited/owned lot privacy, unchanged history, separate heart, privacy rerender and unavailable-lot rejection.');
}
main().catch(error=>{console.error(error);process.exitCode=1});

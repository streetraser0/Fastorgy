const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8'),css=fs.readFileSync('dist/featured-lots.css','utf8');

function boot({reduced=false,native=true}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);
 h.add('featured-note','p',section);h.add('featured-empty','p',section);
 for(const direction of [-1,1])h.add('arrow-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 track.clientWidth=330;track.scrollWidth=1100;track.scrollLeft=0;
 const c=h.context;c.URL=URL;c.bids={};c.cars=Array.from({length:4},(_,i)=>({id:i+1,name:'Тестовый лот '+i,category:'cars',city:'Воронеж',price:10000+i*1000,status:'live',ends:new Date(Date.now()+3600000).toISOString()}));
 let scans=0;c.isLotLive=lot=>{scans++;return lot.status==='live'};c.current=lot=>lot.price;c.userOrigin=()=>null;c.image=()=> 'assets/cars.svg';c.categoryNames={cars:'Автомобили'};c.escapeText=value=>String(value??'');c.money=value=>value+' ₽';
 c.matchMedia=()=>({matches:reduced});
 if(native)track.scrollBy=options=>{track.scrollLeft+=options.left;h.calls.push(['horizontal',options.left,options.behavior])};
 vm.runInContext(source,c);
 const key=(key,extra={})=>{const event={type:'keydown',target:track,key,prevented:false,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},...extra};track.dispatchEvent(event);return event};
 const click=direction=>section.dispatchEvent({type:'click',target:section.querySelector('[data-featured-move="'+direction+'"]'),preventDefault(){}});
 return {...h,section,track,key,click,scans:()=>scans};
}

assert(/\.featured-track\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/s.test(css));
assert(/\.featured-track\s*\{[^}]*overflow-x:\s*auto[^}]*touch-action:\s*pan-x pan-y pinch-zoom/s.test(css));
const sizing=css.match(/flex:\s*0\s+0\s+calc\((\d+)%\s*-\s*(\d+)px\)/);
assert(sizing,'mobile cards use half of the available track width rather than viewport-based peeking');
assert(css.includes('gap: 10px;')&&css.includes('padding: 2px 2px 8px;'),'mobile gap and track padding stay explicit');
for(const viewport of [320,360,393,430]){
 const available=viewport-38-4,width=available*(+sizing[1])/100-(+sizing[2]);
 assert(width>0&&width<available,'a complete square card fits on phone '+viewport);
 assert(Math.abs(width*2+10-available)<.001,'two full cards and their gap fit inside the track on phone '+viewport);
}
assert(/\.featured-open\s*\{[^}]*aspect-ratio:\s*1/s.test(css),'photo buttons remain square');
assert(/\.featured-open img\s*\{[^}]*aspect-ratio:\s*1/s.test(css),'images preserve their square presentation');
assert(/\.featured-favorite\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s.test(css),'mobile favorite stays a full touch target');
assert(/\.featured-modes button\s*\{[^}]*min-height:\s*44px/s.test(css),'compact modes remain tappable');
assert(/\.featured-settings-enabled > #home-open-feed\s*\{[^}]*min-height:\s*44px/s.test(css),'All feed remains visible and tappable in the compact header');
{
 const h=boot(),scans=h.scans();assert.equal(h.track.getAttribute('tabindex'),'0');assert.equal(h.track.getAttribute('aria-roledescription'),'карусель');
 assert.equal(h.section.querySelector('[data-featured-move="-1"]').disabled,true);
 const next=h.key('ArrowRight');assert.equal(next.prevented,true);assert(h.track.scrollLeft>0);assert.equal(h.calls.at(-1)[2],'smooth');
 assert.equal(h.section.querySelector('[data-featured-move="-1"]').disabled,false);
 h.key('ArrowLeft');assert.equal(h.track.scrollLeft,0);h.click(1);assert(h.track.scrollLeft>0);
 h.track.scrollLeft=770;h.track.dispatchEvent({type:'scroll'});assert.equal(h.section.querySelector('[data-featured-move="1"]').disabled,true);
 h.key('ArrowRight');assert.equal(h.track.scrollLeft,770,'keyboard cannot move beyond the last card');
 h.key('ArrowLeft');assert(h.track.scrollLeft<770);assert.equal(h.scans(),scans,'scroll, arrow keys and move buttons never rescan the catalogue');
 assert(h.track.querySelectorAll('img').every(img=>img.getAttribute('draggable')==='false'));
 for(const type of ['touchstart','touchmove','pointerdown','pointermove','wheel'])assert.equal(h.track.events[type],undefined,'native gestures are not replaced by '+type);
}
{
 const h=boot({reduced:true});h.key('ArrowRight');assert.equal(h.calls.at(-1)[2],'auto','reduced motion keeps horizontal movement immediate');
 const left=h.track.scrollLeft;for(const extra of [{defaultPrevented:true},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}])assert.equal(h.key('ArrowRight',extra).prevented,false);
 assert.equal(h.track.scrollLeft,left);
 const input=h.add('carousel-field','input',h.track);assert.equal(h.key('ArrowRight',{target:input}).prevented,false);assert.equal(h.track.scrollLeft,left);
 h.context.reelsMode=true;assert.equal(h.key('ArrowRight').prevented,false);assert.equal(h.track.scrollLeft,left,'hidden home strip cannot consume feed keys');
}
{
 const h=boot({native:false});h.key('ArrowRight');assert(h.track.scrollLeft>0,'older engines can move without scrollBy');h.track.scrollWidth=h.track.clientWidth;h.track.scrollLeft=0;assert.equal(h.key('ArrowRight').prevented,false,'non-scrollable selections do not claim keyboard movement');
}
console.log('PASS: two full mobile cards, square photos and touch targets; native horizontal/keyboard/button movement, bounded edges, reduced motion and no catalogue rescans. Geometry remains a CSS constraint check.');

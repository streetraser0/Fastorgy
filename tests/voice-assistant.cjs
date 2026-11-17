const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const sourcePath=path.join(__dirname,'../dist/voice-assistant.js');

function boot(options={}){
 const h=setup({mobile:true}),instances=[],spoken=[];
 for(const file of ['geo-data.js','catalog-data.js','search-intent.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),h.context);
 for(const id of ['budget','region-filter','city','adv-price-min','adv-price-max','adv-year-min','adv-year-max','adv-mileage-min','adv-mileage-max','adv-area-min','adv-area-max','adv-rooms-min','adv-rooms-max','adv-fuel','adv-transmission','adv-condition','adv-radius','sort'])if(!h.document.querySelector('#'+id))h.add(id,'input');
 h.context.userOrigin=()=>options.origin||null;h.context.syncSearchFields=()=>h.calls.push(['sync-search-fields']);
 class Recognition{
  constructor(){this.starts=0;this.stops=0;this.aborts=0;instances.push(this)}
  start(){this.starts++;if(options.startError)throw Error('Recognition could not start');this.onstart?.({type:'start'})}
  stop(){this.stops++;this.onend?.({type:'end'})}
  abort(){this.aborts++;this.onend?.({type:'end'})}
 }
 h.context.navigator={mediaDevices:{getUserMedia(){throw Error('Voice must not request the microphone on its own.')}}};
 if(options.supported!==false)h.context[options.webkit?'webkitSpeechRecognition':'SpeechRecognition']=Recognition;
 h.context.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
 h.context.speechSynthesis={cancel(){spoken.push(['cancel'])},speak(value){spoken.push(['speak',value.text,value.lang])}};
 const closed=()=>assert.equal(h.document.querySelector('#voice-dialog').open,false,'route executes after voice overlay closes');
 h.context.FasGlobalSearch=(query,settings)=>{closed();h.calls.push(['global-search',query,settings]);for(const id of ['city','adv-price-min','adv-price-max','adv-radius'])h.document.querySelector('#'+id).value='';return {query,count:2}};
 h.context.FasGlobalSearch.supportsCriteria=options.atomic===true;
 h.context.FasSupport={open(){closed();h.calls.push(['support'])}};
 h.context.FasBackSwipe={back(){closed();h.calls.push(['back']);return true}};
 h.context.FasBuyerTools={openRecent(){closed();h.calls.push(['recent'])}};
 vm.runInContext(fs.readFileSync(sourcePath,'utf8'),h.context);
 const api=h.context.FasVoiceAssistant,dialog=h.document.querySelector('#voice-dialog');
 assert(api&&dialog,'voice helper exports and accessible dialog exist');
 const field=id=>dialog.querySelector('#'+id),button=selector=>dialog.querySelector(selector);
 const change=node=>{const event={type:'change',target:node,preventDefault(){}};node.onchange?.(event);node.dispatchEvent(event)};
 const submit=()=>{const event={type:'submit',target:field('voice-form'),preventDefault(){}};const form=field('voice-form');if(form.onsubmit)return form.onsubmit(event);return form.dispatchEvent(event)};
 const result=(recognition,text,final=true)=>{const item=[{transcript:text}];item.isFinal=final;recognition.onresult?.({resultIndex:0,results:[item]})};
 const click=target=>{target.onclick?.({target,type:'click',preventDefault(){}});return h.click(target)};
 return {...h,click,api,dialog,instances,spoken,field,button,change,submit,result};
}

{
 const h=boot();h.modal.showModal();h.content.innerHTML='<div id="preserved-editor">Несохранённая форма</div>';const editor=h.content.firstChild;h.modal.scrollTop=250;
 h.api.open();assert.equal(h.dialog.open,true);assert.equal(h.instances.length,0,'opening the helper does not request microphone access');assert.strictEqual(h.content.firstChild,editor);assert.equal(h.modal.scrollTop,250);
 h.field('voice-language').value='en-US';h.click(h.button('[data-voice-start]'));
 assert.equal(h.instances.length,1);const recognition=h.instances[0];assert.equal(recognition.lang,'en-US');assert.equal(recognition.starts,1);
 h.click(h.button('[data-voice-start]'));assert.equal(h.instances.length,1,'double start cannot create a second recognition session');
 h.result(recognition,'Toyota diesel',false);assert.equal(h.field('voice-interim').textContent,'Toyota diesel');
 h.result(recognition,'Toyota Camry дизель');assert.equal(h.field('voice-command').value,'Toyota Camry дизель');assert(!h.calls.some(([kind])=>kind==='global-search'),'recognition never executes an unreviewed query');
 h.click(h.button('[data-voice-stop]'));assert(recognition.stops+recognition.aborts>0);assert.equal(h.dialog.open,true,'stopping recognition keeps the editable command open');
 h.modal.close();h.submit();assert(h.calls.some(([kind,query])=>kind==='global-search'&&query==='Toyota Camry дизель'));assert.equal(h.dialog.open,false);
 assert(!h.spoken.some(([kind])=>kind==='speak'),'spoken replies are disabled by default');
}
{
 const h=boot(),menu=h.add('voice-menu','button'),mic=h.add('voice-mic','button');
 menu.setAttribute('data-voice-open','');mic.setAttribute('data-voice-open','');mic.setAttribute('data-voice-start','');
 h.click(menu);assert.equal(h.instances.length,0,'menu entry only opens the helper');h.api.close();
 h.click(mic);assert.equal(h.instances.length,1,'explicit microphone click opens and starts listening once');
}
{
 const h=boot();h.api.open();h.click(h.button('[data-voice-start]'));const old=h.instances[0],oldResult=old.onresult,oldError=old.onerror;
 h.api.close();assert(old.aborts+old.stops>0,'closing stops the browser recognizer');
 h.api.open();h.field('voice-command').value='Текущий запрос';const entry=[{transcript:'Старый запрос'}];entry.isFinal=true;
 oldResult?.({resultIndex:0,results:[entry]});oldError?.({error:'network'});
 assert.equal(h.field('voice-command').value,'Текущий запрос','stale recognition cannot overwrite a reopened helper');assert.equal(h.dialog.open,true);assert(!h.field('voice-error').textContent,'stale errors are ignored');
 h.click(h.button('[data-voice-start]'));const current=h.instances.at(-1);h.result(current,'<img src=x onerror=alert(1)>');assert.equal(h.field('voice-command').value,'<img src=x onerror=alert(1)>');assert(!h.dialog.innerHTML.includes('<img src=x'),'transcripts are plain text, never HTML');
 h.click(h.button('[data-voice-start]'));const denied=h.instances.at(-1);denied.onerror?.({error:'not-allowed'});assert(h.field('voice-error').textContent,'permission errors produce actionable feedback');
 denied.onend?.({});assert(h.field('voice-error').textContent,'end callback cannot erase the permission error');
}
{
 const h=boot({supported:false});h.api.open();assert.equal(h.instances.length,0);assert(h.field('voice-status').textContent||h.field('voice-error').textContent,'unsupported recognition has a visible explanation');
 h.field('voice-command').value='Найди Тойота Камри';h.submit();assert(h.calls.some(([kind,query])=>kind==='global-search'&&query==='Тойота Камри'),'typed fallback uses the same search router');
}
{
 const h=boot({webkit:true});h.api.open();h.field('voice-language').value='ru-RU';h.click(h.button('[data-voice-start]'));assert.equal(h.instances[0].lang,'ru-RU','prefixed browser recognition is supported');
 h.instances[0].onerror?.({error:'no-speech'});assert(h.field('voice-error').textContent);h.api.close();
}
{
 const h=boot({startError:true});h.api.open();h.click(h.button('[data-voice-start]'));assert.equal(h.dialog.open,true);assert(h.field('voice-error').textContent,'a start failure remains actionable');assert.equal(h.button('[data-voice-start]').disabled,false);
 h.api.execute(' ');assert.equal(h.dialog.open,true,'empty commands do not navigate');
}
{
 const h=boot({supported:false});h.modal.showModal();h.content.innerHTML='<form id="unchanged-draft">Несохранённый черновик</form>';const draft=h.content.firstChild;
 h.api.open();h.api.execute('help');assert.equal(h.modal.open,true,'opening help preserves an underlying editor');assert.strictEqual(h.content.firstChild,draft);
}
for(const [command,kind,arg] of [
 ['найди Toyota Camry','global-search','Toyota Camry'],['find diesel truck','global-search','diesel truck'],
 ['открой каталог','tab','all'],['open favorites','tab','fav'],['помощь','support'],['help','support'],['назад','back'],['go back','back'],['недавно смотрел','recent'],['recently viewed','recent']
]){
 const h=boot({supported:false});h.api.open();h.api.execute(command);assert(h.calls.some(([action,value])=>action===kind&&(arg===undefined||value===arg)),command+' routes to the intended safe action');assert.equal(h.dialog.open,false);
}
for(const command of ['сделай ставку 100000','купить лот 42','удалить черновик','опубликуй объявление','bid 100000','buy lot 42','delete draft','publish listing']){
 const h=boot({supported:false});h.api.open();const before=h.calls.length;h.api.execute(command);
 assert(!h.calls.slice(before).some(([kind])=>['global-search','tab','reels','support','back','recent','sell','account'].includes(kind)),'voice cannot execute financial or destructive action: '+command);assert.equal(h.dialog.open,true);assert(h.field('voice-error').textContent,'blocked actions explain the supported interaction');
}
{
 const h=boot({supported:false});h.api.open();h.api.execute('Bidirectional hydraulic pump');assert(h.calls.some(([kind,q])=>kind==='global-search'&&q==='Bidirectional hydraulic pump'),'ordinary lot text is not blocked by a partial command word');
 h.api.open();h.api.execute('Ставрополь дизель');assert(h.calls.some(([kind,q])=>kind==='global-search'&&q==='Ставрополь дизель'),'a city name is not mistaken for a bid command');
 h.api.open();h.field('voice-speak').checked=true;h.api.execute('help');assert(h.spoken.some(([kind])=>kind==='speak'),'audible replies require the explicit checkbox');
}
console.log('PASS: explicit microphone start, RU/EN and prefixed recognition, editable transcript, typed fallback, safe command routes, no financial actions, stale callback guards and opt-in speech.');

const plain=value=>JSON.parse(JSON.stringify(value));
for(const [phrase,query,criteria] of [
 ['Найди Ситрак C7H до трёх миллионов рублей в Воронеже в радиусе 30 км','Ситрак C7H',{sort:'nearest',radius:'30',city:'Воронеж',regionCode:'36',priceMax:3000000}],
 ['Покажи мне Toyota RAV4 от 2 до 3 млн в Москве','Toyota RAV4',{sort:'nearest',city:'Москва',regionCode:'77',priceMin:2000000,priceMax:3000000}],
 ['Найди мебель до двадцати пяти тысяч рублей','мебель',{sort:'nearest',priceMax:25000}],
 ['Find trucks under three million rubles in Voronezh within 50 km','trucks',{sort:'nearest',radius:'50',city:'Воронеж',regionCode:'36',priceMax:3000000}],
 ['Find equipment from two to three million rubles cheapest first','equipment',{sort:'low',priceMin:2000000,priceMax:3000000}],
 ['Найди квартиру до 2 500 000 рублей в Воронежской области','квартиру',{sort:'nearest',regionCode:'36',priceMax:2500000}],
 ['Найди ноутбук до 150,5 тысяч рублей','ноутбук',{sort:'nearest',priceMax:150500}],
 ['Ищу грузовик от одного миллиона до трех миллионов пятисот тысяч рублей','грузовик',{sort:'nearest',priceMin:1000000,priceMax:3500000}],
 ['Пожалуйста найди экскаватор до 3млн рядом со мной','экскаватор',{sort:'nearest',priceMax:3000000}],
 ['Find home appliances price high to low','home appliances',{sort:'high'}]
]){
 const h=boot({supported:false,atomic:true,origin:{point:[51.66,39.2]}});h.api.open();const result=h.api.execute(phrase);
 assert.equal(result.ok,true,phrase);assert.equal(result.query,query,phrase);assert.deepEqual(plain(result.criteria),criteria,phrase);
 const routed=h.calls.find(([kind])=>kind==='global-search');assert.equal(routed[1],query);assert.deepEqual(plain(routed[2]),{criteria});assert(!h.calls.some(([kind])=>kind==='render'),'atomic criteria route must not render twice');
 assert(h.api.state().lastFeedback.includes('Распознано: «'+phrase+'»'));assert(h.api.state().lastFeedback.includes('Сначала'));assert(h.calls.filter(([kind])=>kind==='toast').every(([,text])=>text.length<=160),'feedback toast must fit a phone screen');
}
for(const query of ['Toyota RAV4 2021','SITRAK C7H','КамАЗ 5490','Canon EOS R5','Насос 30 кВт','Bidirectional hydraulic pump','Ставрополь дизель']){
 const h=boot({supported:false});const result=h.api.parse('Найди '+query);assert.equal(result.query,query);assert.deepEqual(plain(result.criteria),{sort:'nearest'},'model, power and year digits must not become money: '+query);
}
{
 const h=boot({supported:false}),parsed=h.api.parse('Найди BMW X5 до 2020 года');assert.equal(parsed.query,'BMW X5');assert.deepEqual(plain(parsed.criteria),{sort:'nearest',yearMax:2020},'an explicit year unit applies the year bound without becoming money');
}
{
 const h=boot({supported:false});h.api.open();const result=h.api.execute('Найди грузовик до 500 км');assert.equal(result.query,'грузовик');assert.equal(result.criteria.radius,undefined);assert.equal(result.criteria.priceMax,undefined);assert(result.warnings.some(text=>text.includes('Ваш регион')));assert(h.api.state().lastFeedback.includes('Разрешение геолокации не запрашивалось'));assert.equal(h.instances.length,0);
 const unknown=h.api.parse('Найди Toyota в неизвестном городе');assert.equal(unknown.query,'Toyota в неизвестном городе');assert.equal(unknown.criteria.city,undefined,'unknown cities must not be guessed');
}
{
 const h=boot({supported:false});h.document.querySelector('#budget').value='old-budget';h.api.open();const result=h.api.execute('Найди Ситрак до 3 млн в Воронеже');assert.equal(result.ok,true);assert.equal(h.document.querySelector('#budget').value,'');assert.equal(h.document.querySelector('#adv-price-max').value,'3000000');assert.equal(h.document.querySelector('#region-filter').value,'36');assert.equal(h.document.querySelector('#city').value,'Воронеж');assert.equal(h.document.querySelector('#sort').value,'nearest');assert.equal(h.calls.filter(([kind])=>kind==='render').length,1,'legacy route reapplies criteria after its reset');
}
{
 const h=boot({supported:false,atomic:true});h.api.open();const before=h.calls.length;const invalid=h.api.execute('Найди авто от 3 млн до 2 млн');assert.equal(invalid.ok,false);assert.equal(invalid.action,'invalid');assert.equal(h.dialog.open,true);assert(!h.calls.slice(before).some(([kind])=>kind==='global-search'));assert(h.field('voice-error').textContent.includes('Уточните диапазон'));
 h.api.execute('Повтори');assert.equal(h.dialog.open,true,'an invalid command is not remembered');
 h.api.execute('Найди Тойота Камри до трех миллионов');h.api.open();h.api.execute('купить лот 42');h.api.execute('повтори поиск');const searches=h.calls.filter(([kind])=>kind==='global-search');assert.equal(searches.length,2);assert.equal(searches[0][1],searches[1][1]);assert.deepEqual(plain(searches[0][2]),plain(searches[1][2]),'repeat reuses the last safe query and constraints');
 h.api.open();h.api.execute('открой ленту');assert(h.calls.some(([kind,on])=>kind==='reels'&&on===true));h.api.open();h.api.execute('закрыть');assert.equal(h.dialog.open,false);
}
{
 const h=boot({supported:false,atomic:true});h.api.open();h.field('voice-command').value='Найди стиральную машину до пятидесяти тысяч рублей';h.submit();const routed=h.calls.find(([kind])=>kind==='global-search');assert.equal(routed[1],'стиральную машину');assert.equal(routed[2].criteria.priceMax,50000,'typed fallback gets the same natural intent parser');
}
{
 const h=boot({supported:false,atomic:true,origin:{point:[51.66,39.2]}});assert.equal(h.api.parse('Найди оборудование свыше 1000 км').criteria.radius,'gt1000');h.context.openLocalFeed=()=>h.calls.push(['local-feed']);h.api.open();h.api.execute('смотреть ленту');assert(h.calls.some(([kind])=>kind==='local-feed'));assert(!h.calls.some(([kind])=>kind==='reels'),'feed uses the unified nearest-first route when available');
 let lookups=0;h.context.cars=Array.from({length:1000},(_,id)=>({id,city:id%2?'Воронеж':'Москва',regionCode:id%2?'36':'77'}));h.context.getRegionCode=lot=>{lookups++;return lot.regionCode};h.api.parse('Найди станок в Воронеже');assert.equal(lookups,0,'known city mapping uses the shared dictionary without scanning inventory');h.context.cars[0]={id:0,city:'Бобров',regionCode:'36'};const custom=h.api.parse('Найди станок в Боброве');assert.equal(lookups,1000,'unknown dictionary cities still scan inventory at most once');assert.equal(custom.criteria.city,'Бобров');
}
{
 const h=boot({supported:false});for(const file of ['category-tree.js','search-data.js','search-typos.js','search-identifiers.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),h.context);
 for(const [phrase,lot] of [['Найди Ситрак до трех миллионов',{id:1,category:'trucks',name:'SITRAK C7H',brand:'SITRAK'}],['Найди Тойота Камри',{id:2,category:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry'}],['Find iPhone',{id:3,category:'electronics',name:'Apple iPhone',brand:'Apple'}]]){const parsed=h.api.parse(phrase);assert(h.context.FasKeywordSearch.matches(lot,parsed.query),'voice keywords use the existing bilingual/alias search: '+phrase)}
 for(const phrase of ['оплати лот 42','переведи деньги продавцу','pay for lot 42','transfer money'])assert.equal(h.api.parse(phrase).action,'blocked');
}
console.log('PASS: natural RU/EN prices and spoken numbers, ranges, known cities and regions, radius without automatic location permission, model/year boundaries, atomic/legacy criteria, applied feedback and safe repeat/feed/close.');

for(const [phrase,query,criteria]of [
 ['Найди Toyota Camry 2018–2022 года пробег от 100 до 150 тыс. км','Toyota Camry',{sort:'nearest',yearMin:2018,yearMax:2022,mileageMin:100000,mileageMax:150000}],
 ['Найди BMW X5 не новее 2021 года до 150 тысяч км пробега до 3 млн','BMW X5',{sort:'nearest',yearMax:2021,mileageMax:150000,priceMax:3000000}],
 ['Find Toyota Camry no older than 2020 mileage at least 50000 km only manual','Toyota Camry',{sort:'nearest',yearMin:2020,mileageMin:50000,transmission:'manual'}],
 ['Найди квартиру от 40 до 80 квадратных метров от двух до трех комнат','квартиру',{sort:'nearest',areaMin:40,areaMax:80,roomsMin:2,roomsMax:3}],
 ['Найди квартиру площадь 65 м² комнат 2','квартиру',{sort:'nearest',areaMin:65,areaMax:65,roomsMin:2,roomsMax:2}]
]){const h=boot({supported:false,atomic:true});const parsed=h.api.parse(phrase);assert.equal(parsed.action,'search',phrase);assert.equal(parsed.query,query,phrase);assert.deepEqual(plain(parsed.criteria),criteria,phrase)}
for(const phrase of ['Найди Toyota год 5490','Найди Toyota пробег до -5 км','Найди квартиру комнат 1,5','Найди Toyota только автомат только механика']){const h=boot({supported:false});assert.equal(h.api.parse(phrase).action,'invalid',phrase)}
for(const phrase of ['Toyota не только автомат','Toyota не на дизеле','Toyota не требует ремонта','Toyota without automatic transmission']){
 const h=boot({supported:false});const parsed=h.api.parse('Найди '+phrase);assert.equal(parsed.action,'invalid',phrase);assert.match(parsed.message,/без отрицания|Уточните/,'negated enum phrases require clarification instead of applying a positive constraint');assert.equal(parsed.criteria,undefined);
}
{
 const h=boot({supported:false});h.api.open();const result=h.api.execute('Найди Toyota Camry год от 2020 до 2022 пробег до 150 тысяч км только автомат');assert.equal(result.ok,true);assert.equal(h.document.querySelector('#adv-year-min').value,'2020');assert.equal(h.document.querySelector('#adv-year-max').value,'2022');assert.equal(h.document.querySelector('#adv-mileage-max').value,'150000');assert.equal(h.document.querySelector('#adv-transmission').value,'auto');assert.equal(h.calls.filter(([kind])=>kind==='render').length,1,'legacy criteria apply the new named fields in one follow-up render');
}
{
 const h=boot({supported:false,atomic:true});h.api.open();h.api.execute('Найди Toyota Camry год от 2020 до 2022 до 3 млн');h.api.open();h.api.execute('а теперь дешевле');const route=h.context.FasGlobalSearch;
 h.context.FasGlobalSearch=Object.assign(()=>({error:'Поиск временно недоступен.'}),{supportsCriteria:true});h.api.open();assert.equal(h.api.execute('Найди BMW год 2021').ok,false);assert.equal(h.dialog.open,true);assert(h.field('voice-error').textContent.includes('недоступен'),'route errors remain visible and do not become a remembered search');
 h.context.FasGlobalSearch=route;const result=h.api.execute('повтори поиск');assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.deepEqual(plain(result.criteria),{sort:'low',yearMin:2020,yearMax:2022,priceMax:3000000},'repeat keeps all successful refinements after a failed new search');
 h.api.open();h.api.execute('reset search');h.api.open();assert.equal(h.api.execute('а теперь дешевле').ok,false,'reset clears refinement memory');assert.equal(h.api.execute('repeat search').ok,false,'reset clears repeat memory');
}
console.log('PASS: bounded year/mileage/property intents, contextual enum safety, legacy named fields, failed-route memory and full refined repeat/reset.');

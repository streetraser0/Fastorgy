const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('dist/assistant-preferences.js','utf8'),RealDate=Date,NOW=Date.parse('2026-11-14T12:00:00Z');
function boot(options={}){
 let time=NOW,profile=options.profile||'alice',lots=options.lots||[],ownBids=options.ownBids||{},favorites=options.favorites||[],notices=options.notices||[],failStorage=!!options.failStorage,mic=false;
 const records={...(options.records||{})},events={},spoken=[],cancelled=[],timers=[],document={hidden:false,querySelectorAll(){return[]},addEventListener(type,handler){events[type]=handler}},synth={speaking:false,pending:false,speak(u){spoken.push(u);this.speaking=true},cancel(){cancelled.push(true);this.speaking=false}};
 const context={console,Date:class extends RealDate{constructor(...args){super(...(args.length?args:[time]))}static now(){return time}},JSON,Number,String,Object,Array,Map,Set,document,localStorage:{getItem:k=>records[k]??null,setItem(k,v){if(failStorage)throw Error('quota');records[k]=v}},setInterval(fn){timers.push(fn)},speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},FasVoiceAssistant:{state(){return{listening:mic}}},addEventListener(type,handler){events[type]=handler}};
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 const api=context.FasAssistantPreferences;api.configure({getProfileId:()=>profile,getLots:()=>lots,getOwnBids:()=>ownBids,getFavorites:()=>favorites,getNotices:()=>notices,getIsOwn:lot=>lot.sellerOwnerId===profile,getCurrentPrice:lot=>lot.price,isLive:lot=>lot.status==='live'&&Date.parse(lot.ends)>time});
 const set=(key,value=true)=>api.execute({type:'set',key,value});
 return {api,context,records,events,spoken,cancelled,timers,document,synth,set,advance(ms){time+=ms},setTime(v){time=v},setProfile(v){profile=v},setLots(v){lots=v},setBids(v){ownBids=v},setFavorites(v){favorites=v},setNotices(v){notices=v},failStorage(v){failStorage=v},setMic(v){mic=v},endSpeech(){synth.speaking=false;spoken.at(-1)?.onend?.()},get lots(){return lots}};
}
const future=NOW+3600000,lot=(id=1,extra={})=>({id,name:'Дом <img src=x onerror=bad()>',price:1000,status:'live',ends:new Date(future).toISOString(),...extra});
{
 const h=boot();assert.equal(h.api.state().spoken,false);assert.equal(Object.keys(h.api.state().eventTypes).length,6);assert.equal(h.spoken.length,0);
 const before=JSON.stringify(h.records);for(const [text,key,value]of [['оповещай меня когда мою ставку перебили','outbid',true],['оповещай меня о новой ставке','outbid',true],['сообщай если мою ставку перебьют','outbid',true],['не оповещай меня когда мою ставку перебили','outbid',false],['оповещай меня о новой ставке на мой лот','newBidOwn',true],['напоминай мне перед окончанием торгов','endingSoon',true],['сообщай о завершенных торгах','auctionEnded',true],['оповещай о новых лотах по поиску','matchingNew',true],['сообщай о снижении цены','priceDrop',true],['включи тихие часы','quiet',true],['озвучивай события','spoken',true]]){const command=h.api.parseCommand(text);assert(command,text);assert.equal(command.action,'preferences');assert.equal(command.request.key,key,text);assert.equal(command.request.value,value,text)}
 assert.equal(JSON.stringify(h.records),before,'parsing commands has no side effects');assert.equal(h.api.parseCommand('найди красную машину до миллиона'),null);assert.equal(h.api.parseCommand('купить оповещатель'),null);assert.equal(h.api.parseCommand('открой настройки помощника').request.type,'show');assert.equal(h.api.parseCommand('Настройки уведомлений').request.type,'show');assert.equal(h.api.execute({type:'show'}).showSettings,true);
 assert.equal(h.set('endingMinutes',0).ok,false);assert.equal(h.set('spoken','yes').ok,false);assert.equal(h.set('quietStart','25:00').ok,false);assert.equal(h.set('unknown',true).ok,false);
 h.set('endingMinutes',15);h.set('quietStart','21:30');assert.equal(h.api.state().endingMinutes,15);assert.equal(h.api.state().quietStart,'21:30');assert.match(h.api.settingsHTML(),/после закрытия/);assert.match(h.api.settingsHTML(),/Завершение торгов не подтверждает победу/);
 const reloaded=boot({records:h.records});assert.equal(reloaded.api.state().endingMinutes,15);assert.equal(reloaded.api.state().spoken,false);
 const fail=boot({failStorage:true});assert.match(fail.set('outbid').message,/сохранить настройку не удалось/);assert.equal(fail.api.state().storageAvailable,false);assert.equal(fail.api.state().outbid,true,'failed save is reported as session-only');
}
{
 const l=lot(1,{sellerOwnerId:'alice',auctionUpdatedAt:new Date(NOW).toISOString()}),h=boot({lots:[l]});h.set('newBidOwn');h.set('spoken');
 const update={actorOwn:false,lotId:1,price:1000,occurredAt:new Date(NOW).toISOString()};
 assert.equal(h.api.onAuctionUpdate({...update,actorOwn:true}).ok,false);assert.equal(h.api.onAuctionUpdate({...update,price:1100}).ok,false);assert.equal(h.api.onAuctionUpdate({...update,occurredAt:new Date(NOW-1000).toISOString()}).ok,false);assert.equal(h.api.onAuctionUpdate(update).ok,true);assert.equal(h.spoken.length,1);assert.match(h.spoken[0].text,/Новая ставка/);assert.equal(h.api.onAuctionUpdate(update).ok,false);
 h.setProfile('bob');assert.equal(h.api.state().spoken,false);assert.equal(h.cancelled.length,1,'profile change cancels pending own-scope speech');assert.equal(h.api.state().newBidOwn,false);h.spoken[0].onend();assert.equal(h.spoken.length,1,'late completion cannot drain prior profile queue');
 h.setProfile('alice');assert.equal(h.api.state().spoken,true);assert.equal(h.api.onAuctionUpdate(update).ok,false,'dedupe survives reload of profile preferences');
 l.status='sold';assert.equal(h.api.onAuctionUpdate({...update,occurredAt:new Date(NOW+1).toISOString()}).ok,false);
}
{
 const l=lot(),notice={id:'outbid-1',type:'outbid',lotId:1,ownPrice:900,currentPrice:1000},fresh={id:'search-1',type:'new-lot',lotId:1},h=boot({lots:[l],ownBids:{1:{price:900}},notices:[notice,fresh]});h.set('outbid');h.set('matchingNew');h.set('spoken');
 assert.equal(h.api.onNotice({...notice,id:'forged'}).reason,'unconfirmed-notice');assert.equal(h.api.onNotice({...notice,currentPrice:1100}).ok,false);assert.equal(h.api.onNotice(notice).ok,true);assert.equal(h.spoken.length,1);assert.equal(h.api.onNotice(notice).ok,false);
 assert.equal(h.api.onNotice(fresh).ok,true);assert.equal(h.spoken.length,1,'second event waits for prior speech');h.endSpeech();assert.equal(h.spoken.length,2);assert.match(h.spoken[1].text,/сохраненному|сохранённому/);
 h.document.hidden=true;h.events.visibilitychange();assert.equal(h.cancelled.length,1);h.setNotices([{...fresh,id:'hidden'}]);assert.equal(h.api.onNotice({...fresh,id:'hidden'}).ok,true);assert.equal(h.spoken.length,2,'hidden page never speaks and cannot queue stale speech');
 h.document.hidden=false;h.endSpeech();assert.equal(h.spoken.length,2);
}
{
 const l=lot(1,{auctionUpdatedAt:new Date(NOW).toISOString()}),h=boot({lots:[l],ownBids:{1:{price:900,history:[{at:new Date(NOW-1000).toISOString()}]}}});h.set('outbid');h.set('spoken');
 const update={actorOwn:false,lotId:1,price:1000,occurredAt:new Date(NOW).toISOString()};assert.equal(h.api.onAuctionUpdate(update).ok,true,'voice outbid criteria work from persisted validated quote without enabling browser alerts');assert.equal(h.spoken.length,1);
 const notice={id:'post-quote-outbid',type:'outbid',lotId:1,ownPrice:900,currentPrice:1000};h.setNotices([notice]);assert.equal(h.api.onNotice(notice).ok,false,'quote and notice routes dedupe the same outbid');assert.equal(h.spoken.length,1);
}

{
 const h=boot({lots:[lot()],favorites:[1]});h.set('spoken');h.set('quiet');h.set('endingSoon');h.setTime(Date.parse('2026-11-14T23:00:00Z'));h.setLots([lot(1,{ends:'2026-11-14T23:10:00Z'})]);h.api.tick();assert.equal(h.api.state().quietNow,true);assert.equal(h.spoken.length,0);
 h.set('quietStart','08:00');h.set('quietEnd','08:00');assert.equal(h.api.state().quietNow,true,'equal quiet endpoints mean all-day silence');
 const outside=boot();outside.set('quiet');outside.set('quietStart','09:00');outside.set('quietEnd','18:00');assert.equal(outside.api.state().quietNow,true);outside.setTime(Date.parse('2026-11-14T20:00:00Z'));assert.equal(outside.api.state().quietNow,false);
}
{
 const l=lot(1,{ends:new Date(NOW+20*60000).toISOString()}),h=boot({lots:[l],favorites:[1]});h.set('spoken');h.set('endingSoon');h.set('auctionEnded');h.set('priceDrop');assert.equal(h.api.tick().checked,1);assert.equal(h.spoken.length,1);assert.match(h.spoken[0].text,/меньше 30 минут/);h.endSpeech();assert.equal(h.api.tick().checked,1);assert.equal(h.spoken.length,1);
 l.price=900;h.api.tick();assert.equal(h.spoken.length,2);assert.match(h.spoken[1].text,/снизилась до 900/);h.endSpeech();h.api.tick();assert.equal(h.spoken.length,2);l.price=950;h.api.tick();assert.equal(h.spoken.length,2);
 h.advance(20*60000);h.api.tick();assert.equal(h.spoken.length,3);assert.match(h.spoken[2].text,/Результат и обязательства проверьте/);assert.doesNotMatch(h.spoken[2].text,/победили|выиграли|оплачено/);h.endSpeech();h.api.tick();assert.equal(h.spoken.length,3);
 const expired=boot({lots:[lot(2,{ends:new Date(NOW-1).toISOString()})],favorites:[2]});expired.set('spoken');expired.set('auctionEnded');expired.api.tick();assert.equal(expired.spoken.length,0,'restoring an already-ended lot never invents a new completion');
}
{
 const lots=Array.from({length:12},(_,i)=>lot(i+1)),notices=lots.map(l=>({id:'new-'+l.id,type:'new-lot',lotId:l.id})),h=boot({lots,notices});h.set('spoken');h.set('matchingNew');
 for(const notice of notices)h.api.onNotice(notice);assert.equal(h.spoken.length,1);assert.equal(h.api.state().queued,5,'speech queue never exceeds five even under a burst');h.api.pauseSpeech();assert.equal(h.api.state().queued,0);assert.equal(h.cancelled.length,1);h.endSpeech();assert.equal(h.spoken.length,1,'late completion after pause cannot start old events');
 h.synth.speaking=true;h.api.pauseSpeech();assert.equal(h.cancelled.length,1,'a pause never cancels speech it does not own');
}

{
 const l=lot(1,{sellerOwnerId:'alice',auctionUpdatedAt:new Date(NOW).toISOString()}),h=boot({lots:[l]});h.set('spoken');h.set('newBidOwn');
 const key='fas-assistant-preferences-v1:alice',remote=JSON.parse(h.records[key]);remote.preferences.spoken=false;remote.preferences.quiet=true;remote.seen=['remote-notice'];h.records[key]=JSON.stringify(remote);
 const event={actorOwn:false,lotId:1,price:1000,occurredAt:new Date(NOW).toISOString()};assert.equal(h.api.onAuctionUpdate(event).ok,true);assert.equal(h.spoken.length,0,'an update rereads a newer other-tab mute even before its storage event arrives');
 const merged=JSON.parse(h.records[key]);assert.equal(merged.preferences.spoken,false);assert.equal(merged.preferences.quiet,true);assert(merged.seen.includes('remote-notice'),'notice persistence merges another tab dedupe entries');
 h.set('endingSoon');assert.equal(JSON.parse(h.records[key]).preferences.quiet,true,'a preference edit preserves unrelated latest settings');
}

{
 const l=lot(1,{sellerOwnerId:'alice',auctionUpdatedAt:new Date(NOW).toISOString()}),first=boot({lots:[l]});first.set('spoken');
 const h=boot({lots:[l],records:first.records,failStorage:true});h.set('newBidOwn');h.set('endingSoon');assert.equal(h.api.state().newBidOwn,true,'failed saves preserve earlier session choices across additional edits');
 h.api.onAuctionUpdate({actorOwn:false,lotId:1,price:1000,occurredAt:new Date(NOW).toISOString()});assert.equal(h.spoken.length,1,'event revalidation retains explicitly reported session-only settings');
 h.failStorage(false);h.set('quiet');const saved=JSON.parse(h.records['fas-assistant-preferences-v1:alice']);assert.equal(saved.preferences.newBidOwn,true);assert.equal(saved.preferences.endingSoon,true,'a later successful save retains session-only edits');
}

{
 let reads=0;const raw=Array.from({length:52870},(_,i)=>lot(i+1)),lots=new Proxy(raw,{get(target,k,receiver){if(/^\d+$/.test(String(k)))reads++;return Reflect.get(target,k,receiver)}}),h=boot({lots,favorites:[1]});
 for(let i=0;i<100;i++)h.api.tick();assert.equal(reads,0,'disabled events do no inventory work');h.set('priceDrop');h.api.tick();assert.equal(reads,52870);for(let i=0;i<100;i++)h.api.tick();assert.equal(reads,52870,'subsequent ticks inspect watched IDs with cached index');
 h.set('spoken');h.set('endingSoon');h.setMic(true);raw[0].ends=new Date(NOW+60000).toISOString();h.api.tick();assert.equal(h.spoken.length,0,'assistant never talks over a live microphone');
}
{
 // Exercise the production storage path, without the getProfileId test adapter.
 const key='fas-seller-workspace-v1',records={[key]:JSON.stringify({version:1,profile:{id:'alice'},drafts:Array.from({length:100},(_,id)=>({id,description:'x'.repeat(4000)}))})};
 let workspaceParses=0,denied=false;
 const context={console,Date,Number,String,Object,Array,Map,Set,JSON:{stringify:JSON.stringify,parse(raw){if(raw===records[key])workspaceParses++;return JSON.parse(raw)}},document:{hidden:false,addEventListener(){},querySelectorAll(){return[]}},localStorage:{getItem(k){if(denied)throw Error('storage denied');return records[k]??null},setItem(k,v){if(denied)throw Error('storage denied');records[k]=v}},setInterval(){},addEventListener(){}};
 context.window=context;vm.runInNewContext(source,context);const api=context.FasAssistantPreferences;
 assert.equal(api.state().scope,'alice');assert.equal(workspaceParses,1);
 for(let i=0;i<100;i++)api.tick();assert.equal(workspaceParses,1,'unchanged 400KB workspace is not reparsed by disabled-event ticks');
 api.execute({type:'set',key:'outbid',value:true});
 records[key]=JSON.stringify({version:1,profile:{id:'bob'},drafts:[]});assert.equal(api.state().scope,'bob');assert.equal(api.state().outbid,false);assert.equal(workspaceParses,2,'new profile bytes are parsed once and do not inherit old settings');
 records[key]='{corrupt';assert.equal(api.state().scope,'device');for(let i=0;i<20;i++)api.tick();assert.equal(workspaceParses,3,'unchanged corrupt bytes stay safely scoped without repeated parsing');
 records[key]=JSON.stringify({version:1,profile:{id:'alice'},drafts:[]});assert.equal(api.state().scope,'alice');assert.equal(api.state().outbid,true);
 denied=true;assert.equal(api.state().scope,'device','storage denial never keeps a stale private profile');denied=false;assert.equal(api.state().scope,'alice','storage recovery restores the still-current profile');
 delete records[key];assert.equal(api.state().scope,'device','workspace removal resets profile scope');
}
console.log('PASS: six opt-in local event criteria, pure voice parsing, confirmed own-bid/notice provenance, durable dedupe, profile/visibility/microphone speech guards, quiet windows, scheduled price drops, honest completion and bounded indexed watching.');

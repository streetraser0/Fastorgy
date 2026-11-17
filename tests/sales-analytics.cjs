const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const code=fs.readFileSync('dist/sales-analytics.js','utf8');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const now=Date.now(),soldAt=new Date(now-3600000).toISOString();
const sale=(extra={})=>({id:'sale-1',lotId:81,name:'Toyota RAV4',category:'cars',categoryLabel:'Легковые автомобили',region:'Воронежская область',amount:1000000,soldAt,participantCount:null,bidCount:8,method:'auction',source:'demo',...extra});
function response(data,status=200,type='application/json'){return {ok:status>=200&&status<300,status,headers:{get:()=>type},json:async()=>data}}
function payload(records){let sum=0n,participants=0n,known=0;for(const row of records){sum+=BigInt(row.amount);if(row.participantCount!==null){participants+=BigInt(row.participantCount);known++}}return {source:'demo',records,summary:{dealCount:records.length,totalAmount:sum.toString(),averageAmount:records.length?Number(sum/BigInt(records.length)):0,reportedParticipantCount:known?participants.toString():null,participantKnownDeals:known},categories:[],availableCategories:[{category:'cars',categoryLabel:'Легковые автомобили'}]}}
function boot(options={}){
 const h=setup({mobile:true}),requests=[],intervals=new Map();let nextInterval=0;
 h.context.location={protocol:options.native?'capacitor:':'https:',origin:'https://example.test'};h.context.URLSearchParams=URLSearchParams;h.context.Blob=Blob;h.context.URL=URL;
 h.context.setInterval=(fn,ms)=>{const id=++nextInterval;intervals.set(id,{fn,ms});return id};h.context.clearInterval=id=>intervals.delete(id);
 if(options.cars)h.context.cars=options.cars;
 if(options.footer){h.add('site-user-count','strong').textContent='—';h.add('site-users-online','strong').textContent='—';h.add('site-user-count-status','small')}
 h.context.fetch=async(path,init)=>{requests.push({path,init});if(options.fetch)return options.fetch(path,init);if(path.startsWith('/api/metrics/'))return response({totalUsers:15,onlineUsers:2});return response(payload(options.records||[]))};
 vm.runInContext(code,h.context);
 const dialog=h.document.querySelector('#sales-analytics-dialog'),field=id=>dialog.querySelector('#'+id);
 field('sales-period').value='year';field('sales-category').value='';
 return {...h,requests,intervals,dialog,field,api:h.context.FasSalesAnalytics,visitors:h.context.FasVisitorCounter};
}
(async()=>{
 {
  const records=[sale(),sale({id:'sale-2',lotId:82,name:'=HYPERLINK("evil")',amount:2500000,participantCount:3,bidCount:11,region:'<img src=x onerror=alert(1)>'}),sale({id:'old',lotId:83,soldAt:'2020-01-01T00:00:00.000Z'})];
  const h=boot({records});h.modal.showModal();h.content.innerHTML='<textarea id="unsaved-editor">Остаться в форме</textarea>';const editor=h.content.firstChild;editor.focus();h.modal.scrollTop=400;
  h.api.open();await pause();assert.equal(h.api.state().loaded,true);assert.equal(h.api.state().count,2,'expired server records never leak into current annual history');assert.equal(h.modal.open,true);assert.strictEqual(h.content.firstChild,editor);assert.equal(h.modal.scrollTop,400);
  assert.equal(h.document.activeElement,h.field('sales-analytics-title'));assert.equal(h.dialog.getAttribute('aria-labelledby'),'sales-analytics-title');assert.equal(h.requests.length,1);assert(h.requests[0].path.includes('period=year'));assert.equal(h.requests[0].init.credentials,'same-origin');assert.equal(h.requests[0].init.cache,'no-store');
  const history=h.field('sales-history').innerHTML;assert(!history.includes('<img src=x'));assert(history.includes('&lt;img'));assert(history.includes('<td>—</td>'),'unknown participants remain unknown rather than copied from eight bids');
  const csv=h.api.toCSV();assert(csv.startsWith('\ufeff'));assert(csv.includes('"\'=HYPERLINK(""evil"")"'),'CSV protects spreadsheet formulas');assert(csv.includes('"";"8"'),'unknown participant count stays blank while bid count is8');assert(!csv.includes('2020-01-01'));
  h.api.close();assert.equal(h.document.activeElement,editor);assert.equal(h.modal.open,true);assert(!h.body.classList.contains('sales-analytics-open'));
 }
 {
  const h=boot({fetch:async()=>response({},401)});h.api.open();await pause();assert.equal(h.api.state().loaded,false);assert.match(h.field('sales-analytics-status').textContent,/Войдите/);assert.match(h.field('sales-analytics-metrics').innerHTML,/—/);assert.equal(h.field('sales-export').disabled,true);
  h.context.fetch=async()=>response({},200,'text/html');await h.api.refresh();assert.match(h.field('sales-analytics-status').textContent,/Войдите/,'an HTML auth redirect never becomes fake0sales');
 }
 {
  let resolves=[];const h=boot({fetch:()=>new Promise(resolve=>resolves.push(resolve))});h.api.open();h.api.close();h.api.open();assert.equal(resolves.length,2);resolves[1](response(payload([sale({lotId:91,id:'new'})])));await pause();assert.equal(h.api.state().count,1);resolves[0](response(payload([sale({lotId:92,id:'stale'}),sale({lotId:93,id:'stale2'})])));await pause();assert.equal(h.api.state().count,1,'old fetch cannot replace a reopened dialog');
 }
 {
  const posts=[];let reject=false;const h=boot({fetch:async(path,init)=>{if(init?.method==='POST'){if(reject)throw Error('offline');posts.push(JSON.parse(init.body));return response({accepted:JSON.parse(init.body).records.length,duplicates:0,source:'demo'})}return response(payload([]))}});
  const sold={id:81,demo:true,status:'sold',name:'Проданный демолот',category:'cars',city:'Воронеж',soldAt,soldPrice:1000000,bids:9,phone:'PRIVATE-PHONE',participantCount:undefined};
  const rows=[sold,{...sold,id:82,status:'live'},{...sold,id:83,soldPrice:'1000'},{...sold,id:84,soldAt:'invalid'}];
  await h.api.captureSales(rows,{});assert.equal(posts.length,1);assert.equal(posts[0].records.length,1);const event=posts[0].records[0];assert.equal(event.participantCount,null);assert.equal(event.bidCount,9);assert(!Object.hasOwn(event,'source'));assert(!Object.hasOwn(event,'id'));assert(!JSON.stringify(event).includes('PRIVATE-'));
  await h.api.captureSales(rows);assert.equal(posts.length,1,'successful sale is not uploaded again on every save');
  reject=true;await h.api.captureSales([{...sold,id:85}]);assert.equal(h.api.state().pending,1);reject=false;await h.api.captureSales([{...sold,id:85}]);assert.equal(h.api.state().pending,0,'failed upload remains queued and can be retried safely');
 }
 {
  let resolvePost;const h=boot({fetch:()=>new Promise(resolve=>resolvePost=resolve)});const row={id:55,demo:true,status:'sold',name:'Демолот',category:'cars',soldAt,soldPrice:5000,bids:5};const first=h.api.captureSales([row]);h.api.captureSales([row]);assert.equal(h.requests.length,1,'overlapping save hooks share one financial-record sync');resolvePost(response({accepted:0,duplicates:0}));await first;assert.equal(h.api.state().pending,1,'incomplete acknowledgement cannot silently drop a sale');
 }
 {
  let limited=true;const posts=[],rows=[55,56].map(id=>({id,demo:true,status:'sold',name:'Исходный демолот',category:'cars',soldAt,soldPrice:5000,bids:5}));
  const h=boot({fetch:async(path,init)=>{if(init?.method==='POST'){const batch=JSON.parse(init.body).records;posts.push(batch);return limited?response({error:'demo-history-limit',message:'UNTRUSTED SERVER MESSAGE',accepted:1,duplicates:0,rejected:batch.length-1},409):response({accepted:batch.length-1,duplicates:1})}return response(payload([sale()]))}});
  const result=await h.api.captureSales(rows);assert.equal(result.error,'history-limit');assert.equal(h.api.state().pending,2,'a partial409 without acknowledged IDs cannot discard either queued row');assert.equal(posts.length,1);
  h.api.open();await pause();assert.equal(h.api.state().loaded,true,'quota does not prevent reading previously retained history');assert.match(h.field('sales-analytics-status').textContent,/10 000.*за год/);assert.match(h.field('sales-analytics-status').textContent,/2 записей ожидают/);assert(!h.field('sales-analytics-status').textContent.includes('UNTRUSTED'));
  const expanded=[...rows,{...rows[0],id:57}];await h.api.captureSales(expanded);h.document.hidden=true;h.event('visibilitychange');h.document.hidden=false;h.event('visibilitychange');await pause();await h.api.refresh();assert.equal(posts.length,1,'capture, visibility and history reads do not automatically retry a full ledger');assert.equal(h.api.state().pending,3);
  h.field('sales-refresh').onclick();await pause();assert.equal(posts.length,2,'explicit refresh may retry after a history limit');assert.equal(h.api.state().pending,3,'another partial409 leaves every uncertain row queued');assert.equal(h.api.state().captureError,'history-limit');
  limited=false;h.field('sales-refresh').onclick();await pause();assert.equal(posts.length,3);assert.equal(posts[2].length,3,'retry includes uncertain previously accepted rows for server deduplication');assert.equal(h.api.state().pending,0);assert.equal(h.api.state().captureError,null);assert(!h.field('sales-analytics-status').textContent.includes('Достигнут лимит'));
 }
 {
  let page=0;const outside=sale({id:'legacy-outside',lotId:810,category:'legacy_outside_groups',name:'Сохранённая сделка вне списка категорий'}),older=sale({id:'legacy-next',lotId:811,category:'legacy_outside_groups',name:'Следующая сохранённая сделка'});
  const h=boot({fetch:async()=>{page++;const data=payload(page===1?[outside]:[older]);data.summary.dealCount=10002;data.summary.totalAmount='10002000000';data.nextOffset=page===1?100:null;if(page===1){data.categoryGroupsLimit=100;data.categoryGroupsTruncated=true;data.availableCategoriesTruncated=true;data.categories=[{category:'cars',categoryLabel:'Автомобили',dealCount:1,totalAmount:1000,averageAmount:1000,reportedParticipantCount:null,participantKnownDeals:0}]}return response(data)}});
  h.api.open();await pause();let status=h.field('sales-analytics-status').textContent;assert.match(status,/1 из 10002/);assert.match(status,/Сводка по категориям содержит только часть/);assert.match(status,/В фильтре показаны не все категории/);assert.match(status,/постраничная история учитывают все сделки/);assert(h.field('sales-analytics-metrics').innerHTML.includes('10 002'),'legacy totals are not replaced by the bounded group list');assert(h.field('sales-history').innerHTML.includes(outside.name),'records outside the bounded category list remain in the all-category history');
  await h.api.loadMore();status=h.field('sales-analytics-status').textContent;assert.match(status,/2 из 10002/);assert.match(status,/В фильтре показаны не все категории/,'pagination without new metadata preserves the existing notice');assert(h.requests[1].path.includes('offset=100'));assert(h.api.toCSV().includes(older.name),'legacy records remain reachable and exportable beyond the initial page');
 }
 {
  const oldest=sale({id:'old-page',lotId:90001,soldAt:new Date(now-300*86400000).toISOString()}),first=sale({id:'first-page',lotId:90002});let page=0;
  const h=boot({fetch:async path=>{page++;const data=payload(page===1?[first]:[oldest]);data.summary.dealCount=10001;data.summary.totalAmount='10001000000';data.nextOffset=page===1?10000:null;data.truncated=page===1;return response(data)}});
  h.api.open();await pause();assert.equal(h.api.state().nextOffset,10000);assert.match(h.field('sales-analytics-status').textContent,/1 из 10001/);await h.api.loadMore();assert(h.requests[1].path.includes('offset=10000'),'history remains reachable beyond an initial10000record window');assert(h.requests[1].path.includes('limit=100'));assert.equal(h.api.state().count,2);assert.equal(h.api.state().nextOffset,null);assert(h.api.toCSV().includes('90001'),'export includes loaded older pages');assert.match(h.field('sales-export').textContent,/загруженных/);
 }
 {
  const huge=Number.MAX_SAFE_INTEGER,h=boot({records:[sale({amount:huge}),sale({id:'huge-2',lotId:82,amount:huge})]});h.api.open();await pause();assert(h.field('sales-analytics-metrics').innerHTML.includes('18 014 398 509 481 982'),'aggregate amounts retain integer precision beyond a single safe number');
 }
 {
  const posts=[],retained={id:151,demo:true,status:'sold',name:'Сохранённая демосделка',category:'cars',soldAt,soldPrice:15000,bids:21};
  const h=boot({cars:[retained,{...retained,id:152,status:'live'},{...retained,id:153,soldAt:'2020-01-01T00:00:00Z'}],fetch:async(path,init)=>{posts.push(JSON.parse(init.body));return response({accepted:1,duplicates:0,source:'demo'})}});await pause();assert.equal(posts.length,1,'retained completed records sync once on startup');assert.equal(posts[0].records.length,1);assert.equal(posts[0].records[0].participantCount,null);assert.equal(posts[0].records[0].bidCount,21);assert.equal(h.api.state().pending,0);
 }
 {
  const h=boot({footer:true});await pause();assert.equal(h.document.getElementById('site-user-count').textContent,'15');assert.equal(h.document.getElementById('site-users-online').textContent,'2');assert.equal(h.requests.length,1);assert.equal(h.intervals.size,1);
  h.document.hidden=true;h.event('visibilitychange');assert.equal(h.intervals.size,0);const before=h.requests.length;await h.visitors.refresh();assert.equal(h.requests.length,before,'hidden page sends no visitor heartbeat');h.document.hidden=false;h.event('visibilitychange');await pause();assert.equal(h.intervals.size,1);assert.equal(h.requests.length,before+1);
 }
 {
  const h=boot({footer:true,native:true});await pause();assert.equal(h.requests.length,0,'native app does not bypass private-site identity');assert.equal(h.document.getElementById('site-user-count').textContent,'—');assert.match(h.document.getElementById('site-user-count-status').textContent,/на сайте/);
 }
 {
  const h=boot({footer:true,fetch:async()=>response({},503)});await pause();assert.equal(h.document.getElementById('site-user-count').textContent,'—');assert.equal(h.document.getElementById('site-users-online').textContent,'—');assert.match(h.document.getElementById('site-user-count-status').textContent,/недоступен/);
 }
 {
  const {boot:catalogue}=require('./helpers/category-seller-harness.cjs');
  for(const failed of [false,true]){const h=catalogue({failLots:failed});h.run('window.saleCaptureCalls=0;window.FasSalesAnalytics={captureSales(){window.saleCaptureCalls++;return Promise.resolve({ok:true})}};saveLots()');assert.equal(h.context.window.saleCaptureCalls,failed?0:1,'only a durable lot save may trigger sales capture')}
 }
 console.log('PASS: server sales history, unknown participant counts, CSV escaping, safe capture/deduplication/retry, quota pause/explicit retry, bounded category notices with legacy pagination, dialog races/focus and actual visitor counter auth/lifecycle states.');
})().catch(error=>{console.error(error);process.exitCode=1});

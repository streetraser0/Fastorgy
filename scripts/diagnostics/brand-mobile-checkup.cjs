/* Isolated Chrome QA for the current brand, responsive lot layout and cabinet. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const zlib=require('node:zlib');
const {chromium}=require(process.env.FAS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),web=path.join(root,'dist');
const out=path.resolve(process.env.FAS_BROWSER_REPORT_DIR||path.join(root,'test-results/brand-mobile'));
const phases=(process.env.FAS_BRAND_MOBILE_PHASES||'brand,lot,cabinet').split(',');
const baseline=process.env.FAS_BROWSER_BASELINE||'current working tree';
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(name.startsWith('api/')){res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"authentication-required"}');return;}
  const file=path.resolve(web,name);if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
  let data=fs.readFileSync(file);const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'};
  if(/\.(html|js|css|json|svg)$/.test(file)){data=zlib.gzipSync(data);headers['Content-Encoding']='gzip';}
  res.writeHead(200,headers).end(data);
 }catch{res.writeHead(404).end();}
});
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const android='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const cases=[
 {name:'desktop1366',width:1366,height:900},
 {name:'ios320',width:320,height:740,mobile:true,userAgent:ios},
 {name:'ios390',width:390,height:844,mobile:true,userAgent:ios},
 {name:'android320',width:320,height:740,mobile:true,userAgent:android},
 {name:'android390',width:390,height:844,mobile:true,userAgent:android},
 {name:'android412',width:412,height:915,mobile:true,userAgent:android},
 {name:'native-android412',width:412,height:915,mobile:true,userAgent:android,native:true},
 {name:'native-ios390',width:390,height:844,mobile:true,userAgent:ios,native:true}
].filter(c=>!process.env.FAS_BROWSER_CASES||process.env.FAS_BROWSER_CASES.split(',').includes(c.name));
const report={baseline,phases,started:new Date().toISOString(),method:'Local isolated Chrome; iOS/Android UA, viewport and touch emulation. Native checks emulate Capacitor and native-app class; no physical device, Safari/WebKit, package install, real login or publication.',cases:[]};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
let browser,base;
async function activate(page,selector,config){const target=page.locator(selector).first();if(config.mobile)await target.tap();else await target.click();}
async function ready(page){await page.waitForFunction(()=>typeof cars!=='undefined'&&window.FasSellerUI&&document.querySelector('#grid .card'));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);}
async function imageReady(page,selector){await page.waitForFunction(sel=>{const i=document.querySelector(sel);return i?.complete&&i.naturalWidth>0;},selector);}
async function screen(page,name){await page.screenshot({path:path.join(out,name+'.png')});}
async function noOverflow(page,selector='html'){
 const dimensions=await page.locator(selector).evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,viewport:innerWidth,document:document.documentElement.scrollWidth}));
 assert(dimensions.scroll<=dimensions.width+1,selector+' horizontal overflow: '+JSON.stringify(dimensions));
 assert(dimensions.document<=dimensions.viewport,'Page horizontal overflow');
}
async function logo(page,selector){
 await imageReady(page,selector);
 const value=await page.locator(selector).first().evaluate(image=>{const r=image.getBoundingClientRect(),s=getComputedStyle(image);return {src:image.currentSrc,alt:image.alt,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,width:r.width,height:r.height,x:r.x,y:r.y,objectFit:s.objectFit,background:s.backgroundColor};});
 assert(value.alt&&value.width>=60&&value.height>=18,'Logo needs an accessible name and readable dimensions');
 assert(Math.abs(value.width/value.height-value.naturalWidth/value.naturalHeight)<.7||value.objectFit==='contain','Logo aspect ratio must not stretch its lettering');
 return value;
}
async function home(page,config){
 const inDialog=page.locator('dialog[open] [data-fas-home-navigation]').first();
 if(await inDialog.count()){if(config.mobile)await inDialog.tap();else await inDialog.click();}
 else await activate(page,'header a[href="#home"]',config);
 await page.waitForTimeout(300);
}
async function brand(page,result,config){
 result.headerLogo=await logo(page,'header .brand-logo');await noOverflow(page);await screen(page,config.name+'-home');
 await activate(page,'#home-open-feed',config);await page.waitForFunction(()=>document.body.classList.contains('reels'));
 if(await page.locator('#feed-tutorial').isVisible())await activate(page,'#feed-tutorial button',config);
 result.feedLogo=await logo(page,'.reels-logo-wrap .brand-logo');result.feedSpacing=await page.evaluate(()=>{const header=document.querySelector('.reels-header').getBoundingClientRect(),tag=document.querySelector('#grid .card .tag').getBoundingClientRect();return{headerBottom:header.bottom,lotLabelTop:tag.top}});assert(result.feedSpacing.lotLabelTop>=result.feedSpacing.headerBottom-1,'Centered feed logo/header must not overlap the lot label');await screen(page,config.name+'-feed-brand');
 await activate(page,'#close-reels',config);await page.waitForFunction(()=>!document.body.classList.contains('reels'));
 result.checks.push('Loaded named brand mark on light header and dark feed; feed closes normally');
}
async function lot(page,result,config){
 await page.locator('#search').fill('SITRAK C7H');await activate(page,'#filters > button.primary',config);
 await page.waitForFunction(()=>visibleLots.length>0&&visibleLots.every(l=>l.demoVehicleSample==='sitrak-c7h'));
 await page.locator('#grid .card h3[data-open]').first().scrollIntoViewIfNeeded();await page.waitForTimeout(450);
 await activate(page,'#grid .card h3[data-open]',config);await page.locator('#modal.lot-dialog[open]').waitFor();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);await noOverflow(page,'#modal');
 const selectors=['.lot-swipe-surface','.lot-detail-heading','.lot-detail-offer','.lot-detail-overview','.lot-detail-specifications'];
 result.lotLayout=await page.evaluate(selectors=>Object.fromEntries(selectors.map(s=>{const e=document.querySelector('#modal '+s);if(!e)return[s,null];const r=e.getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}];})),selectors);
 for(const selector of selectors)assert(result.lotLayout[selector]?.width>0,'Missing visible lot section '+selector);
 const media=result.lotLayout['.lot-swipe-surface'],heading=result.lotLayout['.lot-detail-heading'],offer=result.lotLayout['.lot-detail-offer'],facts=result.lotLayout['.lot-detail-overview'];
 if(config.mobile){assert(media.y<heading.y&&heading.y<offer.y&&offer.y<facts.y,'Mobile order: photo, heading, offer, details');}
 else{assert(media.right<=offer.x+2&&facts.right<=offer.x+2,'Desktop photo/details remain left of offer');assert(heading.y<media.y&&media.bottom<=facts.y+2,'Desktop heading, photo and details stay in reading order');}
 await imageReady(page,'#modal .gallery-track img');
 const submit=page.locator('#modal .purchase-submit').first();assert(await submit.count());await submit.scrollIntoViewIfNeeded();assert(await submit.isVisible());
 const bid=page.locator('#bid');if(await bid.count()){const before=Number(await bid.inputValue());await activate(page,'[data-bid-step="1"]',config);assert(Number(await bid.inputValue())>before,'Bid stepper stays functional');}
 await page.locator('#modal').evaluate(e=>e.scrollTop=0);await screen(page,config.name+'-lot');
 await activate(page,'#modal .gallery-track img',config);await page.locator('#lot-photo-viewer[open]').waitFor();
 await imageReady(page,'#lot-photo-viewer .photo-viewer-canvas img');result.viewerLogo=await logo(page,'.photo-viewer-brand');
 await activate(page,'[data-photo-zoom-in]',config);assert.equal(await page.locator('[data-photo-reset]').innerText(),'150%');await activate(page,'[data-photo-reset]',config);
 await screen(page,config.name+'-photo-brand');await activate(page,'[data-photo-close]',config);
 assert(await page.locator('#modal').evaluate(e=>e.open),'Photo Back preserves underlying lot');
 await activate(page,'#modal [data-quick="back"]',config);await page.waitForFunction(()=>!document.querySelector('#modal').open);await home(page,config);
 result.checks.push('Current responsive lot layout, bid stepper, loaded original photo, zoom and nested Back');
}
async function cabinet(page,result,config){
 await activate(page,'#account',config);await page.waitForTimeout(350);
 assert(await page.evaluate(()=>window.FasCabinetLayout?.active()===true),'Shared cabinet should work on every tested platform');
 const side=await page.locator('.seller-desktop-sidebar').boundingBox(),main=await page.locator('.seller-desktop-main').boundingBox();
 assert(side.x+side.width<=main.x+1,'Cabinet sidebar remains left of main content');await noOverflow(page,'#modal');
 assert.equal(await page.locator('.seller-account-tabs [data-seller-tab="draft"]').count(),1);assert.equal(await page.locator('.seller-tabs [data-seller-tab="draft"]').count(),0);
 await activate(page,'.seller-create-button',config);await page.locator('#seller-listing-form [name="name"]').fill('QA общий мобильный кабинет');
 await page.locator('#seller-listing-form [name="description"]').fill('Контрольный черновик: текст и фото должны восстановиться после перезагрузки.');
 await page.locator('#seller-files').setInputFiles(path.join(web,'assets/photos/cars-1.jpg'));await imageReady(page,'#seller-media-grid img');
 await activate(page,'[data-seller-save]',config);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fas-seller-workspace-v1'))?.drafts.some(d=>d.data.name==='QA общий мобильный кабинет'&&d.mediaRefs?.length===1));
 await activate(page,'[data-seller-dashboard]',config);await page.waitForTimeout(200);const details=page.locator('.cabinet-drafts');
 assert.equal(await details.count(),1);assert.equal(await details.evaluate(e=>e.open),false);assert.equal(await details.locator('.seller-row').count(),1);
 assert.equal(await page.locator('.seller-list > .seller-row').count(),0);await activate(page,'.cabinet-drafts > summary',config);assert(await details.locator('[data-seller-edit]').isVisible());
 await noOverflow(page,'#modal');await page.locator('#modal').evaluate(e=>e.scrollTop=0);await screen(page,config.name+'-cabinet');
 await page.reload({waitUntil:'load'});await ready(page);await activate(page,'#account',config);await activate(page,'.seller-account-tabs [data-seller-tab="draft"]',config);
 assert.equal(await page.locator('.seller-account-tabs [data-seller-tab="all"]').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.seller-list > .seller-row').count(),1);
 await activate(page,'[data-seller-edit]',config);assert.equal(await page.locator('#seller-listing-form [name="name"]').inputValue(),'QA общий мобильный кабинет');await imageReady(page,'#seller-media-grid img');
 assert.match(await page.locator('#seller-media-grid img').getAttribute('src'),/^blob:/);await activate(page,'[data-seller-dashboard]',config);
 await activate(page,'[data-seller-tab="profile"]',config);await noOverflow(page,'#modal');
 const name=page.locator('#seller-profile-form [name="displayName"]');await name.fill('Не потерять данные');await page.locator('#seller-profile-form [name="phone"]').fill('123');
 await activate(page,'[data-seller-tab="all"]',config);assert.equal(await name.inputValue(),'Не потерять данные');
 await activate(page,'[data-voice-settings-open]',config);await page.keyboard.press('Escape');assert.equal(await name.inputValue(),'Не потерять данные');await noOverflow(page,'#modal');
 await page.locator('#modal').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(350);await screen(page,config.name+'-profile');
 result.cabinetGeometry=await page.evaluate(()=>Object.fromEntries(['.seller-desktop-sidebar','.seller-desktop-main','.seller-account-tabs','.seller-create-button','#seller-profile-form'].map(s=>{const e=document.querySelector('#modal '+s),r=e.getBoundingClientRect();return[s,{x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1)}];})));
 result.checks.push('Shared cabinet, one draft in sidebar/disclosure, real photo persistence after reload, profile validation and nested return');
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.FAS_BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 for(const config of cases){
  const result={name:config.name,config,checks:[],errors:[],errorStacks:[],failedRequests:[]};report.cases.push(result);
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:!!config.mobile,hasTouch:!!config.mobile,userAgent:config.userAgent,serviceWorkers:'block'});
  if(config.native)await context.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};const mark=()=>document.documentElement.classList.add('native-app');if(document.documentElement)mark();else document.addEventListener('DOMContentLoaded',mark,{once:true});});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>{result.errors.push(error.message);result.errorStacks.push(error.stack);});page.on('requestfailed',request=>result.failedRequests.push({url:request.url(),reason:request.failure()?.errorText}));
  try{
   const start=Date.now();await page.goto(base,{waitUntil:'load'});await ready(page);result.readyMs=Date.now()-start;
   if(phases.includes('brand'))await brand(page,result,config);
   if(phases.includes('lot'))await lot(page,result,config);
   if(phases.includes('cabinet'))await cabinet(page,result,config);
   assert.deepEqual(result.errors,[],'Uncaught JavaScript errors');result.passed=true;console.log(config.name+': PASS');
  }catch(error){result.passed=false;result.failure=error.stack;process.exitCode=1;console.log(config.name+': FAIL '+error.message);await screen(page,config.name+'-failure').catch(()=>{});}
  finally{save();await context.close();}
 }
 const byName=Object.fromEntries(report.cases.map(c=>[c.name,c]));report.parity=[];
 for(const [a,b]of [['ios320','android320'],['ios390','android390'],['ios390','native-ios390'],['android412','native-android412']]){
  if(!byName[a]?.passed||!byName[b]?.passed||!byName[a].cabinetGeometry)continue;
  const equal=JSON.stringify(byName[a].cabinetGeometry)===JSON.stringify(byName[b].cabinetGeometry);report.parity.push({a,b,equal});if(!equal){process.exitCode=1;console.log(a+' / '+b+': cabinet geometry differs');}
 }
 report.finished=new Date().toISOString();save();console.log(JSON.stringify({passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,parity:report.parity,report:path.join(out,'report.json')}));
})().catch(error=>{report.failure=error.stack;process.exitCode=1;save();console.error(error);}).finally(async()=>{await browser?.close();server.close();});

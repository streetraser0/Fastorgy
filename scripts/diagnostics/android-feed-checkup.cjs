'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.FAS_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.FAS_BROWSER_BASE_URL;
if(!base)throw new Error('Set FAS_BROWSER_BASE_URL to the local preview URL.');
const out=path.resolve(process.env.FAS_BROWSER_REPORT_DIR||'test-results/android-feed');
fs.mkdirSync(out,{recursive:true});
const android='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const cases=[
 {name:'android-fresh-low',mobile:true,ua:android,empty:true,uiLow:true},
 {name:'android-saved-low',mobile:true,ua:android,empty:true,modes:['low']},
 {name:'android-saved-low-ending',mobile:true,ua:android,empty:true,modes:['low','ending']},
 {name:'ios-nonempty',mobile:true,ua:ios},
 {name:'desktop-nonempty',mobile:false}
];
const report={started:new Date().toISOString(),baseline:'10affae27c23238ca9ff6bda804f3b1028dba486',method:'Isolated Google Chrome, trusted Playwright touch/mouse input; mobile UA/viewport emulation, service workers allowed; real locally served application; no real Android/iOS device.',cases:[]};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
async function ready(page){await page.waitForFunction(()=>typeof openLocalFeed==='function'&&window.FasFeaturedLots&&document.querySelector('#grid .card'));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);}
async function tap(page,selector,c){const element=page.locator(selector).first();await element.scrollIntoViewIfNeeded();await page.waitForTimeout(300);if(c.mobile)await element.tap();else await element.click();}
async function snapshot(page){return page.evaluate(()=>({modes:localStorage.getItem('fas-featured-modes-v1'),region:localStorage.getItem('fas-region'),recent:localStorage.getItem('fas-recent-lots-v1'),category:document.querySelector('#category').value,filterRegion:document.querySelector('#region-filter').value,search:document.querySelector('#search').value}));}
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.FAS_BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 for(const config of cases){
  const result={name:config.name,errors:[],events:[],passed:false};report.cases.push(result);
  const context=await browser.newContext({viewport:{width:config.mobile?412:1366,height:config.mobile?915:900},isMobile:config.mobile,hasTouch:config.mobile,...(config.ua?{userAgent:config.ua}:{})});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>result.errors.push(error.stack));
  await page.addInitScript(()=>{window.feedProbeEvents=[];document.addEventListener('click',e=>{if(e.target.closest?.('#home-open-feed,[data-featured-empty-settings],[data-featured-mode]'))window.feedProbeEvents.push({trusted:e.isTrusted,target:e.target.closest('button')?.outerHTML.slice(0,200)});},true);});
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});await ready(page);
   // Existing, valid recent IDs and a selected region are fixture data only in this isolated context.
   await page.evaluate(config=>{localStorage.setItem('fas-region',JSON.stringify({code:'36',scope:'all'}));localStorage.setItem('fas-recent-lots-v1',JSON.stringify(cars.filter(isLotLive).slice(0,2).map(lot=>lot.id)));if(config.modes)localStorage.setItem('fas-featured-modes-v1',JSON.stringify(config.modes));},config);
   await page.reload({waitUntil:'domcontentloaded'});await ready(page);
   if(config.uiLow)await tap(page,'[data-featured-mode="low"]',config);
   result.before=await snapshot(page);
   if(config.empty){
    assert.equal(await page.locator('#featured-empty').isVisible(),true,'The selected combination must actually be empty');
    await tap(page,'#home-open-feed',config);
    result.feedback=await page.evaluate(()=>({reels:document.body.classList.contains('reels'),toast:document.querySelector('#toast')?.textContent,empty:document.querySelector('#featured-empty')?.textContent,settingsHidden:document.querySelector('#featured-settings-panel')?.hidden,focus:document.activeElement?.getAttribute('data-featured-empty-settings'),actionVisible:!!document.querySelector('[data-featured-empty-settings]')?.getClientRects().length}));
    assert.equal(result.feedback.reels,false,'Do not substitute unrelated lots');
    assert(result.feedback.toast?.trim(),'An empty feed must produce explicit feedback');
    assert(result.feedback.actionVisible,'Provide an explicit settings action');
    assert.equal(result.feedback.settingsHidden,true,'The first tap must not open settings automatically');
    assert.deepEqual(await snapshot(page),result.before,'Empty feedback preserves filters, modes, region and recent history');
    await page.screenshot({path:path.join(out,config.name+'-feedback.png')});
    await tap(page,'[data-featured-empty-settings]',config);
    assert.equal(await page.locator('#featured-settings-panel').isVisible(),true,'Second explicit tap opens settings');
    assert.deepEqual(await snapshot(page),result.before,'Opening settings must not reset preferences');
    await page.screenshot({path:path.join(out,config.name+'-settings.png')});
    await tap(page,'[data-featured-settings-close]',config);
    assert.deepEqual(await snapshot(page),result.before,'Closing settings preserves preferences');
    await tap(page,'[data-featured-mode="low"]',config);
    result.afterManualChange=await snapshot(page);
    assert(!JSON.parse(result.afterManualChange.modes).includes('low'),'Only the explicit user tap removes low');
    assert.equal(result.afterManualChange.region,result.before.region);
    assert.equal(result.afterManualChange.recent,result.before.recent);
   }
   await tap(page,'#home-open-feed',config);
   await page.waitForFunction(()=>document.body.classList.contains('reels')&&document.querySelectorAll('#grid .card').length>0);
   if(await page.locator('#feed-tutorial').isVisible())await tap(page,'#feed-tutorial button',config);
   result.opened=await page.evaluate(()=>({reels:reelsMode,cards:document.querySelectorAll('#grid .card').length,modeSelection:window.FasFeaturedLots.getModes?.(),region:localStorage.getItem('fas-region'),recent:localStorage.getItem('fas-recent-lots-v1')}));
   assert.equal(result.opened.region,result.before.region);assert.equal(result.opened.recent,result.before.recent);
   await page.screenshot({path:path.join(out,config.name+'-opened.png')});
   await tap(page,'#close-reels',config);await page.waitForFunction(()=>!document.body.classList.contains('reels'));
   assert.deepEqual(result.errors,[],'No JavaScript errors');
   result.events=await page.evaluate(()=>window.feedProbeEvents);assert(result.events.length&&result.events.every(e=>e.trusted),'All observed feature actions use trusted browser input');
   result.passed=true;
  }catch(error){result.failure=error.stack;process.exitCode=1;await page.screenshot({path:path.join(out,config.name+'-failure.png')}).catch(()=>{});}
  finally{await context.close();save();console.log(config.name+': '+(result.passed?'PASS':result.failure));}
 }
 report.finished=new Date().toISOString();report.passed=report.cases.filter(c=>c.passed).length;report.total=report.cases.length;
 const source=path.resolve(__dirname,'../../dist/featured-lots.js');report.source={file:'dist/featured-lots.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')};save();
})().catch(error=>{report.failure=error.stack;process.exitCode=1;save();console.error(error);}).finally(()=>browser?.close());

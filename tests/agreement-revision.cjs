/* Material legal changes require new explicit acceptance; old evidence is retained. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');
const KEY='fas-seller-workspace-v1',OLD='2026-11-14',NEXT='2026-11-14-r2';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex'),json=value=>JSON.parse(JSON.stringify(value));
const previous={version:OLD,acceptedAt:'2026-11-14T08:00:00.000Z'};
function legacy(){
 const initial=boot({fixtureInventory:[],profileAccepted:false}),data=JSON.parse(initial.records[KEY]);
 data.profile.agreementAcceptance=previous;data.profile.agreementAcceptanceHistory=[previous];
 const h=boot({fixtureInventory:[],records:{[KEY]:JSON.stringify(data)}});h.context.window.FasSellerUI.openDashboard('profile');
 const control={checked:false,focus(){}},values={...data.profile};
 h.context.FormData=function(form){return Object.entries(form.selector==='#seller-profile-form'?values:raw)};
 h.node('#seller-profile-form').elements={namedItem(name){return name==='agreementAccepted'?control:name==='showPhone'?{checked:false}:null}};
 return {...h,control,values,submit:()=>h.node('#seller-profile-form').onsubmit({preventDefault(){}})};
}
(async()=>{
const h=legacy(),A=h.context.window.FasUserAgreement;
assert.equal(A.version,NEXT);assert.equal(A.isCurrent(previous),false);
const legacyHTML=A.fieldHTML('revision-test',previous);assert(legacyHTML.includes('terms-'+OLD+'.html'));assert(legacyHTML.includes('Новая редакция'));assert(!/<input[^>]*\bchecked\b/.test(legacyHTML));
assert.equal(A.capture({checked:false}),null);const original=h.records[KEY];assert.equal(h.submit(),false);assert.equal(h.records[KEY],original,'a previously accepted revision does not auto-consent to new obligations');
h.control.checked=true;const write=h.context.localStorage.setItem;h.context.localStorage.setItem=(key,value)=>{if(key===KEY)throw Error('quota');write(key,value)};
assert.equal(h.submit(),false);assert.equal(h.records[KEY],original,'failed persistence keeps prior acceptance and history unchanged');assert.equal(h.context.window.FasSellerUI.getProfile().agreementAcceptance.version,OLD);
h.context.localStorage.setItem=write;assert.equal(h.submit(),true);let stored=JSON.parse(h.records[KEY]).profile;
assert.equal(stored.agreementAcceptance.version,NEXT);assert.equal(stored.agreementAcceptanceHistory.length,2);assert.deepEqual(stored.agreementAcceptanceHistory[0],previous);assert.deepEqual(stored.agreementAcceptanceHistory[1],stored.agreementAcceptance);
const accepted=json(stored.agreementAcceptance),history=A.acceptanceHistory(stored.agreementAcceptanceHistory,accepted,accepted);assert(Object.isFrozen(history));assert.equal(history.length,2,'ordinary saves do not duplicate the same explicit acceptance');
const bogus=A.acceptanceHistory([{version:'future',acceptedAt:previous.acceptedAt},{version:OLD,acceptedAt:'invalid'},{version:NEXT,acceptedAt:'2999-01-01T00:00:00.000Z'}],previous,accepted);assert.equal(bogus.length,2,'unrecognized and invalid client evidence is excluded');
const reload=boot({fixtureInventory:[],records:{[KEY]:h.records[KEY]}});reload.context.window.FasSellerUI.openDashboard('profile');assert(!reload.node('#modal-content').innerHTML.includes('name="agreementAccepted"'));assert.deepEqual(JSON.parse(reload.records[KEY]).profile.agreementAcceptanceHistory,stored.agreementAcceptanceHistory);
const oldMeta=JSON.parse(fs.readFileSync('docs/legal/agreement-'+OLD+'.json','utf8')),newMeta=JSON.parse(fs.readFileSync('docs/legal/agreement-'+NEXT+'.json','utf8'));
const archivedHTML=fs.readFileSync('dist/terms-'+OLD+'.html','utf8'),oldBody=archivedHTML.match(/<main class="legal-document" id="agreement-text">([\s\S]*?)<\/main>/)[1].trim();
assert.equal(digest(oldBody),oldMeta.agreementHTMLMainSHA256);assert.equal(digest(fs.readFileSync(oldMeta.agreementMarkdown)),oldMeta.agreementMarkdownSHA256);assert.equal(digest(archivedHTML),newMeta.previousHTMLSHA256);
const oldPrint=JSON.parse(fs.readFileSync('docs/legal/agreement-print-'+OLD+'.json','utf8'));assert.equal(digest(fs.readFileSync(oldPrint.path)),oldPrint.sha256,'old PDF is not silently replaced');
const print=JSON.parse(fs.readFileSync('docs/legal/agreement-print-'+NEXT+'.json','utf8')),pdf=fs.readFileSync(print.path);assert.equal(digest(pdf),print.sha256);assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,print.pages,'reported pages reflect the actual generated PDF');assert(print.pages>0);
const privacy=fs.readFileSync('dist/privacy.html','utf8'),oldPrivacy=fs.readFileSync('dist/privacy-'+OLD+'.html','utf8');const section=value=>value.match(/<section id="phone-consent">([\s\S]*?)<\/section>/)[1].trim();assert.equal(section(privacy),section(oldPrivacy),'new messaging disclosure cannot silently repurpose separate phone-auth consent');
const current=fs.readFileSync('dist/terms.html','utf8');assert(!/все.{0,35}права.{0,25}(?:код|OpenAI).{0,25}принадлежат/iu.test(current));assert(current.includes('применимой лицензией'));assert(current.includes('не гарантирует возникновение'));assert(current.includes('локальный черновик'));assert(current.includes('серверная доставка уведомлений Telegram/MAX не подключена'));
const publication=legacy();publication.context.window.FasSellerUI.openEditor('draft-initial');await publication.publish();assert.equal(publication.run('cars.length'),0,'a filled profile with only old consent cannot publish under the new revision');assert.equal(JSON.parse(publication.records[KEY]).profile.agreementAcceptance.version,OLD);assert.match(publication.node('#seller-error').textContent,/актуальное соглашение/);assert(JSON.parse(publication.records[KEY]).drafts.length>0,'reacceptance guard preserves the draft');
console.log('PASS: new legal revision needs separate unchecked acceptance, retains old archive/evidence and atomic acceptance history, rejects invalid history, preserves phone-consent purpose and verifies both PDF snapshots/pages.');

})().catch(error=>{console.error(error);process.exitCode=1});

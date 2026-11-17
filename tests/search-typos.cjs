const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={console};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/search-typos.js'),'utf8'),context);
const T=context.FasSearchTypos;
const engine=T.create(['экскаватор','погрузчик','ситрак','тойота','квартира','холодильник','Toyota','truck','shacman','С7H','1234']);
for(const [query,expected] of [['эксковатор','экскаватор'],['пагрузчик','погрузчик'],['ситракк','ситрак'],['кавартира','квартира'],['халадильник','холодильник'],['Toyta','toyota'],['tooyta','toyota']]){
 const result=engine.correct(query);assert.equal(result.value,expected,query);assert(result.corrected);assert(!result.ambiguous);assert(result.distance<=2);
}
for(const query of ['Toyota','ситрак','C7H','С7H','X5','JTNB11HK203123456','77:08:0012345:67','1000000','1 000 000','VINCODEABCDEFGHJKL','BMW','abc','ундибумбу']){
 const result=engine.correct(query);assert.equal(result.value,query);assert.equal(result.corrected,false,query+' must remain exact');
}
assert.equal(T.distance('toyota','tooyta',1),1,'adjacent transposition');
assert.equal(T.distance('abcd','abdc',1),1);assert.equal(T.distance('abcd','axyz',1),2,'costs beyond the cap are not fully computed');
assert.equal(T.distance('квартира','квартира',0),0);assert.equal(T.distance('abc','abcd',0),1);
const ambiguous=T.create(['house','horse']).correct('hosse');assert.equal(ambiguous.corrected,false);assert.equal(ambiguous.ambiguous,true);assert.equal(ambiguous.value,'hosse');assert.equal(ambiguous.candidates.length,2);
const guarded=T.create(['abcdefga','abcdefgb','abcdefgc'],{maxCandidates:2});assert.equal(guarded.correct('abcdefgd').reason,'too-broad');assert.equal(guarded.correct('abcdefgd').corrected,false);
const normalized=T.create(['Ситрак','Экскаватор'],{normalize:value=>String(value).toLocaleLowerCase('ru')});assert.equal(normalized.correct('СИТРАКК').value,'ситрак');
const protectedWords=T.create(['truck'],{protected:()=>true});assert.equal(protectedWords.correct('truk').value,'truk');
const before=engine.stats();engine.correct('ситракк');engine.correct('ситракк');const after=engine.stats();assert(after.cacheHits>before.cacheHits);assert.equal(after.distanceChecks,before.distanceChecks,'repeated queries do not compare the vocabulary again');
for(let i=0;i<1000;i++)engine.correct('unknownword'+String.fromCharCode(97+i%26)+String.fromCharCode(97+Math.floor(i/26)%26));assert(engine.stats().cacheSize<=512);
const cap=T.create(['one','two','three','four'],{maxVocabulary:2});assert.equal(cap.stats().vocabularySize,2);
assert(Object.isFrozen(engine.correct('ситракк')));assert(Object.isFrozen(engine.stats()));
console.log('PASS: conservative Russian/English spelling correction, swaps, exact/short/identifier protection, ambiguity, bounded candidates/cache and query-only reusable lookup.');

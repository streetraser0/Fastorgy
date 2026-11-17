const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={window:{},console,Date};vm.createContext(context);
for(const name of ['category-tree.js','search-typos.js','search-identifiers.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',name),'utf8'),context);
const S=context.window.FasKeywordSearch,catalogue=JSON.parse(fs.readFileSync(path.join(root,'dist/data/car-catalog.json'),'utf8'));
const cases=[
 ['haval','Jolion',['Хавал Джолион','Хавал Джулион']],
 ['geely','Monjaro',['Джили Монжаро','Джили Монджаро']],
 ['geely','Coolray',['Джили Кулрей','Джили Кулрэй']],
 ['geely','Tugella',['Джили Тугелла']],
 ['geely','Okavango',['Джили Окаванго']],
 ['omoda','C5',['Омода С5']],['omoda','S5',['Омода S5','Омода Эс5']],
 ['exeed','RX',['Эксид РХ']],['exeed','VX',['Эксид ВХ']],
 ['jetour','Dashing',['Джетур Дашинг']],
 ['voyah','Free',['Войя Фри','Воя Фри']],['voyah','Dream',['Войя Дрим','Воя Дрим']],
 ['zeekr','X',['Зикр Икс','Зикер Икс']],
 ['haval','H9',['Хавал Н9']]
];
for(const [id,model,queries] of cases){
 const make=catalogue.makes.find(make=>make.id===id),entry=make?.models.find(item=>item.name===model);
 assert(entry?.vehicleTypes.includes('cars'),id+' '+model+' is a real passenger model in the pinned catalogue');
 const lot={id:100,category:'cars',subcategory:'cars',brand:make.name,model,name:make.name+' '+model};
 for(const query of queries){assert(S.matches(lot,query),query+' matches '+lot.name);assert.equal(S.inferCategory(query),'cars',query+' remains a passenger car');assert.equal(S.compile(query).corrections.length,0,'known aliases do not need spelling guesses')}
}
const omoda=model=>({category:'cars',subcategory:'cars',brand:'Omoda',model,name:'Omoda '+model});
assert(S.matches(omoda('C5'),'Омода С5'));assert(!S.matches(omoda('S5'),'Омода С5'),'Cyrillic С5 means C5 and cannot also match Latin S5');
assert(S.matches(omoda('S5'),'Омода S5'));assert(!S.matches(omoda('C5'),'Омода S5'),'Latin S5 cannot match C5');
assert(!S.matches({category:'cars',brand:'EXEED',model:'VX',name:'EXEED VX'},'Эксид РХ'));
assert(!S.matches({category:'cars',brand:'EXEED',model:'RX',name:'EXEED RX'},'Эксид ВХ'));
for(const model of ['Tiggo','Tiggo 7 Pro','Tiggo7 Pro'])assert(S.matches({category:'cars',brand:'Chery',model,name:'Chery '+model},'Тигго'),'generic Tiggo prefixes keep matching '+model);
for(const identifier of ['C7H','C9H','X5','JTNB11HK203123456','77:08:0012345:67','SN-MILL-9001'])assert.equal(S.compile(identifier).corrections.length,0,'aliases do not edit numeric model or full identifier codes');
console.log('PASS: confirmed Russian Chinese-model aliases, passenger classification, C5/S5 and RX/VX separation, Tiggo prefixes and identifier protection.');

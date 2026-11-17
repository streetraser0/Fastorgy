/* Shared, side-effect-free numeric query interpretation. No commands or location guesses. */
(()=>{
 'use strict';
 const numberWords={ноль:0,один:1,одна:1,одного:1,одной:1,два:2,две:2,двух:2,три:3,трех:3,четыре:4,четырех:4,пять:5,пяти:5,шесть:6,шести:6,семь:7,семи:7,восемь:8,восьми:8,девять:9,девяти:9,десять:10,десяти:10,одиннадцать:11,одиннадцати:11,двенадцать:12,двенадцати:12,тринадцать:13,тринадцати:13,четырнадцать:14,четырнадцати:14,пятнадцать:15,пятнадцати:15,шестнадцать:16,шестнадцати:16,семнадцать:17,семнадцати:17,восемнадцать:18,восемнадцати:18,девятнадцать:19,девятнадцати:19,двадцать:20,двадцати:20,тридцать:30,тридцати:30,сорок:40,сорока:40,пятьдесят:50,пятидесяти:50,шестьдесят:60,шестидесяти:60,семьдесят:70,семидесяти:70,восемьдесят:80,восьмидесяти:80,девяносто:90,девяноста:90,сто:100,ста:100,двести:200,двухсот:200,триста:300,трехсот:300,четыреста:400,четырехсот:400,пятьсот:500,пятисот:500,шестьсот:600,шестисот:600,семьсот:700,семисот:700,восемьсот:800,восьмисот:800,девятьсот:900,девятисот:900,полтора:1.5,полторы:1.5,zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 const clean=value=>String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 function amountAt(value,measurement=false){
  let position=0,total=0,group=0,found=false,scale=0,currency=false,previousDigit=false;
  while(position<value.length){const gap=value.slice(position).match(position===0?/^[\s\u00a0]*/:/^[\s\u00a0-]*/)[0],start=position+gap.length,match=value.slice(start).match(/^(\d+(?:[.,]\d+)?|[a-zа-яё]+|₽)/i);if(!match)break;const token=clean(match[0]);let accepted=true;
   if(/^\d/.test(token)){if(previousDigit&&(gap.includes('-')||!/^\d{3}$/.test(token)))break;const number=Number(token.replace(',','.'));group=previousDigit&&/^\d{3}$/.test(token)?group*1000+number:group+number;previousDigit=true;found=true}
   else if(Object.hasOwn(numberWords,token)){group+=numberWords[token];previousDigit=false;found=true}
   else if(token==='hundred'){if(!found)break;group=Math.max(1,group)*100;previousDigit=false}
   else if(/^(?:тысяч(?:а|и|у)?|тыс|thousand|k)$/.test(token)||/^(?:миллион(?:а|ов)?|млн|million|m)$/.test(token)||/^(?:миллиард(?:а|ов)?|млрд|billion)$/.test(token)){if(measurement&&token==='m')break;if(!found){if(!/^(?:тысяч|миллион|миллиард|thousand|million|billion)/.test(token))break;group=1;found=true}scale=/^(?:ты|thousand|k$)/.test(token)?1000:/^(?:миллиард|млрд|billion)/.test(token)?1000000000:1000000;total+=Math.max(1,group)*scale;group=0;previousDigit=false;if(/^(?:тыс|млн|млрд)$/.test(token)&&value[start+match[0].length]==='.')match[0]+='.'}
   else if(/^(?:руб(?:ль|ля|лей)?|rub(?:les?)?|roubles?|₽)$/.test(token)){if(!found)break;currency=true;position=start+match[0].length;break}
   else accepted=false;
   if(!accepted)break;position=start+match[0].length;
  }
  return found?{value:total+group,end:position,scale,currency}:null;
 }
 const quantityFields=[
  {key:'year',label:'Год',prefix:'(?:год(?:а|у|ы)?(?: выпуска)?|model year|years?)',unit:'(?:год(?:а|у|ов|ы)?|г\\.?|years?)',integer:true,min:1886,max:()=>new Date().getFullYear()+1},
  {key:'mileage',label:'Пробег',prefix:'(?:(?:с )?пробег(?:ом|а)?|mileage)',unit:'(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km)',suffixUnit:'(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km) (?:пробега|mileage)',integer:true,min:0},
  {key:'area',label:'Площадь',prefix:'(?:(?:с )?площад(?:ь|ью|и)|(?:floor )?area)',unit:'(?:м[²2]|м\\^2|кв\\.?\\s*м(?:етр(?:а|ов)?)?\\.?|квадратн(?:ых|ые|ый|ого) метр(?:а|ов)?|m[²2]|m\\^2|sq\\.?\\s*m|square met(?:er|re)s?|квадрат(?:а|ов)?)',min:Number.MIN_VALUE},
  {key:'powerHp',label:'Мощность',prefix:'(?:мощность|power)',unit:'(?:л\\.?\\s*с\\.?|hp|horsepower)',min:0,requireUnit:true,family:'vehicle'},
  {key:'powerKw',label:'Мощность',prefix:'(?:мощность|power)',unit:'(?:квт|kw|kilowatts?)',min:0,requireUnit:true},
  {key:'storageTb',label:'Накопитель',prefix:'(?:ssd|hdd|накопитель|диск|storage)',unit:'(?:тб|tb|terabytes?)',min:0,noSuffix:true,adjacentNumbers:true,requireUnit:true},
  {key:'ramTb',label:'Оперативная память',prefix:'(?:озу|ram|оперативн(?:ая|ой) памят(?:ь|и))',unit:'(?:тб|tb|terabytes?)',min:0,noSuffix:true,adjacentNumbers:true,requireUnit:true},
  {key:'storageGb',label:'Накопитель',prefix:'(?:ssd|hdd|накопитель|диск|storage)',unit:'(?:гб|gb|gigabytes?|гигабайт(?:а|ов)?)',min:0,noSuffix:true,adjacentNumbers:true,requireUnit:true},
  {key:'ramGb',label:'Оперативная память',prefix:'(?:озу|ram|оперативн(?:ая|ой) памят(?:ь|и))',unit:'(?:гб|gb|gigabytes?|гигабайт(?:а|ов)?)',min:0,adjacentNumbers:true,requireUnit:true},
  {key:'rooms',label:'Количество комнат',prefix:'(?:(?:количество|число) комнат|комнат(?:ы)?|rooms?)',unit:'(?:комнат(?:а|ы|у)?|rooms?)',integer:true,min:0}
 ];
 const tokenEnd='(?![a-zа-яё0-9])';
 function quantityAt(value,unit){
  const leading=value.match(/^\s*(?:(?:[:=]|of)\s*)?/)[0];let start=leading.length;
  const operator=value.slice(start).match(/^(?:(от|с|from|since|between|at least|не менее|не ниже|минимум)|(до|under|up to|at most|не более|не выше|максимум))\s+/i);if(operator)start+=operator[0].length;
  const sign=value[start]==='-'?-1:1;if(sign<0)start++;const first=amountAt(value.slice(start),true);if(!first||first.currency)return null;let end=start+first.end,low=first.value*sign,high=first.value*sign;
  const firstUnit=value.slice(end).match(new RegExp('^\\s*'+unit+tokenEnd,'i'));if(firstUnit)end+=firstUnit[0].length;
  const connector=value.slice(end).match(/^\s*(?:до|to|and|[-–—])\s*/i);
  if(connector&&!operator?.[2]){const second=amountAt(value.slice(end+connector[0].length),true);if(second&&!second.currency){
   const secondTail=value.slice(end+connector[0].length+second.end),secondUnit=secondTail.match(new RegExp('^\\s*'+unit+tokenEnd,'i'));
   // After an exact quantity with its unit, a following monetary upper bound
   // is a separate budget. Explicit ranges and repeated units retain their
   // existing meaning, including an implicit unit after «от ... до ...».
   const nextBudget=firstUnit&&!operator?.[1]&&/^(?:до|to)$/i.test(connector[0].trim())&&!secondUnit&&(second.scale>0||second.value>=10000)&&!/^\s*(?:гб|gb|тб|tb)(?![a-zа-яё])/i.test(secondTail);
   if(!nextBudget){if(!first.scale&&!firstUnit&&second.scale)low*=second.scale;high=second.value;end+=connector[0].length+second.end;return {min:low,max:high,end,unit:!!firstUnit}}
  }}
  return {...(operator?.[1]?{min:low}:operator?.[2]?{max:high}:{min:low,max:high}),end,unit:!!firstUnit};
 }
 function rangeError(criteria){
  for(const [key,label]of [['price','Цена'],...quantityFields.map(field=>[field.key,field.label])])if(criteria[key+'Min']!==undefined&&criteria[key+'Max']!==undefined&&criteria[key+'Min']>criteria[key+'Max'])return label+': значение «от» не может быть больше «до». Уточните диапазон.';
  return '';
 }
 function extractQuantities(input,criteria,options={}){
  let query=input,message='';
  const assign=(field,spec)=>{for(const suffix of ['Min','Max']){const value=spec[suffix.toLowerCase()];if(value===undefined)continue;if(!Number.isFinite(value)||value<field.min||value>Number.MAX_SAFE_INTEGER||field.integer&&!Number.isSafeInteger(value)||field.max&&value>field.max()){message=field.label+': укажите корректное '+(field.key==='year'?'значение от 1886 до '+field.max():'неотрицательное число')+'.';return}const key=field.key+suffix;criteria[key]=criteria[key]===undefined?value:suffix==='Min'?Math.max(criteria[key],value):Math.min(criteria[key],value)}};
  query=query.replace(/(^|[\s,])(?:не стар(?:ше|ее)|не раньше|not older than|no older than)\s+(\d{4})(?:\s*(?:год(?:а|у)?|г\.?|years?))?(?![a-zа-яё0-9])/ig,(whole,prefix,value)=>{assign(quantityFields[0],{min:Number(value)});return prefix});
  query=query.replace(/(^|[\s,])(?:не новее|не позже|not newer than|no newer than)\s+(\d{4})(?:\s*(?:год(?:а|у)?|г\.?|years?))?(?![a-zа-яё0-9])/ig,(whole,prefix,value)=>{assign(quantityFields[0],{max:Number(value)});return prefix});
  for(const field of quantityFields){
   if(options.keys&&!options.keys.includes(field.key))continue;
   const prefix=new RegExp('(^|[\\s,])'+field.prefix+(field.adjacentNumbers?'(?=\\s|[0-9]|$)':tokenEnd),'ig');let match;
   while((match=prefix.exec(query))){if(/\d\s*$/.test(query.slice(0,match.index))&&new RegExp('^\\s*'+field.unit+tokenEnd,'i').test(match[0]))continue;if(field.suffixUnit&&new RegExp(field.unit+'\\s*$','i').test(query.slice(0,match.index)))continue;const start=match.index+match[0].length,spec=quantityAt(query.slice(start),field.unit);if(!spec)continue;const tail=query.slice(start+spec.end).match(new RegExp('^\\s*'+field.unit+tokenEnd,'i'));if(field.requireUnit&&!spec.unit&&!tail)continue;if(/^(?:ram|storage)/.test(field.key)&&!tail&&/^\s*(?:гб|gb|тб|tb)(?![a-zа-яё])/i.test(query.slice(start+spec.end))){message='Память: укажите обе границы диапазона в одинаковых единицах, ГБ или ТБ.';continue}assign(field,spec);query=query.slice(0,match.index)+' '+query.slice(start+spec.end+(tail?.[0].length||0));prefix.lastIndex=0}
   if(options.suffix===false||field.noSuffix&&!(field.key==='storageGb'&&/айфон|iphone|смартфон|телефон|smartphone|phone/i.test(input))||field.key==='ramGb'&&!/ноутбук|laptop|компьютер|computer|озу|ram/i.test(input))continue;
   const suffixUnit=field.suffixUnit||field.unit;
   const boundary=/(^|[\s,])/g;
   while((match=boundary.exec(query))){if(boundary.lastIndex<=match.index)boundary.lastIndex=match.index+1;const start=match.index+match[0].length;if(field.key==='storageGb'&&/(?:iphone|айфон)\s+(?:se\s+)?$/i.test(query.slice(0,start))&&/^\d+\s+[1-9]\d*(?:[.,]\d+)?\s*(?:гб|gb|гигабайт(?:а|ов)?|gigabytes?)(?![a-zа-яё0-9])/i.test(query.slice(start)))continue;const spec=quantityAt(query.slice(start),suffixUnit);if(!spec)continue;const tail=query.slice(start+spec.end).match(new RegExp('^\\s*'+suffixUnit+tokenEnd,'i'));if(!tail&&!spec.unit)continue;if(field.requireUnit&&!spec.unit&&!tail)continue;if(/^(?:ram|storage)/.test(field.key)&&!tail&&/^\s*(?:гб|gb|тб|tb)(?![a-zа-яё])/i.test(query.slice(start+spec.end))){message='Память: укажите обе границы диапазона в одинаковых единицах, ГБ или ТБ.';continue}assign(field,spec);query=query.slice(0,match.index)+' '+query.slice(start+spec.end+(tail?.[0].length||0));boundary.lastIndex=0}
  }
  return {query,message:message||rangeError(criteria)};
 }

 const enumPhrases=[
  ['fuel','diesel','(?:(?:топливо|только) дизель(?:ное|ный)?|на дизеле|(?:fuel|only) diesel|diesel (?:fuel|engine))'],
  ['fuel','petrol','(?:(?:топливо|только) бензин(?:овое|овый)?|на бензине|(?:fuel|only) (?:petrol|gasoline)|(?:petrol|gasoline) (?:fuel|engine))'],
  ['fuel','electric','(?:(?:топливо|только) электрич(?:ество|еский|еское)|на электричестве|(?:fuel|only) electric|electric (?:fuel|engine))'],
  ['fuel','hybrid','(?:(?:топливо|только) гибрид(?:ное|ный)?|(?:fuel|only) hybrid|hybrid (?:fuel|engine))'],
  ['transmission','auto','(?:(?:(?:коробка(?: передач)?|трансмиссия|только) (?:автомат(?:ическая)?|акпп))|на автомате|с автоматической коробкой(?: передач)?|(?:transmission|gearbox|only) (?:automatic|auto)|(?:with )?automatic (?:transmission|gearbox))'],
  ['transmission','manual','(?:(?:(?:коробка(?: передач)?|трансмиссия|только) (?:механик(?:а|ческая)|мкпп))|на механике|с механической коробкой(?: передач)?|(?:transmission|gearbox|only) manual|(?:with )?manual (?:transmission|gearbox))'],
  ['condition','new','(?:состояние новое|только нов(?:ые|ое|ый|ая)|в новом состоянии|condition new|new condition|only new)'],
  ['condition','used','(?:состояние (?:б/у|бывшее в эксплуатации)|только (?:б/у|подержанные)|condition used|used condition|only used)'],
  ['condition','repair','(?:(?:состояние )?требует ремонта|под ремонт|condition (?:repair|needs repair)|needs repair)']
 ];
 function extractEnums(input,criteria){let query=input,message='';for(const [key,value,phrase]of enumPhrases)query=query.replace(new RegExp('(^|[\\s,])'+phrase+tokenEnd,'ig'),(whole,prefix,offset)=>{if(/(?:^|[\s,])(?:не|без|кроме|not|except|without)$/.test(clean(query.slice(0,offset))))return whole;if(criteria[key]&&criteria[key]!==value)message='Указаны несовместимые значения параметра. Уточните топливо, коробку передач или состояние.';criteria[key]=value;return prefix});return {query,message}}

 function labels(criteria){
  const parts=[];for(const [key,label,unit]of [['price','Цена',' ₽'],['year','Год',''],['mileage','Пробег',' км'],['area','Площадь',' м²'],['rooms','Комнаты',''],['powerHp','Мощность',' л.с.'],['powerKw','Мощность',' кВт'],['ramGb','ОЗУ',' ГБ'],['storageGb','Накопитель',' ГБ']]){
   const min=criteria[key+'Min'],max=criteria[key+'Max'],format=value=>key==='year'?String(value):value.toLocaleString('ru-RU');if(min===undefined&&max===undefined)continue;
   parts.push(label+': '+(min!==undefined&&min===max?format(min):[min!==undefined?'от '+format(min):'',max!==undefined?'до '+format(max):''].filter(Boolean).join(' '))+unit);
  }const names={fuel:{diesel:'Дизель',petrol:'Бензин',electric:'Электричество',hybrid:'Гибрид'},transmission:{auto:'Автомат',manual:'Механика'},condition:{new:'Новое',used:'Бывшее в эксплуатации',repair:'Требует ремонта'}};for(const [key,label]of [['fuel','Топливо'],['transmission','Коробка'],['condition','Состояние']])if(criteria[key])parts.push(label+': '+names[key][criteria[key]]);if(criteria.city)parts.push('Город: '+criteria.city);if(criteria.sort)parts.push({nearest:'Сначала ближайшие',low:'Сначала дешевле',high:'Сначала дороже'}[criteria.sort]);return parts;
 }
 function normalizeInput(value){
  return String(value??'').replace(/ё/g,'е').replace(/Ё/g,'Е').replace(/(^|[\s,])((?:не )?(?:дешевле|дороже)|cheaper(?: than)?|more expensive(?: than)?)(?=\d)/ig,'$1$2 ').replace(/(^|[\s,])(до|от|за|на)(?=\d)/ig,'$1$2 ').replace(/(стоимость(?:ю|ь)?|цен(?:а|ой|е)|бюджет(?:ом)?)(?=(?:до|от)(?:\d|\s))/ig,'$1 ').replace(/(\d)(?=(?:тысяч|тыс|миллион|млн|миллиард|млрд|километр|км|квадрат|гигабайт|гб|gb|квт|kw|hp|л\.?с\.?|м[²2]|m[²2])(?:[а-я]*|\b))/ig,'$1 ').replace(/(тысяч(?:а|и|у)?|тыс\.?|миллион(?:а|ов)?|млн\.?)(?=(?:километр|км|руб|₽))/ig,'$1 ').replace(/\s+/g,' ').trim();
 }
 function locationIntent(input,options={}){
  if(!/(?:^|[\s,])(?:в|из|около|in|near|around|from)\s+/i.test(input))return {query:input};
  const cities=new Set([...(Array.isArray(options.cities)?options.cities:Object.keys(options.cities||{})),...Object.values(options.capitals||{})]),entries=[],codes=new Map(Object.entries(options.capitals||{}).map(([code,city])=>[city,code]));
  const english={Москва:['moscow'],Воронеж:['voronezh'],'Санкт-Петербург':['saint petersburg','st petersburg'],Казань:['kazan'],Ставрополь:['stavropol']};
  for(const city of cities){const base=clean(city),aliases=[base,...(english[city]||[])];if(base.endsWith('а'))aliases.push(base.slice(0,-1)+'е',base.slice(0,-1)+'у');else if(base.endsWith('ль'))aliases.push(base.slice(0,-1)+'е');else if(base.endsWith('ь'))aliases.push(base.slice(0,-1)+'и');else if(base.endsWith('ки'))aliases.push(base.slice(0,-1)+'ах');else if(!/[уыиоея]$/.test(base))aliases.push(base+'е');if(base==='нижний новгород')aliases.push('нижнем новгороде');if(base==='великий новгород')aliases.push('великом новгороде');for(const alias of aliases)entries.push({alias,city,regionCode:codes.get(city)||''})}
  for(const region of options.regions||[]){const base=clean(region.name),inflected=base.replace(/ская/g,'ской').replace(/ский/g,'ском').replace(/область/g,'области').replace(/республика/g,'республике');entries.push({alias:base,regionCode:region.code},{alias:inflected,regionCode:region.code})}
  entries.sort((a,b)=>b.alias.length-a.alias.length);for(const entry of entries){const escaped=entry.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp('(^|[\\s,])(?:в|из|около|in|near|around|from)\\s+'+escaped+tokenEnd,'i').exec(input);if(match)return {...entry,query:input.slice(0,match.index)+' '+input.slice(match.index+match[0].length)}}return {query:input};
 }
 function extractSort(input){
  let sort='';const query=String(input??'').replace(/(^|[\s,])(?:(сначала ближайшие|ближе ко мне|рядом(?: со мной)?|поблизости|near me|nearest(?: first)?|closest(?: first)?|nearby|near)|(сначала дешев(?:ые|ле)|по возрастанию цены|cheapest first|lowest price first|price low to high|недорог(?:ая|ую|ой|ое|ие|их|о)|дешев(?:ая|ую|ое|ые|ый|ых|ой)|cheap|inexpensive)|(сначала дорогие|сначала дороже|по убыванию цены|most expensive first|highest price first|price high to low)|(дешевле|cheaper|дороже|more expensive|ближе))(?![a-zа-яё0-9])/ig,(whole,prefix,nearest,low,high,simple,offset)=>{
   if(/(?:^|[\s,])(?:не|not)$/.test(clean(String(input).slice(0,offset))))return whole;
   // A comparative followed by a number is a budget phrase, not an order.
   const comparisonAmount=String(input).slice(offset+whole.length).replace(/^\s*(?:than\s+)?/i,'');if(simple&&(/^[-+]?\d/.test(comparisonAmount)||amountAt(comparisonAmount)))return whole;
   sort=nearest?'nearest':low?'low':high?'high':/^(?:дешевле|cheaper)$/i.test(simple)?'low':/^(?:дороже|more expensive)$/i.test(simple)?'high':'nearest';return prefix;
  });return {query,sort};
 }
 function unsupportedCurrency(query,options={}){
  const unit='(?:доллар(?:а|ов|ы|у|ом)?|евро|юан(?:ь|я|ей|и)?|тенге|dollars?|euros?|yen|yuan|renminbi|usd|eur|cny|rmb|kzt|jpy|gbp|[$€£¥])',currency=new RegExp('^\\s*'+unit+tokenEnd,'i');
  let text=query.replace(/(тысяч(?:а|и|у)?|тыс\.?|миллион(?:а|ов)?|млн\.?)(?=(?:доллар|евро|юан|тенге|usd|eur|cny|kzt))/ig,'$1 ');
  if(options.vehicleContext)text=text.replace(/(?:евро|euro)[ -]?[0-6](?:[a-d])?(?![a-zа-яё0-9])/ig,(whole,offset)=>{
   const before=text.slice(0,offset),bounds=/(?:^|[\s,])(?:до|от|за|цена|стоимость(?:ю|ь)?|бюджет|дешевле|дороже|under|over|price|budget|cheaper(?: than)?|more expensive(?: than)?)\s+/ig;let bound;
   while((bound=bounds.exec(before))){const start=bound.index+bound[0].length,amount=amountAt(before.slice(start));if(amount&&!before.slice(start+amount.end).trim())return whole}
   return 'fasemissionstandard';
  });
  // A foreign currency beside an amount must never acquire a rouble label.
  // Word currencies before a number need an explicit price context, so a
  // vehicle designation such as Euro 5 remains an ordinary search term.
  if(/[$€£¥]\s*\d/.test(text)||new RegExp(String.raw`(?:^|[\s,])(?:до|от|за|цена|стоимость(?:ю|ь)?|бюджет|дешевле|дороже|under|over|price|budget|cheaper(?: than)?|more expensive(?: than)?)\s*${unit}\s*\d`,'i').test(text))return true;
  const boundaries=/(^|[\s,])/g;let match;
  while((match=boundaries.exec(text))){if(boundaries.lastIndex<=match.index)boundaries.lastIndex=match.index+1;const start=match.index+match[0].length,amount=amountAt(text.slice(start));if(amount&&currency.test(text.slice(start+amount.end)))return true}
  return false;
 }
 function parse(raw,options={}){
  let query=normalizeInput(raw),criteria={},error='';
  if(unsupportedCurrency(query,options))return {residual:query,criteria,labels:[],error:'Поиск по цене поддерживает рубли. Укажите бюджет в ₽: иностранная валюта автоматически не пересчитывается.'};
  if(/(?:^|[\s,])(?:not|no)\s+(?:cheaper|more\s+expensive)(?:\s+than)?(?![a-zа-яё0-9])/i.test(query))return {residual:query,criteria,labels:[],error:'Уточните цену: укажите положительную границу бюджета «до» или «от» без отрицания.'};
  if(/(?:^|[\s,])(?:или|or)(?=\s|,|$)/i.test(query))return {residual:query,criteria,labels:[],error:'Уточните варианты: выберите категории в фильтре или выполните отдельные поиски. Для комнат можно указать диапазон, например «от 1 до 2 комнат».'};
  const relativeAge=/(?:^|[\s,])(?:не\s*старше|моложе|not older than|no older than|younger than)\s*/ig;let age;
  while((age=relativeAge.exec(query))){const start=age.index+age[0].length,value=amountAt(query.slice(start));if(value&&/^\s*(?:лет|years?)(?![a-zа-яё0-9])/i.test(query.slice(start+value.end)))return {residual:query,criteria,labels:[],error:'Для ограничения возраста укажите год выпуска, например «не старше 2020 года».'}}

  const adjective='(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых|ом|ую)',color='(?:(?:красн|голуб|бел|черн|сер|зелен|желт|оранжев|коричнев|фиолетов|розов|бежев|серебрист|серебрян|золотист|золот|бордов)'+adjective+'|син(?:ий|яя|ее|ие|его|ей|ему|им|ими|их|ем|юю))';
  const body='(?:(?:седан|универсал|пикап|кроссовер|хэтчбек)(?:а|у|ом|е|ы|ов|ами|ах)?|внедорожник(?:а|у|ом|е|и|ов|ами|ах)?|купе)';
  const fuel='(?:дизел(?:ь|я|ю|ем|е|и|ей|ями|ях|ьный|ьная|ьное|ьного|ьной|ьные|ьных)|бензин(?:а|у|ом|е|ы|ов|овый|овая|овое|ового|овой|овые|овых)?|гибрид(?:а|у|ом|е|ы|ов|ный|ная|ное|ного|ной|ные|ных)?)';
  const negativeTrait=new RegExp(String.raw`(?:^|[\s,])(?:не|кроме|без|not|except|without)\s+(?:(?:цвет(?:а|ом)?|кузов(?:а|ом)?|только|на|с|only|with|in)\s+)?(?:${color}|${body}|${fuel}|автомат(?:е|ом|ическая|ической)?|механик(?:а|е|у|ой|и|ческая|ческой|ческий|ческое|ческого)|требует\s+ремонта|б\s*/\s*у|подержанн${adjective}|red|blue|white|black|grey|gray|green|yellow|orange|brown|purple|pink|beige|silver|gold|sedans?|wagons?|pickups?|coupes?|suv|diesel|petrol|gasoline|hybrid|automatic|manual|used)(?![a-zа-яё0-9])`,'i');
  if(negativeTrait.test(query))return {residual:query,criteria,labels:[],error:'Уточните параметр без отрицания: укажите нужный цвет, кузов, топливо или состояние.'};
  if(options.vehicleContext)query=query.replace(/(^|[\s,])(?:без\s*пробега|without\s+mileage)(?![a-zа-яё0-9])/ig,(whole,prefix,offset)=>{if(/^\s+(?:по|в|после)(?:\s|$)/i.test(query.slice(offset+whole.length))){error='Уточните общий пробег автомобиля в километрах: отсутствие пробега по стране или после ремонта не означает нулевой пробег.';return whole}criteria.mileageMin=criteria.mileageMax=0;return prefix});
  const location=locationIntent(query,options);query=location.query;if(location.city)criteria.city=location.city;if(location.regionCode)criteria.regionCode=location.regionCode;
  query=query.replace(/(^|[\s,])б\s*\/\s*у(?=$|[\s,])/ig,(whole,prefix)=>{criteria.condition='used';return prefix});
  // A known numeric model has priority over a bare production year.
  const protectedValues=[];for(const model of new Set(options.protectedModels||[])){if(!/^\d{4}$/.test(model))continue;const re=new RegExp('(^|[\\s,])'+model+'(?![a-zа-яё0-9])','ig');for(const match of query.matchAll(re)){const offset=match.index+match[1].length,before=clean(query.slice(0,offset)),after=query.slice(offset+model.length);if(/(?:от|до|за|цена|стоимость(?:ю|ь)?|бюджет|дешевле|дороже|price|budget|from|to|under|over|cheaper(?: than)?|more expensive(?: than)?)$/.test(before)||/^\s*(?:₽|руб|rub|млн|million|тыс|thousand)/i.test(after))continue;const token='fasprotectedmodel'+String.fromCharCode(97+protectedValues.length);protectedValues.push([token,model]);query=query.slice(0,offset)+token+query.slice(offset+model.length);break}}
  const roomWords={одно:1,одна:1,однои:1,двух:2,две:2,дву:2,трех:3,три:3,четырех:4,четыре:4,пяти:5,шести:6,семи:7};

  const suffixContext=options.vehicleContext||/(?:ноутбук|компьютер|квартир|комнат|дом(?:а|ов)?(?:$|[ ,])|коттедж|участок|оборудован|станок|компрессор|laptop|computer|apartment|house|equipment|machine|compressor|айфон|iphone|смартфон|телефон|smartphone|phone)/i.test(query);
  const quantities=extractQuantities(query,criteria,{suffix:!!suffixContext,vehicleContext:options.vehicleContext});query=quantities.query;error=error||quantities.message;for(const key of ['storage','ram'])for(const suffix of ['Min','Max']){const tb=key+'Tb'+suffix,gb=key+'Gb'+suffix;if(criteria[tb]!==undefined){const value=criteria[tb]*1024;criteria[gb]=criteria[gb]===undefined?value:suffix==='Min'?Math.max(criteria[gb],value):Math.min(criteria[gb],value);delete criteria[tb]}}
  query=query.replace(/(^|[\s,])(?:(одно|одна|двух|две|дву|трех|три|четырех|четыре|пяти|шести|семи)[ -]?комнат(?:н[а-я]*)?|(\d+)[ -]?(?:х[ -]?)?комнат(?:н[а-я]*)?)(?![a-zа-яё0-9])/ig,(whole,prefix,word,digit)=>{const value=word?roomWords[clean(word)]:Number(digit);criteria.roomsMin=criteria.roomsMin===undefined?value:Math.max(criteria.roomsMin,value);criteria.roomsMax=criteria.roomsMax===undefined?value:Math.min(criteria.roomsMax,value);return prefix});
  const enums=extractEnums(query,criteria);query=enums.query;error=error||enums.message;
  if(options.vehicleContext){for(const [key,value,phrase]of [['fuel','diesel','дизель(?:ный|ное)?|diesel'],['fuel','petrol','бензин(?:овый|овое)?|petrol|gasoline'],['fuel','electric','электрический|electric'],['fuel','hybrid','гибрид(?:ный)?|hybrid'],['transmission','auto','автомат(?:ическая)?|акпп|automatic'],['transmission','manual','механика|механическая|мкпп|manual']])query=query.replace(new RegExp('(^|[\\s,])(?:'+phrase+')'+tokenEnd,'ig'),(whole,prefix,offset)=>{if(/(?:^|[\s,])(?:не|без|кроме|not|except|without)$/.test(clean(query.slice(0,offset)))){error='Уточните параметр: укажите нужное топливо или коробку передач без отрицания.';return whole}if(criteria[key]&&criteria[key]!==value)error='Указаны несовместимые значения параметра. Уточните топливо или коробку передач.';criteria[key]=value;return prefix})}

  if(options.vehicleContext)query=query.replace(/(^|[\s,])(\d{4})(?![a-zа-яё0-9])/g,(whole,prefix,value,offset)=>{const before=clean(query.slice(0,offset)),after=query.slice(offset+whole.length);if(/(?:от|до|за|цена|стоимость(?:ю|ь)?|бюджет|дешевле|дороже|price|budget|from|to|under|over|cheaper(?: than)?|more expensive(?: than)?)$/.test(before)||/^\s*(?:₽|руб|rub|млн|million|тыс|thousand)/i.test(after))return whole;const year=Number(value);if(year<1886||year>new Date().getFullYear()+1)return whole;criteria.yearMin=criteria.yearMax=year;return prefix});
  const ordering=extractSort(query);query=ordering.query;if(ordering.sort)criteria.sort=ordering.sort;
  const measurementTail=new RegExp('^\\s*(?:'+quantityFields.map(field=>field.unit).join('|')+')'+tokenEnd,'i');
  const moneyAt=value=>{const negative=/^\s*-/.exec(value),parsed=amountAt(negative?value.slice(negative[0].length):value),amount=parsed&&negative?{...parsed,value:-parsed.value,end:parsed.end+negative[0].length}:parsed;return amount&&!measurementTail.test(value.slice(amount.end))?amount:null};
  const isMoney=amount=>amount&&(amount.scale>0||amount.currency||amount.value>=10000),valid=value=>Number.isSafeInteger(value)&&value>=0;
  const ranges=/(^|[\s,])(?:(?:цена|стоимость(?:ю|ь)?|бюджет|price|budget)\s+)?(?:от|from|between)\s+/ig;let match;
  while((match=ranges.exec(query))){const start=match.index+match[0].length,low=moneyAt(query.slice(start));if(!low)continue;const connector=query.slice(start+low.end).match(/^\s*(?:до|to|and|[-–—])\s*/i);if(!connector)continue;const next=start+low.end+connector[0].length,high=moneyAt(query.slice(next));if(!high||!isMoney(low)&&!isMoney(high)&&!/(?:цена|стоимость(?:ю|ь)?|бюджет|price|budget)/i.test(match[0]))continue;let min=low.value;if(!low.scale&&!low.currency&&high.scale&&min<100)min*=high.scale;if(!valid(min)||!valid(high.value)||high.value<=0||min>high.value)error='Цена: значение «от» не может быть больше «до». Уточните диапазон.';criteria.priceMin=min;criteria.priceMax=high.value;query=query.slice(0,match.index)+' '+query.slice(next+high.end);ranges.lastIndex=0}
  const bounds=/(^|[\s,])(?:(не дороже|не более|максимум|до|за|under|up to|less than|дешевле|cheaper(?: than)?)|(не дешевле|не менее|от|over|at least|more than|дороже|more expensive(?: than)?)|(бюджет(?:ом)?|цен(?:а|ой|е)|стоимость(?:ю|ь)?|budget|price)(?:\s+(до|от|under|over|up to|at least))?)\s+/ig;
  while((match=bounds.exec(query))){const start=match.index+match[0].length,amount=moneyAt(query.slice(start));if(!amount||!isMoney(amount)&&!match[4]&&!/^(?:(?:не )?(?:дешевле|дороже)|cheaper(?: than)?|more expensive(?: than)?)$/i.test(match[2]||match[3]||''))continue;if(!valid(amount.value)||amount.value<=0)error='Цена: укажите положительное целое число.';const min=!!match[3]||/^(?:от|over|at least)$/.test(match[5]||'');const key=min?'priceMin':'priceMax';criteria[key]=criteria[key]===undefined?amount.value:min?Math.max(criteria[key],amount.value):Math.min(criteria[key],amount.value);query=query.slice(0,match.index)+' '+query.slice(start+amount.end);bounds.lastIndex=0}
  error=error||rangeError(criteria);for(const [token,model]of protectedValues)query=query.replace(token,model);
  query=query.replace(/\s+/g,' ').replace(/^[\s,;]+|[\s,;.!?]+$/g,'').trim();return {residual:query,criteria,labels:labels(criteria),error};
 }
 const vehicleIds=new Set(['cars','trucks','machinery','motorcycles','vessels','trailers','snowmobiles','atvs']),propertyIds=new Set(['property','houses','land','commercial','garages']),electronicIds=new Set(['computers','computer_parts','phones','office_electronics','audio_video','games']);
 function numeric(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value!=='string'||!value.trim())return null;const normalized=value.replace(/[ \u00a0\u202f]/g,'').replace(',','.');return /^[-+]?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):null}
 // Public object titles and engine specifications are evidence only when a
 // structured field is absent. Explicit unknown values never become guesses.
 function titleRooms(title){
  const values=new Set(),text=clean(title),words={одно:1,одна:1,двух:2,две:2,дву:2,трех:3,три:3,четырех:4,четыре:4,пяти:5,шести:6,семи:7,one:1,two:2,three:3,four:4,five:5};
  for(const match of text.matchAll(/(?:^|[^a-zа-я0-9])(?:(одно|одна|двух|две|дву|трех|три|четырех|четыре|пяти|шести|семи)[ -]?комнат[а-я]*|(\d+)[ -]?(?:х[ -]?)?комнат[а-я]*|(one|two|three|four|five|\d+)[ -]?rooms?)(?![a-zа-я0-9])/g))values.add(match[1]?words[match[1]]:match[2]?Number(match[2]):words[match[3]]??Number(match[3]));
  return values.size===1?[...values][0]:null;
 }
 function engineEnum(lot,key){
  if(Object.hasOwn(lot,key))return lot[key];const engine=clean(lot.engine),values=new Set(),patterns=key==='fuel'?[['diesel',/(?:^|[^a-zа-я])(?:дизель[а-я]*|diesel)(?:$|[^a-zа-я])/],['petrol',/(?:^|[^a-zа-я])(?:бензин[а-я]*|petrol|gasoline)(?:$|[^a-zа-я])/],['electric',/(?:^|[^a-zа-я])(?:электрическ[а-я]*|electric)(?:$|[^a-zа-я])/],['hybrid',/(?:^|[^a-zа-я])(?:гибрид[а-я]*|hybrid)(?:$|[^a-zа-я])/]]:[['auto',/(?:^|[^a-zа-я])(?:акпп|автомат[а-я]*|automatic|at)(?:$|[^a-zа-я])/],['manual',/(?:^|[^a-zа-я])(?:мкпп|механик[а-я]*|manual|mt)(?:$|[^a-zа-я])/]];
  for(const [value,pattern]of patterns)if(pattern.test(engine))values.add(value);return values.size===1?[...values][0]:null;
 }
 function matches(lot,intent,options={}){
  if(!intent)return true;if(intent.error)return false;const criteria=intent.criteria||{},category=options.category||lot.subcategory||lot.category;if(criteria.city&&clean(lot.city)!==clean(criteria.city))return false;if(criteria.regionCode&&!criteria.city&&(typeof options.regionCode==='function'?options.regionCode(lot):lot.regionCode)!==criteria.regionCode)return false;
  for(const key of ['price','year','mileage','area','rooms','powerHp','powerKw','ramGb','storageGb']){const min=criteria[key+'Min'],max=criteria[key+'Max'];if(min===undefined&&max===undefined)continue;
   if(['year','mileage','powerHp'].includes(key)&&!vehicleIds.has(category)||['area','rooms'].includes(key)&&!propertyIds.has(category)||['ramGb','storageGb'].includes(key)&&!electronicIds.has(category)||key==='powerKw'&&!vehicleIds.has(category)&&category!=='equipment')return false;
   const raw=key==='price'?typeof options.price==='function'?options.price(lot):lot.price:key==='mileage'?lot.mileage??lot.km:key==='rooms'&&!Object.hasOwn(lot,'rooms')?titleRooms(lot.name):lot[key],value=numeric(raw);if(value===null||min!==undefined&&value<min||max!==undefined&&value>max)return false;
  }for(const key of ['fuel','transmission','condition'])if(criteria[key]){if(key!=='condition'&&!vehicleIds.has(category)||(key==='condition'?lot[key]:engineEnum(lot,key))!==criteria[key])return false}return true;
 }
 const api=Object.freeze({parse,matches,labels,amountAt,quantityAt,rangeError,extractQuantities,normalizeInput,locationIntent,extractSort});globalThis.FasQueryIntent=api;if(typeof window!=='undefined')window.FasQueryIntent=api;
})();

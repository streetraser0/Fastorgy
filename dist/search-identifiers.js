/* Complete public identifiers are compared within one field, never as a bag of words. */
(()=>{
 'use strict';
 const profiles=new WeakSet(),VIN=/^[A-HJ-NPR-Z0-9]{17}$/;
 const prefixes={vin:/^(?:vin|вин)(?:\s*(?:[:#№=]|No\.)\s*|\s+)/iu,cadastre:/^(?:кадастровый\s+номер|кадастр|cadastral(?:\s+number)?|cadastre)(?:\s*(?:[:#№=]|No\.)\s*|\s+)/iu,serial:/^(?:(?:серийный\s+номер|серийник|serial(?:\s+number)?|s\/n)(?:\s*(?:[:#№=]|No\.)\s*|\s+)|sn\s*[:#№=]\s*)/iu};
 const fields={vin:['vin','VIN'],cadastre:['cadastralNumber','cadastral_number'],serial:['serialNumber','serial_number']};
 const publicFields=['name','model','engine','description','docs','documents','registrationNumber','address','defects','completeness','inspection','deliveryNotes'];
 const fieldCache=new Map(),MAX_FIELDS=1024,MAX_FIELD_LENGTH=2048,MAX_QUERIES=8;let cachedCharacters=0,cacheHits=0,fieldEvaluations=0;
 const text=value=>{try{return typeof value==='string'||typeof value==='number'?String(value).replace(/№/g,'#').normalize('NFKC').trim():''}catch{return''}};
 const quotePairs=new Map([['"','"'],["'","'"],['«','»'],['“','”'],['„','“'],['‘','’']]);
 function cleanOuter(value){let result=text(value);for(let i=0;i<4;i++){const before=result;result=result.replace(/[.,;!?。]+$/u,'').trim();if(quotePairs.get(result[0])===result.at(-1))result=result.slice(1,-1).trim();if(result===before)break}return result}
 const strip=(value,kind)=>cleanOuter(cleanOuter(value).replace(prefixes[kind],''));
 function vin(value){const result=strip(value,'vin').toUpperCase().replace(/[\s\-‐‑‒–—―]/gu,'');return VIN.test(result)&&/[A-Z]/.test(result)&&/[0-9]/.test(result)?result:null}
 function cadastre(value){const result=strip(value,'cadastre').replace(/\s*:\s*/g,':');return /^\d{1,2}:\d{1,2}:\d{1,10}:\d{1,10}$/.test(result)?result:null}
 function serial(value){const source=strip(value,'serial').toUpperCase();if(!source||source.length>160||!/^[\p{L}\p{N}\s\-‐‑‒–—―_/.\\]+$/u.test(source))return null;return source.replace(/[\s\-‐‑‒–—―_/.\\]/gu,'')||null}
 const normalize={vin,cadastre,serial};
 function profile(kind,value,explicit,raw=value,partial=false){const parts=Object.freeze(strip(raw,kind).toUpperCase().match(/[\p{L}\p{N}]+/gu)||[]),result=Object.freeze({kind,value:value||'',explicit,valid:value!==null,partial:!!partial,parts});profiles.add(result);return result}
 function protectedQuery(options,raw,kind){try{return options?.protected?.(raw,kind)===true}catch{return true}}
 function compile(query,options={}){
  if(query&&typeof query==='object'&&profiles.has(query))return query;
  const raw=cleanOuter(query);if(!raw||raw.length>180)return null;
  for(const kind of ['vin','cadastre','serial'])if(prefixes[kind].test(raw))return profile(kind,normalize[kind](raw),true,raw);
  const cadastral=cadastre(raw);if(cadastral!==null)return profile('cadastre',cadastral,false,raw);
  // A cadastral prefix preserves complete component order. Two-digit region
  // and district codes distinguish it from ordinary ratios such as 16:9.
  const compact=raw.replace(/\s*:\s*/g,':'),prefix=compact.replace(/:$/,'');
  if(/^\d{2}:\d{2}(?::\d{1,10})?$/.test(prefix))return profile('cadastre',prefix,false,raw,true);
  // Never downgrade an invalid complete-looking cadastral number to numeric
  // keyword matching, where a floor or price could supply a missing component.
  if(/^\d[\d\s:]*:[\d\s:]*$/.test(raw)&&compact.split(':').length>=4)return profile('cadastre',null,false,raw);
  const vehicleId=vin(raw);if(vehicleId!==null&&!protectedQuery(options,raw,'vin'))return profile('vin',vehicleId,false,raw);
  // Multiple separators, or the conventional SN prefix, distinguish a full
  // serial from ordinary prices, years and short model codes such as C7H.
  const structured=/^[\p{L}\p{N}]+(?:[-‐‑‒–—―_/.\\][\p{L}\p{N}]+){2,}$/u.test(raw),snPrefix=/^sn[\s\-‐‑‒–—―_/.\\]/iu.test(raw),number=serial(raw);
  if(number!==null&&number.length>=8&&/[\p{L}]/u.test(number)&&/[\p{N}]/u.test(number)&&(structured||snPrefix)&&!protectedQuery(options,raw,'serial'))return profile('serial',number,false,raw);
  return null;
 }
 function evaluatePublicField(value,parsed){
  const source=text(value).toUpperCase();if(!source)return false;
  if(equalValue(normalize[parsed.kind](source),parsed))return true;
  if(parsed.kind==='cadastre'?!source.replace(/\s/g,'').includes(parsed.value):!source.replace(/[^\p{L}\p{N}]/gu,'').includes(parsed.value))return false;
  if(parsed.kind==='vin')return Array.from(source.matchAll(/(^|[^\p{L}\p{N}])([A-HJ-NPR-Z0-9](?:[\s\-‐‑‒–—―]*[A-HJ-NPR-Z0-9]){16})(?=$|[^\p{L}\p{N}])/gu)).some(match=>vin(match[2])===parsed.value);
  if(parsed.kind==='cadastre')return Array.from(source.matchAll(/(^|[^\p{L}\p{N}:])(\d{1,2}\s*:\s*\d{1,2}\s*:\s*\d{1,10}\s*:\s*\d{1,10})(?=$|[^\p{L}\p{N}:])/gu)).some(match=>equalValue(cadastre(match[2]),parsed));
  const words=Array.from(source.matchAll(/[\p{L}\p{N}]+/gu)),join=/[\p{L}\p{N}\-‐‑‒–—―_/.\\]/u,separators=/^[\s\-‐‑‒–—―_/.\\]*$/u;
  const bounded=(start,end)=>!join.test(source[start-1]||'')&&!join.test(source[end]||'');
  for(let i=0;i<words.length;i++){
   const first=words[i],start=first.index;
   if(first[0]===parsed.value&&bounded(start,start+first[0].length))return true;
   let combined='';
   for(let j=i;j<words.length;j++){
    const word=words[j];if(j>i){const previous=words[j-1];if(!separators.test(source.slice(previous.index+previous[0].length,word.index)))break}
    combined+=word[0];if(combined.length>parsed.value.length||!parsed.value.startsWith(combined))break;
    if(combined===parsed.value&&bounded(start,word.index+word[0].length))return true;
   }
  }
  return false;
 }
 function inPublicField(value,parsed){
  if(typeof value!=='string'||!value)return false;
  const cacheable=value.length<=MAX_FIELD_LENGTH,key=parsed.kind+':'+(parsed.partial?'prefix:':'full:')+parsed.value,row=cacheable?fieldCache.get(value):null;
  if(row?.has(key)){const result=row.get(key);cacheHits++;row.delete(key);row.set(key,result);fieldCache.delete(value);fieldCache.set(value,row);return result}
  fieldEvaluations++;const result=evaluatePublicField(value,parsed);if(!cacheable)return result;
  const queries=row||new Map();queries.set(key,result);while(queries.size>MAX_QUERIES)queries.delete(queries.keys().next().value);
  if(!row)cachedCharacters+=value.length;fieldCache.delete(value);fieldCache.set(value,queries);
  while(fieldCache.size>MAX_FIELDS){const first=fieldCache.keys().next().value;fieldCache.delete(first);cachedCharacters-=first.length}
  return result;
 }
 function equalValue(value,parsed){return value!==null&&(parsed.partial?value.startsWith(parsed.value+':'):value===parsed.value)}
 function matches(lot,query){const parsed=compile(query);if(!parsed?.valid||!lot||typeof lot!=='object')return false;if(fields[parsed.kind].some(key=>equalValue(normalize[parsed.kind](lot[key]),parsed)))return true;return !parsed.explicit&&publicFields.some(key=>inPublicField(lot[key],parsed))}
 function match(lot,query,options){const parsed=compile(query,options);return Object.freeze({recognized:!!parsed,matched:!!parsed&&matches(lot,parsed),kind:parsed?.kind||null})}
 const api=Object.freeze({compile,matches,match,stats:()=>Object.freeze({cachedFields:fieldCache.size,cachedCharacters,cacheHits,fieldEvaluations,maxFields:MAX_FIELDS,maxFieldLength:MAX_FIELD_LENGTH,maxQueriesPerField:MAX_QUERIES})});globalThis.FasSearchIdentifiers=api;if(typeof window!=='undefined')window.FasSearchIdentifiers=api;
})();

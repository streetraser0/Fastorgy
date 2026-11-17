/* Conservative spelling help for query compilation, never for stored asset data. */
(()=>{
 'use strict';
 const LETTERS=/^\p{L}+$/u,MAX_VOCABULARY=30000,MAX_TOKEN=40,CACHE_LIMIT=512,CANDIDATE_LIMIT=4096;
 const normalizeDefault=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
 const bounded=(value,fallback,maximum)=>Number.isInteger(value)&&value>0?Math.min(value,maximum):fallback;
 function grams(word){const result=new Set();for(let i=1;i<word.length;i++)result.add(word.slice(i-1,i+1));return result}
 function letters(word){const counts=new Map();for(const letter of word)counts.set(letter,(counts.get(letter)||0)+1);return counts}
 function sharesEnough(a,b,minimum){let shared=0;for(const [letter,count] of a){shared+=Math.min(count,b.get(letter)||0);if(shared>=minimum)return true}return shared>=minimum}
 // Restricted Damerau-Levenshtein: adjacent swaps count as one typing error.
 function distance(a,b,limit=2){
  a=String(a);b=String(b);limit=Number.isInteger(limit)&&limit>=0?Math.min(limit,2):2;
  if(a===b)return 0;if(Math.abs(a.length-b.length)>limit)return limit+1;
  if(!a.length||!b.length)return Math.min(limit+1,Math.max(a.length,b.length));
  let previous=Array.from({length:b.length+1},(_,j)=>j),older=null;
  for(let i=1;i<=a.length;i++){
   const row=new Array(b.length+1).fill(limit+1);row[0]=i;let minimum=row[0];
   for(let j=Math.max(1,i-limit);j<=Math.min(b.length,i+limit);j++){
    row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
    minimum=Math.min(minimum,row[j]);
   }
   if(minimum>limit)return limit+1;older=previous;previous=row;
  }
  return Math.min(limit+1,previous[b.length]);
 }
 function create(vocabulary,options={}){
  const normalize=typeof options.normalize==='function'?options.normalize:normalizeDefault;
  const maxVocabulary=bounded(options.maxVocabulary,MAX_VOCABULARY,MAX_VOCABULARY),maxCandidates=bounded(options.maxCandidates,CANDIDATE_LIMIT,CANDIDATE_LIMIT),cacheLimit=bounded(options.cacheLimit,CACHE_LIMIT,CACHE_LIMIT);
  const words=new Set(),buckets=new Map(),indexes=new Map(),counts=new Map(),cache=new Map();
  const metrics={lookups:0,cacheHits:0,candidateChecks:0,distanceChecks:0,tooBroad:0};
  const canonical=value=>{try{return String(normalize(value)??'')}catch{return ''}};
  for(const raw of vocabulary&&typeof vocabulary[Symbol.iterator]==='function'?vocabulary:[]){
   const word=canonical(raw);if(word.length<3||word.length>MAX_TOKEN||!LETTERS.test(word)||words.has(word))continue;
   if(words.size>=maxVocabulary)break;words.add(word);counts.set(word,letters(word));
   if(!buckets.has(word.length)){buckets.set(word.length,new Set());indexes.set(word.length,new Map())}
   buckets.get(word.length).add(word);const index=indexes.get(word.length);
   for(const gram of grams(word)){if(!index.has(gram))index.set(gram,new Set());index.get(gram).add(word)}
  }
  function result(original,decision){return Object.freeze({original,value:decision.corrected?decision.value:original,corrected:!!decision.corrected,distance:decision.distance??0,ambiguous:!!decision.ambiguous,reason:decision.reason,candidates:decision.candidates||Object.freeze([])})}
  function remember(key,value){cache.set(key,Object.freeze(value));if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);return value}
  function correct(token){
   const original=String(token??''),key=canonical(original);metrics.lookups++;
   if(words.has(key))return result(original,{reason:'exact'});
   // Prices, lot numbers, cadastral IDs, VINs and model codes must remain exact.
   if(!LETTERS.test(key)||key.length>MAX_TOKEN||/^[a-hj-npr-z]{17}$/i.test(key)||options.protected?.(original))return result(original,{reason:'protected'});
   if(key.length<4)return result(original,{reason:'short'});
   if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);metrics.cacheHits++;return result(original,hit)}
   const limit=key.length>=8?2:1,queryGrams=grams(key),candidates=new Set();
   for(let length=Math.max(3,key.length-limit);length<=key.length+limit;length++){
    const bucket=buckets.get(length);if(!bucket)continue;
    // One adjacent swap can destroy three bigrams. When at least one must
    // survive, use its inverted index; short boundary buckets are tiny scans.
    if(Math.min(key.length,length)-1<=3*limit){for(const word of bucket)candidates.add(word)}
    else{const index=indexes.get(length);for(const gram of queryGrams)for(const word of index.get(gram)||[])candidates.add(word)}
    if(candidates.size>maxCandidates){metrics.tooBroad++;return result(original,remember(key,{reason:'too-broad',ambiguous:true}))}
   }
   const queryCounts=letters(key);let best=limit+1,matches=[];
   for(const candidate of candidates){
    metrics.candidateChecks++;
    if(!sharesEnough(queryCounts,counts.get(candidate),Math.min(key.length,candidate.length)-limit))continue;
    metrics.distanceChecks++;const cost=distance(key,candidate,limit);if(cost>limit||cost>best)continue;
    if(cost<best){best=cost;matches=[candidate]}else matches.push(candidate);
   }
   matches.sort();const suggestions=Object.freeze(matches.slice(0,5));
   const decision=matches.length===1?{value:matches[0],corrected:true,distance:best,reason:'corrected',candidates:suggestions}:matches.length>1?{ambiguous:true,distance:best,reason:'ambiguous',candidates:suggestions}:{reason:'unknown'};
   return result(original,remember(key,decision));
  }
  return Object.freeze({correct,stats:()=>Object.freeze({...metrics,vocabularySize:words.size,cacheSize:cache.size,maxCandidates,cacheLimit}),clearCache(){cache.clear()}});
 }
 const api=Object.freeze({create,distance});globalThis.FasSearchTypos=api;if(typeof window!=='undefined')window.FasSearchTypos=api;
})();

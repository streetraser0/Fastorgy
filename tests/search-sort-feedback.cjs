const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true});
function feedback(query,sort){
 h.node('#search').value=query;h.node('#sort').value=sort;
 h.run('updateKeywordSearchFeedback($("#search").value,2,"property")');
 return h.node('#keyword-search-feedback').innerHTML;
}
const nearest=feedback('квартира до 60 квадратов рядом','nearest');
assert(nearest.includes('Сначала ближайшие'));assert(nearest.includes('60'));
const overridden=feedback('квартира до 60 квадратов рядом','high');
assert(!overridden.includes('Сначала ближайшие'),'feedback must not advertise an overridden keyword sort');
assert(overridden.includes('60'),'manual sort does not erase parsed area');
assert(!overridden.includes('чтобы показать ближайшие'));
assert(feedback('недорогая квартира в Воронеже','low').includes('Сначала дешевле'));
assert(!feedback('недорогая квартира в Воронеже','high').includes('Сначала дешевле'));
console.log('PASS: search interpretation follows manual sort changes while retaining other parsed criteria.');

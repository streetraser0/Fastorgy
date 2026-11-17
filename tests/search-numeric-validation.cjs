const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true});
h.run('cars=cars.slice(0,3);invalidateSubscriptionInventory();render()');
const initial=h.run('visibleLots.map(lot=>lot.id).join(",")');
for(const [field,value] of [['price-max','-1'],['area-min','-0.1'],['year-min','NaN'],['kw-max','Infinity'],['mileage-min','1e309'],['deposit-max','9007199254740992']]){
 const markup=h.node('#grid').innerHTML;
 h.node('#adv-'+field).value=value;
 h.run('render()');
 assert(h.node('#advanced-error').textContent,'invalid numeric filter explains its problem: '+field);
 assert.equal(h.run('visibleLots.map(lot=>lot.id).join(",")'),initial,'bad numeric input preserves prior results: '+field);
 assert(h.node('#grid').innerHTML===markup,'bad numeric input never renders a false empty screen');
 h.node('#adv-'+field).value='';h.run('render()');
 assert.equal(h.node('#advanced-error').textContent,'','correcting the field recovers immediately');
}
h.node('#adv-price-min').value='0';h.node('#adv-area-min').value='12.5';h.node('#adv-kw-min').value='0.75';
assert.equal(h.run('readAdvancedFilters().error'),'','zero and fractional area/power remain usable');
h.node('#adv-price-min').value='500000';h.node('#adv-price-max').value='100000';
assert(h.run('readAdvancedFilters().error').includes('границы'),'valid numbers still report reversed bounds');
console.log('PASS: negative/nonfinite/unsafe numeric search input preserves prior results, corrections recover, decimals and range checks remain usable.');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { valueAt, selectRows, csvCell } from './model.js';
const data = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));
test('snapshot covers economies globally, excluding aggregates', () => {
 assert.ok(data.countries.length > 200);
 assert.ok(new Set(data.countries.map(c=>c.region)).size >= 7);
 assert.ok(!data.countries.some(c=>c.id==='WLD'));
 assert.ok(valueAt(data,'WLD',2025)>0);
 for(const series of Object.values(data.observations)) for(const v of Object.values(series)) assert.ok(v===null || (Number.isFinite(v)&&v>=0&&v<=100));
});
test('missing observations stay missing; zero is valid', () => {
 const fixture={observations:{X:{2024:0,2023:12}}};
 assert.equal(valueAt(fixture,'X',2024),0);
 assert.equal(valueAt(fixture,'X',2025),null);
 assert.equal(valueAt(fixture,'Y',2024),null);
});
test('filters use selected year and sort nulls last in either direction',()=>{
 const fixture={countries:[{id:'A',name:'Alpha',region:'R'},{id:'B',name:'Beta',region:'S'},{id:'C',name:'Gamma',region:'R'}],observations:{A:{2025:0},B:{2024:9},C:{2025:20}}};
 assert.deepEqual(selectRows(fixture,{year:2025}).map(c=>c.id),['C','A','B']);
 assert.deepEqual(selectRows(fixture,{year:2025,sort:'low'}).map(c=>c.id),['A','C','B']);
 assert.deepEqual(selectRows(fixture,{year:2025,region:'R',search:'ALP'}).map(c=>c.id),['A']);
 assert.equal(selectRows(fixture,{year:2025,search:'nothing'}).length,0);
 assert.equal(csvCell(null),'""');
 assert.equal(csvCell('A,"B"'),'"A,""B"""');
});

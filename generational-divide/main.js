import './style.css';
import data from './data.json';
import snapshotUrl from './data.json?url';
import { valueAt, selectRows, csvCell } from './model.js';
const $ = id => document.getElementById(id);
$('snapshot').href = snapshotUrl;
$('unemployment-card-rate').textContent = valueAt(data, 'WLD', 2025) === null ? 'No data' : `${valueAt(data, 'WLD', 2025).toFixed(1)}%`;
const rate = value => value === null ? 'No data' : `${value.toFixed(1)}%`;
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('year').innerHTML = [...data.years].reverse().map(y => `<option>${y}</option>`).join('');
$('region').innerHTML += [...new Set(data.countries.map(c => c.region))].sort().map(r => `<option>${escape(r)}</option>`).join('');
$('vintage').textContent = `Snapshot retrieved ${data.retrieved}. World Bank source last updated ${data.lastUpdated}. Bundled locally for reproducibility; no live API dependency.`;
let selected = 'WLD';
function state() { return Object.fromEntries(['year','region','search','sort'].map(id => [id, $(id).value])); }
function trend(id) {
 selected = id;
 const name = data.countries.find(c => c.id === id)?.name ?? 'World';
 $('trend-title').textContent = name;
 $('trend-note').textContent = 'Youth unemployment (% of labour force ages 15–24). Fixed 0–100% scale; gaps mean no data. Highlight marks the selected year.';
 const vals = data.years.map(y => ({year:y, value:valueAt(data,id,y)}));
 $('chart').innerHTML = `<div class="bars" role="img" aria-label="Annual youth unemployment for ${escape(name)}. Exact values are in the annual values table below.">${vals.map(({year,value}) => `<div class="bar-column ${String(year)===$('year').value?'selected':''}" title="${year}: ${rate(value)}"><span class="bar-value">${value === null ? '×' : ''}</span><div class="bar" style="height:${value ?? 0}%"></div><small>${year%5===0?year:''}</small></div>`).join('')}</div><p class="axis">0–100% · Hover for values · × No data</p>`;
 $('annual').innerHTML = `<table><thead><tr><th>Year</th><th>Rate</th></tr></thead><tbody>${vals.map(v=>`<tr><th scope="row">${v.year}</th><td>${rate(v.value)}</td></tr>`).join('')}</tbody></table>`;
}
function render() {
 const s = state(), rows = selectRows(data,s);
 const available = data.countries.filter(c => valueAt(data,c.id,s.year)!==null).length;
 $('world-year').textContent = s.year; $('world').textContent = rate(valueAt(data,'WLD',s.year));
 $('coverage').textContent = `${available} / ${data.countries.length}`;
 $('missing').textContent = `economies with data in ${s.year}; ${data.countries.length-available} missing`;
 $('results').textContent = `${rows.length} economies match · ${rows.filter(c=>c.value===null).length} without data · ${s.year}. Select an economy for its history.`;
 $('rows').innerHTML = rows.length ? rows.map(c=>`<tr><th scope="row"><button class="country" data-id="${c.id}" aria-pressed="${c.id===selected}">${escape(c.name)}</button></th><td>${escape(c.region)}</td><td><div class="rate"><span>${rate(c.value)}</span>${c.value===null?'':`<i style="width:${c.value}%"></i>`}</div></td></tr>`).join('') : '<tr><td colspan="3">No matching economies. Try another search or region.</td></tr>';
 trend(selected);
}
for(const id of ['year','region','search','sort']) $(id).addEventListener('input',render);
$('rows').addEventListener('click',e=>{ const b=e.target.closest('[data-id]');if(b){selected=b.dataset.id;render();} });
$('download').addEventListener('click',()=>{
 const s=state();const rows=[['Economy','ISO3','Region','Year','Youth unemployment (%)','Status','Indicator','Retrieved','Source updated'],...selectRows(data,s).map(c=>[c.name,c.id,c.region,s.year,c.value,c.value===null?'No data':'Modelled ILO estimate',data.indicator,data.retrieved,data.lastUpdated])];
 const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`youth-unemployment-${s.year}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();

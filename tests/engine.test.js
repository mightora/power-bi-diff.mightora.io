import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFiles, readZip, compare, releaseNotes, decodeText, stableString, LIMITS } from '../src/engine.js';

const report = (version) => {
 const prefix='Sales.Report/definition/'; const files={};
 files[prefix+'report.json']=JSON.stringify({filterConfig:{filters:[{field:'Date.Year',value:version===1?2025:2026}]},objects:{theme:'default'}});
 files[prefix+'pages/pages.json']=JSON.stringify({pageOrder:['overview',...(version===2?['forecast']:[])],activePageName:'overview'});
 files[prefix+'pages/overview/page.json']=JSON.stringify({name:'overview',displayName:'Executive overview',width:1280,height:720});
 files[prefix+'pages/overview/visuals/revenue/visual.json']=JSON.stringify({name:'revenue',position:{x:0,y:0,z:0,width:version===1?400:450,height:300},visual:{visualType:'lineChart',query:{foo:'bar'},objects:{colors:{primary:version===1?'blue':'navy'}}}});
 if(version===2) files[prefix+'pages/forecast/page.json']=JSON.stringify({name:'forecast',displayName:'Forecast',width:1280,height:720});
 if(version===1) files[prefix+'bookmarks/old.bookmark.json']=JSON.stringify({name:'old',displayName:'Before snapshot'});
 files['Sales.SemanticModel/definition/tables/Sales.tmdl'] = `table Sales\n\tmeasure Revenue = ${version===1?'SUM(Sales[Gross])':'SUM(Sales[Gross]) - SUM(Sales[Returns])'}\n\t\tformatString: £#,0\n\tmeasure 'Net Margin' = DIVIDE([Net Revenue],[Revenue])\n\t\tformatString: 0.0%\n`;
 files['Sales.SemanticModel/definition/relationships.tmdl'] = `relationship sales-date\n\tfromColumn: Sales.DateKey\n\ttoColumn: Date.DateKey\n\tisActive: ${version===1?'true':'false'}\n`;
 return Object.fromEntries(Object.entries(files).map(([key,val])=>[key,new TextEncoder().encode(val)]));
};
test('PBIR and TMDL parsed with side-by-side changes, not conflating categories',()=>{
 const v1=parseFiles('v1',report(1)),v2=parseFiles('v2',report(2));
 assert.equal(v1.source,'PBIR');assert.equal(v1.supported.measures,true);assert.equal(v1.supported.relationships,true);
 const result=compare(v1,v2);
 assert.equal(result.totals.unverified,0);
 assert.ok(result.changed.some(x=>x.type==='measures'&&x.status==='modified'&&x.label.includes('Revenue')));
 assert.ok(result.changed.some(x=>x.type==='visuals'&&x.status==='modified'));
 assert.ok(result.changed.some(x=>x.type==='relationships'&&x.status==='modified'));
 assert.ok(result.changed.some(x=>x.type==='bookmarks'&&x.status==='removed'));
 assert.ok(result.changed.some(x=>x.type==='pages'&&x.status==='added'));
 assert.ok(releaseNotes(result).includes('## DAX measures'));
 assert.ok(releaseNotes(result).includes('Comparison coverage'));
});
test('missing TMDL is unverified, not invented as removal',()=>{
 const baseline=parseFiles('baseline',report(1)); const withoutModel=Object.fromEntries(Object.entries(report(2)).filter(([k])=> !k.endsWith('.tmdl')));
 const r=compare(baseline,parseFiles('updated',withoutModel));
 assert.ok(r.coverage.some(c=>c.type==='measures'&&c.status==='unavailable'));
 assert.ok(!r.changed.some(x=>x.type==='measures'));
});
test('legacy Report/Layout supports visuals without asserting model coverage',()=>{
 const sample={sections:[{name:'ReportSection1',displayName:'Home',width:1280,height:720,visualContainers:[{config:JSON.stringify({name:'kpi1',singleVisual:{visualType:'card'},layouts:[{position:{x:10,y:30,width:100,height:50}}]})}]}]};
 const data=parseFiles('legacy',{ 'Report/Layout':new TextEncoder().encode(JSON.stringify(sample)) });
 assert.equal(data.source,'PBIX/PBIT legacy layout');assert.equal(Object.keys(data.entities.visuals).length,1);
 assert.equal(data.supported.measures,false);
});
test('TMSL model.bim measures and relationships',()=>{
 const model={model:{tables:[{name:'Sales',measures:[{name:'Total',expression:'SUM(Sales[Amount])'}]}],relationships:[{name:'r1',fromTable:'Sales',fromColumn:'DateKey',toTable:'Date',toColumn:'DateKey'}]}};
 const snap=parseFiles('bim',{'Sales.SemanticModel/model.bim':JSON.stringify(model)});
 assert.equal(snap.supported.measures,true);assert.equal(snap.supported.relationships,true);
 assert.equal(Object.keys(snap.entities.measures).length,1);
});
test('canonical JSON comparison ignores harmless key ordering',()=>assert.equal(stableString({b:2,a:1}),stableString({a:1,b:2})));
test('UTF-16LE legacy layout detection works',()=>{
 const v=Buffer.from('{"sections":[]}','utf16le');assert.equal(decodeText(v),'{"sections":[]}');
});
test('non report rejected with useful diagnostic',()=>assert.throws(()=>parseFiles('nope',{'ignore.json':'{}'}),/No supported Power BI metadata/));
test('readZip rejects malicious/invalid data',async()=>{await assert.rejects(readZip(Uint8Array.from([1,2,3])),/Invalid ZIP/);await assert.rejects(readZip(new Uint8Array(LIMITS.archiveBytes+1)),/safety limit/);});

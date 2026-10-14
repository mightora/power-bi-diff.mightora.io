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

const pbipText = (reportPath='Sales.Report') => JSON.stringify({
  '$schema':'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
  version:'1.0', artifacts:[{report:{path:reportPath}}]
});
const sampleFile = (name, text, relativePath = '') => ({name, size:new TextEncoder().encode(text).length, webkitRelativePath:relativePath, arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
const project = (version=1, modelReference='../Sales.SemanticModel') => ({
 'demo/Sales.pbip':pbipText('Sales.Report'),
 'demo/Sales.Report/definition.pbir':JSON.stringify({version:'4.0',datasetReference:{byPath:{path:modelReference}}}),
 'demo/Sales.Report/definition/report.json':JSON.stringify({filterConfig:{filters:[]}}),
 'demo/Sales.Report/definition/pages/pages.json':JSON.stringify({pageOrder:['overview']}),
 'demo/Sales.Report/definition/pages/overview/page.json':JSON.stringify({name:'overview',displayName:'Overview'}),
 'demo/Sales.Report/definition/pages/overview/visuals/chart/visual.json':JSON.stringify({name:'chart',visual:{visualType:'barChart'},position:{x:20,y:40,width:500+version,height:400}}),
 'demo/Sales.SemanticModel/definition.pbism':JSON.stringify({version:'4.0'}),
 'demo/Sales.SemanticModel/definition/tables/Sales.tmdl':`table Sales\n\tmeasure Revenue = SUM(Sales[${version===1?'Gross':'Net'}])\n`,
 'demo/Sales.SemanticModel/definition/relationships.tmdl':`relationship r1\n\tfromColumn: Sales.DateKey\n\ttoColumn: Date.DateKey\n`
});
// Self-contained stored ZIP: local headers + central directory, for exercising real upload ingestion.
function zipStored(paths) {
 const payloads=[], central=[]; let offset=0;
 for(const [name, value] of Object.entries(paths)) {
   const nameBytes=Buffer.from(name), bytes=Buffer.from(value);
   const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(nameBytes.length,26);
   payloads.push(local,nameBytes,bytes);
   const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt32LE(bytes.length,20);dir.writeUInt32LE(bytes.length,24);dir.writeUInt16LE(nameBytes.length,28);dir.writeUInt32LE(offset,42);
   central.push(dir,nameBytes);offset+=local.length+nameBytes.length+bytes.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(paths).length,8);end.writeUInt16LE(Object.keys(paths).length,10);
 const dir=Buffer.concat(central);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...payloads,dir,end]);
}
test('PBIP folder chooses referenced report and semantic model, excluding unrelated model',()=>{
 const files=project(1);
 files['demo/Other.Report/definition/report.json']=JSON.stringify({});
 files['demo/Other.Report/definition/pages/other/page.json']=JSON.stringify({name:'other'});
 files['demo/Other.SemanticModel/model.bim']=JSON.stringify({model:{tables:[{name:'Other',measures:[{name:'wrong',expression:'0'}]}]}});
 const s=parseFiles('project',files);
 assert.equal(s.source,'PBIP · PBIR');assert.equal(Object.keys(s.entities.visuals).length,1);
 assert.ok(s.entities.measures['Sales.[Revenue]']);assert.ok(!s.entities.measures['Other.[wrong]']);
});
test('PBIP ZIP and project folder parse identically, with comparison and release notes',async()=>{
 const a=project(1),b=project(2);
 const folder=await import('../src/engine.js').then(m=>m.parseUpload('folder',Object.entries(a).map(([path,val])=>sampleFile(path.split('/').at(-1),val,path))));
 const zip=zipStored(b);
 const z=await import('../src/engine.js').then(m=>m.parseUpload('ZIP',[{name:'project.zip',size:zip.length,arrayBuffer:async()=>zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.length)}]));
 assert.equal(folder.source,'PBIP · PBIR');assert.equal(z.source,'PBIP · PBIR');
 const r=compare(folder,z);
 assert.ok(r.changed.some(x=>x.type==='visuals'));
 assert.ok(r.changed.some(x=>x.type==='measures'));
 assert.match(releaseNotes(r),/DAX measures/);
});
test('A standalone PBIP shortcut explains why a complete project is required',async()=>{
 const s=sampleFile('Sales.pbip',pbipText());
 await assert.rejects(import('../src/engine.js').then(m=>m.parseUpload('shortcut',[s])),/only a project shortcut.*complete PBIP project folder/i);
});
test('Multi-report archives select PBIP referenced report, missing references fail safely',()=>{
 const files=project();
 files['demo/Another.Report/definition/report.json']=JSON.stringify({});
 files['demo/Another.Report/definition/pages/another/page.json']=JSON.stringify({name:'another'});
 assert.equal(Object.keys(parseFiles('multi',files).entities.pages).length,1);
 delete files['demo/Sales.pbip'];
 assert.throws(()=>parseFiles('ambiguous',files),/Several reports were found/);
});
test('PBIR external semantic model does not borrow unrelated TMDL',()=>{
 const files=project();
 files['demo/Sales.Report/definition.pbir']=JSON.stringify({datasetReference:{byConnection:{connectionString:'semanticmodelid=elsewhere'}}});
 const r=parseFiles('external',files);
 assert.equal(r.supported.measures,false); assert.equal(r.supported.relationships,false);
 assert.match(r.warnings.join(' '),/external semantic model/);
});
test('Broken PBIP semantic reference marks DAX unverified, never compares another model',()=>{
 const files=project(1,'../Missing.SemanticModel');
 const r=compare(parseFiles('before',project()),parseFiles('after',files));
 assert.ok(r.coverage.some(x=>x.type==='measures'&&x.status==='unavailable'));
 assert.ok(!r.changed.some(x=>x.type==='measures'));
});
test('PBIP report shortcut rejects missing report and path traversal',()=>{
 const files=project(); delete files['demo/Sales.Report/definition/report.json'];
 assert.throws(()=>parseFiles('missing',files),/only a project shortcut/);
 assert.throws(()=>parseFiles('unsafe',{'Sales.pbip':pbipText('../../outside.Report')}),/unsafe or invalid report folder reference/);
});

test('PBIR root-level definition/ archive remains accepted',()=>{
 const files={};for(const [path,value] of Object.entries(project()))if(path.startsWith('demo/Sales.Report/definition/'))files[path.split('demo/Sales.Report/')[1]]=value;
 const r=parseFiles('pbir',files);assert.equal(r.source,'PBIR');assert.ok(r.entities.visuals['overview/chart']);
});
test('legacy PBIP report.json with model.bim is detected',()=>{
 const files={'Retail.pbip':pbipText('Retail.Report'),'Retail.Report/definition.pbir':JSON.stringify({version:'1.0'}),
 'Retail.Report/report.json':JSON.stringify({sections:[{name:'home',displayName:'Home',visualContainers:[]}]}),
 'Retail.SemanticModel/model.bim':JSON.stringify({model:{tables:[{name:'Sales',measures:[{name:'Net',expression:'SUM(Sales[Net])'}]}]}})};
 const r=parseFiles('legacy-pbip',files);assert.match(r.source,/PBIP/);assert.ok(r.supported.pages);assert.ok(r.supported.measures);
});

from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json
root=Path(__file__).resolve().parents[1]
folder=root/'samples'
folder.mkdir(exist_ok=True)
for version in [1,2]:
  p=f'Sales.Report/definition/'
  d={
   p+'version.json': {'version':'2.0.0'},
   p+'report.json': {'$schema':'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json','filterConfig':{'filters':[{'field':'Date.Year','value':2025 if version==1 else 2026}]},'objects':{'general':{'theme':'corporate'}}},
   p+'pages/pages.json': {'pageOrder':['overview'] + (['forecast'] if version==2 else []),'activePageName':'overview'},
   p+'pages/overview/page.json': {'name':'overview','displayName':'Executive overview','width':1280,'height':720},
   p+'pages/overview/visuals/revenue/visual.json': {'name':'revenue','position':{'x':40,'y':100,'z':1000,'width':560 if version==1 else 640,'height':310},'visual':{'visualType':'lineChart','objects':{'dataPoint':{'fill':{'solid':{'color':'#2980b9' if version==1 else '#1364a8'}}}},'query':{'queryState':{'Values':{'projections':[{'field':'Sales.[Revenue]'}]}}}}},
   p+'bookmarks/executive.bookmark.json': {'name':'executive','displayName':'Executive summary','explorationState':{'sections':{}}},
  }
  if version==2:
   d[p+'pages/forecast/page.json']={'name':'forecast','displayName':'Revenue forecast','width':1280,'height':720}
   d[p+'pages/forecast/visuals/revenue/visual.json']={'name':'card','position':{'x':25,'y':60,'width':350,'height':200},'visual':{'visualType':'cardVisual'}}
  files={k:json.dumps(v,indent=2) for k,v in d.items()}
  files['Sales.SemanticModel/definition/tables/Sales.tmdl']=f"""table Sales
\tmeasure Revenue = {'SUM(Sales[Gross])' if version==1 else 'SUM(Sales[Gross]) - SUM(Sales[Returns])'}
\t\tformatString: £#,0
\tmeasure 'Average Revenue' = DIVIDE([Revenue],COUNTROWS(Sales))
\t\tformatString: £#,0.00
"""
  files['Sales.SemanticModel/definition/relationships.tmdl']=f"""relationship sales-calendar
\tfromColumn: Sales.DateKey
\ttoColumn: Calendar.DateKey
\tisActive: {'true' if version==1 else 'false'}
"""
  with ZipFile(folder/f'sample-report-v{version}.zip','w',ZIP_DEFLATED) as z:
   for file,content in files.items():z.writestr(file,content)
print('Sample PBIR/TMDL archives created')

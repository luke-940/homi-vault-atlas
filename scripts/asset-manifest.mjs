import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=value=>typeof value==='string'&&/^(assets|licenses)\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.split('/').some(p=>!p||p==='.'||p==='..');
export function validateAssetManifest(files,spatial){
 const map=new Map(files.map(f=>[f.path,f.body])),body=map.get('assets/asset-manifest.json');
 if(!body)throw new Error('Asset dependency manifest missing.');
 const data=JSON.parse(body),keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
 if(!keys(data,['schema','sources','assets'])||data.schema!=='atlas.assets.v82'||!Array.isArray(data.assets)||!Array.isArray(data.sources))throw new Error('Invalid asset manifest schema.');
 const sourceIds=new Set();for(const source of data.sources){
  const expectedLicense=source.id==='basis-decoder'?'Apache-2.0':source.id?.startsWith('atlas-')?'Atlas-project':'CC0-1.0';
  const expectedNotice=source.id==='basis-decoder'?'licenses/basis-universal-LICENSE.txt':'licenses/assets-NOTICE.md';
  if(!keys(source,['id','license','notice'])||!['atlas-authored','atlas-generated','quaternius-nature','quaternius-whale','kenney-furniture','kenney-pirate','surface-sources','basis-decoder'].includes(source.id)||sourceIds.has(source.id)||source.license!==expectedLicense||source.notice!==expectedNotice||!map.has(source.notice))throw new Error('Unreviewed asset source.');sourceIds.add(source.id);
 }
 const seen=new Set();for(const asset of data.assets){
  if(!keys(asset,['path','bytes','sha256','stage','quality','dependencies','sourceIds'])||!safe(asset.path)||!asset.path.startsWith('assets/')||asset.path==='assets/asset-manifest.json'||seen.has(asset.path))throw new Error('Invalid asset entry.');seen.add(asset.path);
  const bytes=map.get(asset.path);if(!bytes||bytes.length!==asset.bytes||sha(bytes)!==asset.sha256)throw new Error('Asset byte binding differs.');
  if(!['initial','island-base','island-landscape','reading','map','shared'].includes(asset.stage)||asset.quality!=='all'||!Array.isArray(asset.sourceIds)||asset.sourceIds.some(id=>!sourceIds.has(id))||!asset.sourceIds.length||!Array.isArray(asset.dependencies)||new Set(asset.dependencies).size!==asset.dependencies.length||asset.dependencies.some(p=>!safe(p)||!map.has(p)||p===asset.path))throw new Error('Asset dependency contract differs.');
  if(asset.path.endsWith('.glb')){
   const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12))),actual=[...new Set((json.images??[]).filter(i=>i.uri).map(i=>'assets/'+i.uri))].sort();
   if(JSON.stringify(actual)!==JSON.stringify([...asset.dependencies].sort()))throw new Error('GLB image dependencies differ.');
  }
 }
 const expected=files.filter(f=>f.path.startsWith('assets/')&&f.path!=='assets/asset-manifest.json').map(f=>f.path);
 if(expected.length!==seen.size||expected.some(p=>!seen.has(p)))throw new Error('Asset manifest coverage differs.');
 for(const island of spatial?.islands??[]){
  if(island.modelUrl!==`assets/atlas-v82-${island.id}.glb`||island.sceneStages?.length!==2)throw new Error('Island loading stages missing.');
  for(const stage of island.sceneStages){if(!seen.has(stage.url))throw new Error('Island stage not shipped.');}
  const base=data.assets.find(a=>a.path===island.modelUrl);
  if(JSON.stringify([...base.dependencies].sort())!==JSON.stringify([...island.sharedResources].sort()))throw new Error('Island shared resources differ.');
 }
 return {valid:true,assets:seen.size,sources:sourceIds.size,dependencyBinding:'checked'};
}

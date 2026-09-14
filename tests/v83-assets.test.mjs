import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectFiles} from '../scripts/verify-artifact.mjs';
import {validateAssets} from '../scripts/validate-assets.mjs';
import {validateAssetManifest} from '../scripts/asset-manifest.mjs';
const files=[...(await collectFiles('public')),...(await collectFiles('licenses','licenses'))].filter((f,i,a)=>a.findIndex(x=>x.path===f.path)===i);
const spatial=JSON.parse(fs.readFileSync('public/data/islands.json'));
const manifest=JSON.parse(fs.readFileSync('public/assets/asset-manifest.json'));
test('v8.3 shipped marine keeps a real animated skin and binds its clip metadata',()=>{
 const m=manifest.assets.find(a=>a.path==='assets/atlas-v83-marine.glb');
 assert.ok(m.skins>0);assert.equal(m.animations.filter(a=>a.includes('WhaleSwim')).length,1);
 assert.equal(validateAssetManifest(files,spatial).valid,true);
 const changed=structuredClone(manifest);changed.assets.find(a=>a.path===m.path).animations=[];
 const mutated=files.map(f=>f.path==='assets/asset-manifest.json'?{...f,body:Buffer.from(JSON.stringify(changed))}:f);
 assert.throws(()=>validateAssetManifest(mutated,spatial),/Animation or skin/);
});
test('v8.3 physical exhibits and additional study props are checked against real GLB nodes',()=>{
 assert.equal(validateAssets(files,{spatial}).valid,true);
 const changed=structuredClone(spatial),place=changed.islands.find(i=>i.id==='groot').places.find(p=>p.additionalHitNodes.length);
 place.additionalHitNodes.push('groot-study-missing-reviewed-node');
 assert.ok(validateAssets(files,{spatial:changed}).issues.some(i=>i.code==='GLB_ADDITIONAL_HIT_MISSING'));
});

test('private path rules distinguish exact legal notice links from arbitrary Markdown references',()=>{
 const privatePatterns=[{id:'fixture-markdown',expression:/\.md\b/i}];
 assert.equal(validateAssets(files,{spatial,privatePatterns}).valid,true);
 const changed=structuredClone(manifest);changed.sources[0].notice='licenses/private-note.md';
 const mutated=files.map(f=>f.path==='assets/asset-manifest.json'?{...f,body:Buffer.from(JSON.stringify(changed))}:f);
 assert.ok(validateAssets(mutated,{spatial,privatePatterns}).issues.some(i=>i.code==='PRIVATE_PUBLICATION_RULE'));
});

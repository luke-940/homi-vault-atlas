import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateAssetManifest} from '../scripts/asset-manifest.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(change=()=>{}){
 const body=Buffer.from('reviewed image fixture');
 const manifest={schema:'atlas.assets.v82',sources:[{id:'atlas-authored',license:'Atlas-project',notice:'licenses/assets-NOTICE.md'}],assets:[{path:'assets/map.webp',bytes:body.length,sha256:sha(body),stage:'map',quality:'all',dependencies:[],sourceIds:['atlas-authored']}]};
 const files=[{path:'assets/map.webp',body},{path:'licenses/assets-NOTICE.md',body:Buffer.from('notice')}];
 change(manifest,files);files.push({path:'assets/asset-manifest.json',body:Buffer.from(JSON.stringify(manifest))});return files;
}
test('asset dependency coverage binds every shipped asset to reviewed bytes and attribution',()=>{
 assert.equal(validateAssetManifest(fixture()).assets,1);
 assert.throws(()=>validateAssetManifest(fixture((m,f)=>{f[0].body=Buffer.from('altered bytes');})),/byte binding/);
 assert.throws(()=>validateAssetManifest(fixture((m,f)=>{f.push({path:'assets/extra.glb',body:Buffer.from('unlisted')});})),/coverage/);
 assert.throws(()=>validateAssetManifest(fixture(m=>{m.assets[0].dependencies=['assets/missing.webp'];})),/dependency contract/);
});
test('unknown sources and mismatched license or notice cannot become reviewed attribution',()=>{
 for(const change of [{id:'unreviewed'},{license:'CC0-1.0'},{notice:'assets/map.webp'}])assert.throws(()=>validateAssetManifest(fixture(m=>Object.assign(m.sources[0],change))),/Unreviewed asset source/);
 assert.throws(()=>validateAssetManifest(fixture(m=>{m.assets[0].sourceIds=['unreviewed'];})),/dependency contract/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import spatial from '../public/data/islands.json' with {type:'json'};
import map from '../public/data/map.json' with {type:'json'};
import content from '../public/data/content.json' with {type:'json'};
import evidence from '../public/data/evidence.json' with {type:'json'};
import {islands,knowledgeObjects,islandById,placeById,placesForNode,mapEntries,containmentEdges,resolveIslandPlace} from '../src/islands.ts';
import {validateSpatial} from '../scripts/validate-islands.mjs';
import {compilePrivatePatterns} from '../scripts/validate-content.mjs';
const run=(s=spatial,m=map,options={})=>validateSpatial(s,m,content,evidence,options);

test('all reviewed stories have spatial entrances and evidence without manufacturing a Vault folder for Atlas',()=>{
 assert.deepEqual(run(),{valid:true,issues:[]});
 assert.equal(knowledgeObjects.length,41);
 assert.equal(evidence.records.flatMap(r=>r.excerptParagraphs).length,51);
 for(const node of content.nodes)assert.ok(placesForNode(node.id).length,node.id);
 assert.equal(mapEntries.length,51);assert.equal(containmentEdges.length,50);
 assert.ok(mapEntries.every(e=>!e.islandIds.includes('atlas')));
 assert.equal(islandById.get('atlas').places[0].kind,'guide');
});
test('deep links keep object selection inside the requested island',()=>{
 const groot=islandById.get('groot').places[0];
 assert.equal(resolveIslandPlace('groot',groot.id).place.id,groot.id);
 assert.equal(resolveIslandPlace('rocket',groot.id).place,undefined);
 assert.equal(resolveIslandPlace('groot','unknown-17').place,undefined);
 assert.equal(resolveIslandPlace('unknown-23',groot.id),undefined);
 assert.deepEqual(placesForNode('unknown-29'),[]);
});
test('seven research lenses are independent inward-facing places and clocks reach three different existing paragraphs',()=>{
 const rocket=islandById.get('rocket');const hub=rocket.places.find(p=>p.contentIds.includes('rocket-desks'));
 const lenses=rocket.places.filter(p=>p.parentId===hub.id);assert.equal(lenses.length,7);assert.equal(new Set(lenses.map(p=>p.contentIds[0])).size,7);
 const clocks=rocket.subInteractions.filter(p=>p.id.startsWith('clock-'));
 assert.deepEqual(clocks.map(p=>p.actions[0].section.index),[0,1,2]);
 assert.deepEqual(clocks.map(p=>p.physicalPartIds[0]),['case-2/face','case-1/face','case-0/face']);
 assert.ok(clocks.every(p=>p.selectionProxy.radius===.725&&p.actions[0].nodeId==='rocket-clocks'));
});
test('guide actions are explicit, and a plaque can be selected while the camera frames the pavilion',()=>{
 const atlas=islandById.get('atlas');const entry=atlas.places.find(p=>p.contentIds.includes('atlas'));
 assert.notEqual(entry.assetId,entry.interactionAssetId);
 const table=atlas.places.find(p=>p.assetId==='atlas-world-table');
 assert.deepEqual(table.actions.map(a=>[a.action,a.view]),[['open-map','islands'],['open-map','vault']]);
 assert.equal(table.actions[1].relationMode,'containment');
 assert.equal(table.physicalPartIds[0],'top');
 assert.equal(atlas.subInteractions.length,4);
 assert.deepEqual(atlas.subInteractions.map(p=>p.actions[0].projectId),['rocket','groot','common','atlas']);
});
test('map marker projection includes the same border as the rendered map camera',()=>{
 for(const i of islands){
  const mapExtent={rocket:43,groot:40,common:38,atlas:35}[i.id];
  assert.deepEqual(i.mapBounds,{minX:-mapExtent,maxX:mapExtent,minZ:-mapExtent,maxZ:mapExtent});
  assert.ok(mapExtent>i.extent, 'the map keeps a border beyond the terrain extent');
  assert.ok(i.coast.every(([x,z])=>x>=i.mapBounds.minX&&x<=i.mapBounds.maxX&&z>=i.mapBounds.minZ&&z<=i.mapBounds.maxZ));
  for(const p of i.places)assert.deepEqual(p.arrivalPose.target,p.cameraLookAt);
 }
});
test('cross-project content, missing reader sections and disconnected object parents cannot pass validation',()=>{
 const s=structuredClone(spatial);s.islands[1].places[0].contentIds=['rocket'];s.islands[0].subInteractions.find(p=>p.id==='clock-physical').actions[0].section.index=900;s.islands[1].places[0].parentId='unknown-17';
 const r=run(s);assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.message.includes('different island')));assert.ok(r.issues.some(i=>i.message.includes('section does not exist')));assert.ok(r.issues.some(i=>i.message.includes('parent is outside')));
});
test('containment cannot be replaced by cycles, document parents or a manufactured Atlas directory',()=>{
 const m=structuredClone(map);m.entries[0].islandIds=['atlas'];const edge=m.containmentEdges[0];m.containmentEdges.push({sourceId:edge.targetId,targetId:edge.sourceId,relation:'contains'});m.containmentEdges[1].sourceId=m.entries.find(e=>e.kind==='document').id;
 const r=run(spatial,m);assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.message.includes('Vault folder')));assert.ok(r.issues.some(i=>i.message.includes('cycle')));assert.ok(r.issues.some(i=>i.message.includes('folder parent')));
});
test('public spatial data rejects hidden fields and encoded source locations without echoing their values',()=>{
 const s=structuredClone(spatial);s.islands[0].places[0].SENTINEL_47='SENTINEL_47';s.islands[0].places[0].question='https%3A%2F%2Fexample.invalid%2Fitem';
 const r=run(s,map,{privatePatterns:compilePrivatePatterns({patterns:[{pattern:'SENTINEL_47'}]})});assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.message.includes('outside the public')));assert.ok(r.issues.some(i=>i.message.includes('external URL')));assert.equal(JSON.stringify(r).includes('SENTINEL_47'),false);
});
test('invalid vectors and a camera floor below the island fail instead of being coerced',()=>{
 const s=structuredClone(spatial);s.islands[0].places[0].interactionAnchor=[0,Infinity,0];s.islands[0].limits.minEyeY=1.5;
 const r=run(s);assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.message.includes('finite coordinate')));assert.ok(r.issues.some(i=>i.message.includes('intersects terrain')));
});

test('camera approach routes connect all 41 viewing stations and do not stand in for knowledge edges',()=>{
 for(const island of islands){
  const reached=new Set([JSON.stringify(island.entry)]);const pending=new Set(island.paths.map(p=>p.id));let changed=true;
  while(changed){changed=false;for(const path of island.paths)if(pending.has(path.id)&&path.points.some(p=>reached.has(JSON.stringify(p)))){path.points.forEach(p=>reached.add(JSON.stringify(p)));pending.delete(path.id);changed=true;}}
  assert.equal(pending.size,0);for(const place of [...island.places,...island.subInteractions])assert.ok(reached.has(JSON.stringify(place.viewingPosition)),place.id);
 }
 const s=structuredClone(spatial);// One moved endpoint can still connect through another shared vertex.
 s.islands[1].paths[0].points=s.islands[1].paths[0].points.map(([x,y,z])=>[x+100,y,z+100]);
 assert.ok(run(s).issues.some(i=>i.message.includes('disconnected')));
});

test('same-count map and place identity replacements cannot manufacture reviewed locations',()=>{
 const m=structuredClone(map);const old=m.entries[0].id,neo='ct_unreviewed17';m.entries[0].id=neo;
 for(const e of m.containmentEdges){if(e.sourceId===old)e.sourceId=neo;if(e.targetId===old)e.targetId=neo;}
 assert.equal(m.entries.length,51);assert.equal(run(spatial,m).valid,false);
 const changed=structuredClone(map);const edge=changed.containmentEdges.at(-1);edge.sourceId=changed.entries.find(e=>e.kind==='folder'&&e.id!==edge.sourceId&&e.id!==edge.targetId).id;
 assert.equal(changed.containmentEdges.length,50);assert.equal(run(spatial,changed).valid,false);
 const s=structuredClone(spatial);s.islands[1].places[0].id='pl_unreviewed17';assert.equal(run(s).valid,false);
});
test('all seven Groot research stories retain explicit spatial and Reader destinations',()=>{
 const groot=islandById.get('groot');
 const expected=['groot','groot-judgment-roots','groot-thinking-play','groot-judgment-context','groot-appropriate-reliance','groot-transfer','groot-judgment-update'];
 assert.deepEqual(groot.places.flatMap(p=>p.contentIds),expected);
 for(const id of expected){const p=placesForNode(id)[0];assert.equal(p.islandId,'groot');assert.ok(p.actions.some(a=>a.action==='open-reader'&&a.nodeId===id));assert.ok(mapEntries.some(e=>e.contentNodeIds.includes(id)));}
});

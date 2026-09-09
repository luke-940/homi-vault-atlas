/** Public spatial contracts are a projection, never a folder export or a source manifest. */
const PROJECTS = ['rocket', 'groot', 'common', 'atlas'];
const APPROVED_MAP_IDS = Object.freeze([
  "ct_cb94ddc80fcc",
  "ct_dbdb3bfb853f",
  "ct_fe8b4096a9fc",
  "ct_fffc1bcbb1b4",
  "ct_fffc3a47d745",
  "ct_dae0ba8ea6a1",
  "ct_25f518f997ed",
  "ct_3a136bb619e7",
  "ct_f84ef3f84057",
  "ct_1d754b2e1d9a",
  "ct_059e4592e468",
  "ct_6a780b17565f",
  "ct_cad334eac1ec",
  "ct_d27051a8d229",
  "ct_b143cbbbadf0",
  "ct_72060c40bad6",
  "ct_bf4ee8496751",
  "ct_4a34bb9a96a2",
  "ct_e53e0d00b4b0",
  "ct_55896d52c4bb",
  "ct_b08be4e59fc1",
  "ct_97db98857fef",
  "ct_2f749547166e",
  "ct_edbd54e5c4c5",
  "ct_f4d17937985e",
  "ct_7628a34cf1fb",
  "ct_3a266bcf7b09",
  "ct_3c49901277f1",
  "ct_efd8daa64149",
  "ct_12adc066e403",
  "ct_2701f6312c23",
  "ct_b50daf087d0b",
  "ct_3df0f17526fe",
  "ct_5a43bb8075c9",
  "ct_ed1039a27eeb",
  "ct_0f4ca6391f40",
  "ct_451a9cf6ecfa",
  "ct_e08055b5eb8f",
  "ct_4410f39138e2",
  "ct_615ae9f7c81e",
  "ct_6d1c3eb8b880",
  "ct_6a07f1cb98f3",
  "ct_fbeed0274bad",
  "ct_8f7f322a6be7",
  "ct_7cb60cb31763",
  "ct_0e859f94f4b9",
  "ct_abb3e5517751",
  "ct_dc65dc2a71aa",
  "ct_872c476ba8b1",
  "ct_ff9292a8862d",
  "ct_e915627319d6"
]);
const APPROVED_PLACE_IDS = Object.freeze([
  "pl_b02668b8702f",
  "pl_e591ec3f2052",
  "pl_fafa0d500bca",
  "pl_eb4f72bfb7a8",
  "pl_741225b5e2b5",
  "pl_70bcf64192e8",
  "pl_00cf2870f81e",
  "pl_62a76e46ed0f",
  "pl_5b7c71862a32",
  "pl_a33ddb7b8510",
  "pl_b4f92b5b3544",
  "pl_c58bed59c3a5",
  "pl_c0138eabfb2c",
  "horizon-condition-1",
  "horizon-condition-2",
  "horizon-condition-3",
  "horizon-condition-4",
  "clock-capability",
  "clock-physical",
  "clock-society",
  "pl_24173582ec7a",
  "pl_733ab0fb865d",
  "pl_d22facea740c",
  "pl_f7476857f05f",
  "pl_eb68f2c6f66d",
  "pl_c9b2366868f2",
  "pl_c4d8c653205b",
  "pl_b926085c0810",
  "pl_b40426eb1052",
  "pl_630db00c2ff7",
  "pl_bbc94a22312b",
  "pl_85c13e74df90",
  "pl_552131f49d63",
  "pl_d75b56494d08",
  "pl_43918f761413",
  "pl_88446a5c71ba",
  "pl_db4b08d12e9e",
  "atlas-model-rocket",
  "atlas-model-groot",
  "atlas-model-common",
  "atlas-model-atlas"
]);
const APPROVED_CONTAINMENT = Object.freeze([
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_fe8b4096a9fc",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fe8b4096a9fc",
    "targetId": "ct_dbdb3bfb853f",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dbdb3bfb853f",
    "targetId": "ct_cb94ddc80fcc",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_25f518f997ed",
    "relation": "contains"
  },
  {
    "sourceId": "ct_25f518f997ed",
    "targetId": "ct_dae0ba8ea6a1",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_fffc3a47d745",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_3a136bb619e7",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_f84ef3f84057",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_1d754b2e1d9a",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_059e4592e468",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_6a780b17565f",
    "relation": "contains"
  },
  {
    "sourceId": "ct_dae0ba8ea6a1",
    "targetId": "ct_cad334eac1ec",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_d27051a8d229",
    "relation": "contains"
  },
  {
    "sourceId": "ct_d27051a8d229",
    "targetId": "ct_72060c40bad6",
    "relation": "contains"
  },
  {
    "sourceId": "ct_72060c40bad6",
    "targetId": "ct_b143cbbbadf0",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_4a34bb9a96a2",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4a34bb9a96a2",
    "targetId": "ct_bf4ee8496751",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_b08be4e59fc1",
    "relation": "contains"
  },
  {
    "sourceId": "ct_b08be4e59fc1",
    "targetId": "ct_55896d52c4bb",
    "relation": "contains"
  },
  {
    "sourceId": "ct_55896d52c4bb",
    "targetId": "ct_e53e0d00b4b0",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4a34bb9a96a2",
    "targetId": "ct_97db98857fef",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4a34bb9a96a2",
    "targetId": "ct_2f749547166e",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4a34bb9a96a2",
    "targetId": "ct_edbd54e5c4c5",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4a34bb9a96a2",
    "targetId": "ct_f4d17937985e",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_3c49901277f1",
    "relation": "contains"
  },
  {
    "sourceId": "ct_3c49901277f1",
    "targetId": "ct_3a266bcf7b09",
    "relation": "contains"
  },
  {
    "sourceId": "ct_3a266bcf7b09",
    "targetId": "ct_7628a34cf1fb",
    "relation": "contains"
  },
  {
    "sourceId": "ct_25f518f997ed",
    "targetId": "ct_efd8daa64149",
    "relation": "contains"
  },
  {
    "sourceId": "ct_25f518f997ed",
    "targetId": "ct_2701f6312c23",
    "relation": "contains"
  },
  {
    "sourceId": "ct_2701f6312c23",
    "targetId": "ct_12adc066e403",
    "relation": "contains"
  },
  {
    "sourceId": "ct_2701f6312c23",
    "targetId": "ct_5a43bb8075c9",
    "relation": "contains"
  },
  {
    "sourceId": "ct_5a43bb8075c9",
    "targetId": "ct_3df0f17526fe",
    "relation": "contains"
  },
  {
    "sourceId": "ct_3df0f17526fe",
    "targetId": "ct_b50daf087d0b",
    "relation": "contains"
  },
  {
    "sourceId": "ct_3df0f17526fe",
    "targetId": "ct_ed1039a27eeb",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fffc1bcbb1b4",
    "targetId": "ct_e08055b5eb8f",
    "relation": "contains"
  },
  {
    "sourceId": "ct_e08055b5eb8f",
    "targetId": "ct_451a9cf6ecfa",
    "relation": "contains"
  },
  {
    "sourceId": "ct_451a9cf6ecfa",
    "targetId": "ct_0f4ca6391f40",
    "relation": "contains"
  },
  {
    "sourceId": "ct_e08055b5eb8f",
    "targetId": "ct_4410f39138e2",
    "relation": "contains"
  },
  {
    "sourceId": "ct_4410f39138e2",
    "targetId": "ct_615ae9f7c81e",
    "relation": "contains"
  },
  {
    "sourceId": "ct_72060c40bad6",
    "targetId": "ct_6d1c3eb8b880",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6d1c3eb8b880",
    "targetId": "ct_6a07f1cb98f3",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6d1c3eb8b880",
    "targetId": "ct_fbeed0274bad",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6d1c3eb8b880",
    "targetId": "ct_8f7f322a6be7",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6a07f1cb98f3",
    "targetId": "ct_7cb60cb31763",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6a07f1cb98f3",
    "targetId": "ct_0e859f94f4b9",
    "relation": "contains"
  },
  {
    "sourceId": "ct_6a07f1cb98f3",
    "targetId": "ct_abb3e5517751",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fbeed0274bad",
    "targetId": "ct_dc65dc2a71aa",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fbeed0274bad",
    "targetId": "ct_872c476ba8b1",
    "relation": "contains"
  },
  {
    "sourceId": "ct_fbeed0274bad",
    "targetId": "ct_ff9292a8862d",
    "relation": "contains"
  },
  {
    "sourceId": "ct_8f7f322a6be7",
    "targetId": "ct_e915627319d6",
    "relation": "contains"
  }
]);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Approved r4.4 map cameras include the full coastline, props and safe border.
// These extents are independent from each terrain extent.
const MAP_CAMERA_EXTENTS = Object.freeze({ rocket: 43, groot: 40, common: 38, atlas: 35 });
const projectFor = id => id === 'atlas' ? 'atlas' : /^(rocket(?:-|$)|desk-|horizon-)/u.test(id) ? 'rocket' : /^groot(?:-|$)/u.test(id) ? 'groot' : 'common';

export function validateSpatial(data, map, content, evidence, { privatePatterns = [] } = {}) {
  const issues = [];
  const issue = (path, message) => issues.push({ path, message });
  function shape(v, fields, path) {
    if (!obj(v)) { issue(path, 'Expected public object.'); return false; }
    for (const k of Object.keys(v)) if (!fields.includes(k)) issue(`${path}.[unapproved-field]`, 'Field is outside the public spatial schema.');
    return true;
  }
  function array(v, path) { if (!Array.isArray(v)) { issue(path, 'Expected array.'); return []; } return v; }
  function vector(v, n, path) { if (!Array.isArray(v) || v.length !== n || !v.every(finite)) issue(path, 'Invalid finite coordinate vector.'); }
  function unique(items, path) {
    const ids = new Set();
    for (const item of items) { if (!obj(item) || typeof item.id !== 'string' || ids.has(item.id)) issue(path, 'Missing or duplicate identity.'); ids.add(item?.id); }
    return ids;
  }
  function scan(v, path) {
    if (typeof v === 'string') {
      let normalized = v.normalize('NFKC');
      try { normalized += `\n${decodeURIComponent(v)}`; } catch { /* Literal percent signs. */ }
      if (/(?:[a-z][a-z\d+.-]*:\/\/|\bmailto:|\bdata:|\/Users\/|\/home\/|\/private\/|[a-z]:\\|\[\[|\b(?:source_path|snapshot_path|canonical_path|raw_source|source_sha256|char_start|char_end)\b)/iu.test(normalized)) issue(path, 'Private provenance, external URL or raw source is not public spatial content.');
      for (const p of privatePatterns) if (p.expression.test(normalized)) issue(path, `Private publication rule matched (${p.id}).`);
    } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
    else if (obj(v)) Object.values(v).forEach((x, i) => scan(x, `${path}[field-${i}]`));
  }
  const nodes = new Map(content.nodes.map(n => [n.id, n]));
  const evidenceIds = new Set(evidence.records.map(e => e.id));
  shape(data, ['schemaVersion', 'islands'], 'spatial');
  shape(map, ['schemaVersion', 'language', 'readingNote', 'entries', 'containmentEdges', 'editorialConnections'], 'map');
  const islands = array(data.islands, 'spatial.islands');
  if (!same(islands.map(i => i.id), PROJECTS)) issue('spatial.islands', 'Exactly four approved islands in reading order are required.');
  const objects = islands.flatMap(i => [...(i.places ?? []), ...(i.subInteractions ?? [])]);
  const objectIds = unique(objects, 'spatial.objects');
  if (objectIds.size !== APPROVED_PLACE_IDS.length || APPROVED_PLACE_IDS.some(id => !objectIds.has(id))) issue('spatial.objects', 'Places differ from the reviewed identity allowlist.');
  if (objects.length !== 41 || islands.reduce((n, i) => n + (i.places?.length ?? 0), 0) !== 30) issue('spatial.objects', 'Expected 30 places and 11 subinteractions.');
  const covered = new Set();
  let assetCount = 0;
  for (const [ii, island] of islands.entries()) {
    const path = `spatial.islands[${ii}]`;
    shape(island, ['id','label','coast','groundY','entry','extent','entryCamera','modelUrl','collisionUrl','mapImage','mapBounds','limits','assets','places','subInteractions','paths','reservedFootprints','shoreline'], path);
    for (const [key, expected] of [['modelUrl', `assets/atlas-v81-${island.id}.glb`], ['collisionUrl', `assets/collision/${island.id}.json`], ['mapImage', `assets/maps/${island.id}.webp`]]) if (island[key] !== expected) issue(`${path}.${key}`, 'Asset URL differs from the registered island contract.');
    vector(island.entry, 3, `${path}.entry`);
    if (island.groundY !== 2.4 || !finite(island.extent) || island.extent <= 0) issue(path, 'Invalid ground level or extent.');
    for (const [i, point] of array(island.coast, `${path}.coast`).entries()) vector(point, 2, `${path}.coast[${i}]`);
    if (island.coast?.length < 3) issue(`${path}.coast`, 'Shoreline polygon is incomplete.');
    shape(island.mapBounds, ['minX','maxX','minZ','maxZ'], `${path}.mapBounds`);
    const mapExtent = MAP_CAMERA_EXTENTS[island.id];
    if (!same(island.mapBounds, {minX:-mapExtent,maxX:mapExtent,minZ:-mapExtent,maxZ:mapExtent})) issue(`${path}.mapBounds`, 'Map projection must match the reviewed orthographic camera extent.');
    const pose = (p, at) => { shape(p, ['position','target','fovDegrees'], at); vector(p?.position,3,`${at}.position`);vector(p?.target,3,`${at}.target`);if (!finite(p?.fovDegrees) || p.fovDegrees <= 0 || p.fovDegrees >= 180) issue(at,'Invalid camera field of view.'); };
    pose(island.entryCamera,`${path}.entryCamera`);
    shape(island.limits,['polarAngleRadians','distanceRangeMetres','minEyeY','panInset','groundClearance'],`${path}.limits`);
    vector(island.limits?.polarAngleRadians,2,`${path}.limits.polarAngleRadians`);vector(island.limits?.distanceRangeMetres,2,`${path}.limits.distanceRangeMetres`);
    if (island.limits?.minEyeY < island.groundY + island.limits?.groundClearance) issue(`${path}.limits`,'Camera floor intersects terrain.');
    const assets=array(island.assets,`${path}.assets`);assetCount+=assets.length;const assetIds=unique(assets,`${path}.assets`);
    for(const a of assets){
      shape(a,['id','kitId','variantId','origin','rotationYDegrees','geometrySize','foundationTopY','worldAssemblyBounds','reservedFootprint'],`${path}.asset`);
      for(const key of ['origin','geometrySize'])vector(a[key],3,`${path}.asset.${key}`);
      if(a.foundationTopY!==island.groundY||a.origin?.[1]!==island.groundY||!finite(a.rotationYDegrees))issue(`${path}.asset`,'Asset foundation or rotation differs from the shared ground contract.');
      shape(a.worldAssemblyBounds,['min','max'],`${path}.asset.bounds`);vector(a.worldAssemblyBounds?.min,3,`${path}.asset.bounds.min`);vector(a.worldAssemblyBounds?.max,3,`${path}.asset.bounds.max`);
      for(const p of array(a.reservedFootprint,`${path}.asset.footprint`))vector(p,2,`${path}.asset.footprint`);
    }
    const localObjects=[...(island.places??[]),...(island.subInteractions??[])];const localIds=new Set(localObjects.map(p=>p.id));
    for(const p of localObjects){
      const pp=`${path}.object`;
      shape(p,['id','islandId','label','kind','question','contentIds','parentId','assetId','interactionAssetId','physicalPartIds','assetOrigin','foundationTopY','interactionAnchor','cameraLookAt','viewingPosition','arrivalPose','actions','selectionProxy'],pp);
      if(p.islandId!==island.id||!['derived','guide'].includes(p.kind)||!assetIds.has(p.assetId)||!assetIds.has(p.interactionAssetId))issue(pp,'Object has an invalid island, kind or asset binding.');
      if(p.parentId&&!localIds.has(p.parentId))issue(pp,'Object parent is outside its island.');
      for(const key of ['assetOrigin','interactionAnchor','cameraLookAt','viewingPosition'])vector(p[key],3,`${pp}.${key}`);
      pose(p.arrivalPose,`${pp}.arrivalPose`);if(!same(p.arrivalPose?.target,p.cameraLookAt))issue(pp,'Arrival target differs from the authored focus.');
      if(!p.physicalPartIds?.length||p.physicalPartIds.some(id=>typeof id!=='string'||!id))issue(pp,'Physical part binding is missing.');
      for(const id of array(p.contentIds,`${pp}.contentIds`)){if(!nodes.has(id)||projectFor(id)!==island.id)issue(pp,'Object content is missing or belongs to a different island.');covered.add(id);}
      if(!p.contentIds?.length&&p.kind!=='guide')issue(pp,'A knowledge object needs readable content.');
      const s=p.selectionProxy;const allowed=s?.kind==='component'?['kind','partId','localPoint','worldPoint']:s?.kind==='disc'?['kind','partId','center','radius','normal']:['kind','partId','center','size'];shape(s,allowed,`${pp}.selectionProxy`);
      if(!['component','disc','box'].includes(s?.kind)||!p.physicalPartIds?.includes(s?.partId))issue(pp,'Selection proxy is not bound to a named physical part.');
      if(s?.kind==='component'){vector(s.localPoint,3,pp);vector(s.worldPoint,3,pp);if(!same(s.worldPoint,p.interactionAnchor))issue(pp,'Selection point differs from the interaction anchor.');}
      else {vector(s?.center,3,pp);if(!same(s?.center,p.interactionAnchor))issue(pp,'Selection center differs from the interaction anchor.');if(s?.kind==='disc'){vector(s.normal,3,pp);if(!finite(s.radius)||s.radius<=0)issue(pp,'Invalid selection disc.');}else vector(s?.size,3,pp);}
      for(const a of array(p.actions,`${pp}.actions`)){
        shape(a,['action','nodeId','label','view','projectId','relationMode','section'],`${pp}.action`);
        if(a.action==='open-reader'){
          if(!p.contentIds.includes(a.nodeId))issue(pp,'Reader action is not one of the object content bindings.');
          if(a.section){shape(a.section,['id','field','index'],`${pp}.section`);if(a.section.field!=='paragraphs'||!Number.isInteger(a.section.index)||!nodes.get(a.nodeId)?.paragraphs[a.section.index])issue(pp,'Reader section does not exist.');}
        }else if(a.action==='open-map'){if(!['islands','vault'].includes(a.view)||(a.projectId&&!PROJECTS.includes(a.projectId))||(a.relationMode&&!['containment','relationships'].includes(a.relationMode)))issue(pp,'Map action has an invalid view.');}
        else if(!['open-camera-help','open-reading-help'].includes(a.action))issue(pp,'Unknown guide action.');
      }
    }
    for(const p of array(island.paths,`${path}.paths`)){shape(p,['id','width','requiredObstacleClearance','points'],`${path}.path`);if(!finite(p.width)||p.width<=0||!finite(p.requiredObstacleClearance))issue(path,'Invalid route width.');for(const point of array(p.points,path))vector(point,3,path);}
    // Authored viewing routes are connected by exact shared vertices. This is
    // separate from knowledge relationships and does not prove mesh collision.
    const pointKey = point => JSON.stringify(point);
    const reached = new Set([pointKey(island.entry)]);
    const pending = new Set((island.paths ?? []).map(p => p.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of island.paths ?? []) if (pending.has(p.id) && p.points?.some(point => reached.has(pointKey(point)))) {
        p.points.forEach(point => reached.add(pointKey(point))); pending.delete(p.id); changed = true;
      }
    }
    if (pending.size) issue(path, 'A viewing route is disconnected from the island entry.');
    for (const p of localObjects) if (!reached.has(pointKey(p.viewingPosition))) issue(path, 'An object viewing station is unreachable from the authored path network.');
    for(const f of array(island.reservedFootprints,path)){shape(f,['assetId','points'],`${path}.reservedFootprint`);if(!same(f.points,assets.find(a=>a.id===f.assetId)?.reservedFootprint))issue(path,'Pan reserve differs from the asset footprint.');}
    const shore=island.shoreline;shape(shore,['waterY','crestY','closed','defaultProfile','segmentOverrides','dock','foam'],`${path}.shoreline`);
    if(shore?.waterY!==0||shore?.crestY!==island.groundY||shore?.closed!==true)issue(path,'Shoreline and ground contract differ.');
    shape(shore?.dock,['segmentIndex','waterlineAnchor','yawRadians','pierExclusionXZ'],`${path}.dock`);
    vector(shore?.dock?.waterlineAnchor,3,path);for(const point of array(shore?.dock?.pierExclusionXZ,path))vector(point,2,path);
    for(const override of array(shore?.segmentOverrides,path))shape(override,['index','profile','foamWidth','foamOpacity'],`${path}.shoreline.override`);
    shape(shore?.foam,['widthByProfile','opacityByProfile','distanceNoiseAmplitude','noiseWavelengthMetres','offsetY','noInlandOutline'],`${path}.foam`);
    shape(shore?.foam?.widthByProfile,['rock-cliff','quay','beach'],`${path}.foam.width`);shape(shore?.foam?.opacityByProfile,['rock-cliff','quay','beach'],`${path}.foam.opacity`);
  }
  if(assetCount!==36)issue('spatial.assets','Expected 36 explicit asset instances.');
  for(const id of nodes.keys())if(!covered.has(id))issue('spatial.coverage','An approved story is unreachable from the island objects.');
  const entries=array(map.entries,'map.entries');const entryIds=unique(entries,'map.entries');const entryById=new Map(entries.map(e=>[e.id,e]));
  if(entries.length!==51 || entryIds.size!==APPROVED_MAP_IDS.length || APPROVED_MAP_IDS.some(id=>!entryIds.has(id)))issue('map.entries','Expected the 51 reviewed location identities.');
  const edgeKey=e=>JSON.stringify([e.sourceId,e.targetId,e.relation]);
  if(!same((map.containmentEdges??[]).map(edgeKey).sort(), APPROVED_CONTAINMENT.map(edgeKey).sort())) issue('map.containmentEdges','Containment differs from the reviewed actual-location pairs.');
  for(const e of entries){shape(e,['id','kind','label','labelEdited','contentNodeIds','evidenceIds','islandIds'],'map.entry');if(!['folder','document'].includes(e.kind)||e.labelEdited!==true)issue('map.entry','Map entry must identify a real folder or document with an edited display label.');if(e.islandIds?.some(id=>!PROJECTS.includes(id)||id==='atlas'))issue('map.entry','An editorial guide cannot become a real Vault folder.');for(const id of array(e.contentNodeIds,'map.entry.content'))if(!nodes.has(id))issue('map.entry','Unapproved content reference.');for(const id of array(e.evidenceIds,'map.entry.evidence'))if(!evidenceIds.has(id))issue('map.entry','Unapproved evidence reference.');}
  const parents=new Map();
  for(const e of array(map.containmentEdges,'map.containmentEdges')){shape(e,['sourceId','targetId','relation'],'map.edge');if(!entryIds.has(e.sourceId)||!entryIds.has(e.targetId)||e.relation!=='contains'||entryById.get(e.sourceId)?.kind!=='folder')issue('map.edge','Containment requires a real folder parent and known child.');if(parents.has(e.targetId))issue('map.edge','A real location cannot have two containment parents.');parents.set(e.targetId,e.sourceId);}
  for(const id of entryIds){let next=id;const seen=new Set();while(parents.has(next)){if(seen.has(next)){issue('map.edges','Containment cycle detected.');break;}seen.add(next);next=parents.get(next);}}
  for(const e of array(map.editorialConnections,'map.editorialConnections')){shape(e,['sourceId','targetId','relation','label','kind','sourceContentId','targetContentId'],'map.editorial');if(e.kind!=='derived'||!objectIds.has(e.sourceId)||!objectIds.has(e.targetId)||!nodes.has(e.sourceContentId)||!nodes.has(e.targetContentId))issue('map.editorial','Editorial relationship is not bound to approved places and content.');}
  scan(data,'spatial');scan(map,'map');
  return {valid:issues.length===0,issues};
}

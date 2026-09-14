import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export type InstanceSelection={interactionIds?:string[];atlasIslandId?:string;atlasInstanceId?:string};
/** Batch repeated, authored decorations. Semantic selection stays per instance. */
export function batchDecorations(root:THREE.Group){
  root.updateMatrixWorld(true);
  // glTF multi-material nodes become Groups. Carry authored semantics to their primitives.
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(let parent=object.parent;parent&&parent!==root;parent=parent.parent){
      for(const key of ['atlasDecoration','atlasVegetation','interactionIds','atlasInstanceId','atlasPartId','atlasIslandId','atlasOverviewIsland']){
        if(object.userData[key]===undefined&&parent.userData[key]!==undefined)object.userData[key]=parent.userData[key];
      }
    }
  });
  const groups=new Map<string,THREE.Mesh[]>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||object instanceof THREE.InstancedMesh)return;
    if(!object.userData.atlasDecoration&&!object.userData.atlasVegetation)return;
    let island='';for(let p:THREE.Object3D|null=object;p;p=p.parent)if(p.userData.atlasIslandId){island=p.userData.atlasIslandId;break;}
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const key=[island,object.geometry.uuid,...materials.map(m=>m.uuid),object.userData.atlasVegetation??'prop'].join(':');
    const group=groups.get(key)??[];group.push(object);groups.set(key,group);
  });
  let batches=0,instances=0;
  const inverse=root.matrixWorld.clone().invert();
  for(const originals of groups.values()){
    if(originals.length<3)continue;
    const first=originals[0],batch=new THREE.InstancedMesh(first.geometry,first.material,originals.length);
    batch.name='instances-'+first.name;batch.castShadow=true;batch.receiveShadow=true;
    const selections:InstanceSelection[]=[];
    originals.forEach((object,index)=>{
      batch.setMatrixAt(index,inverse.clone().multiply(object.matrixWorld));
      let island:string|undefined;for(let p:THREE.Object3D|null=object;p;p=p.parent)if(p.userData.atlasIslandId){island=p.userData.atlasIslandId;break;}
      selections.push({interactionIds:object.userData.interactionIds,atlasIslandId:island,atlasInstanceId:object.userData.atlasInstanceId});
      object.removeFromParent();
    });
    batch.userData.instanceSelections=selections;batch.userData.atlasVegetation=first.userData.atlasVegetation;batch.userData.atlasOverviewIsland=first.userData.atlasOverviewIsland;
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);batches++;instances+=originals.length;
  }
  const staticGroups=new Map<string,THREE.Mesh[]>(),oldGeometry=new Set<THREE.BufferGeometry>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||object instanceof THREE.InstancedMesh||Array.isArray(object.material)||object.geometry.morphAttributes.position)return;
    for(let p:THREE.Object3D|null=object;p;p=p.parent)if(p.userData.atlasMotion||p.userData.atlasFoliage)return;
    const ids=[...(object.userData.interactionIds??[])].sort(),attributes=(Object.entries(object.geometry.attributes) as [string,THREE.BufferAttribute][]).map(([k,v])=>`${k}:${v.itemSize}:${v.normalized}`).sort();
    const key=[object.userData.atlasIslandId??'',object.material.uuid,JSON.stringify(ids),attributes.join(','),object.userData.atlasVegetation??''].join('|');
    const group=staticGroups.get(key)??[];group.push(object);staticGroups.set(key,group);
  });
  let merged=0;
  for(const originals of staticGroups.values()){
    if(originals.length<3)continue;
    const clones=originals.map(o=>{
      const g=o.geometry.clone();
      // Quantized glTF positions are normalized integers. Baking a world transform into
      // that storage clamps translated vertices to [-1, 1]; expand before transforming.
      const position=g.getAttribute('position'),expanded=new Float32Array(position.count*3);
      for(let i=0;i<position.count;i++){expanded[i*3]=position.getX(i);expanded[i*3+1]=position.getY(i);expanded[i*3+2]=position.getZ(i);}
      g.setAttribute('position',new THREE.BufferAttribute(expanded,3));
      g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));return g;
    });
    const geometry=mergeGeometries(clones,false);clones.forEach(g=>g.dispose());if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,originals[0].material);mesh.name='static-batch-'+merged;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={...originals[0].userData,atlasMergedParts:originals.length};
    originals.forEach(o=>{oldGeometry.add(o.geometry);o.removeFromParent();});root.add(mesh);merged++;
  }
  const retained=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)retained.add(o.geometry);});for(const g of oldGeometry)if(!retained.has(g))g.dispose();
  root.userData.batching={batches,instances,staticBatches:merged};
  return {batches,instances};
}

export function applyVegetationWind(root:THREE.Group,time:{value:number}){
  const seen=new Set<THREE.Material>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!object.userData.atlasVegetation)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(seen.has(material)||material.userData.atlasWindShader)return;seen.add(material);material.userData.atlasWindShader=true;
      const previous=material.onBeforeCompile;
      material.onBeforeCompile=(shader:Parameters<THREE.Material["onBeforeCompile"]>[0],renderer:THREE.WebGLRenderer)=>{
        previous.call(material,shader,renderer);shader.uniforms.atlasWindTime=time;
        shader.vertexShader='uniform float atlasWindTime;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float atlasPhase=0.;
          #ifdef USE_INSTANCING
            atlasPhase=instanceMatrix[3].x*.37+instanceMatrix[3].z*.29;
          #endif
          float atlasBend=pow(max(position.y,0.),1.25)*.008;
          transformed.x+=sin(atlasWindTime*.85+position.y*.65+atlasPhase)*atlasBend;
          transformed.z+=cos(atlasWindTime*.67+position.y*.44+atlasPhase)*atlasBend*.55;
        `);
      };
      const cacheKey=material.customProgramCacheKey.bind(material);material.customProgramCacheKey=()=> cacheKey()+'-atlas-vegetation-wind-v83';material.needsUpdate=true;
    }
  });
}

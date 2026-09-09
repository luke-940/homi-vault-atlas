import * as THREE from 'three';
export type InstanceSelection={interactionIds?:string[];atlasIslandId?:string;atlasInstanceId?:string};
/** Batch repeated, authored decorations. Semantic selection stays per instance. */
export function batchDecorations(root:THREE.Group){
  root.updateMatrixWorld(true);
  // glTF multi-material nodes become Groups. Carry authored semantics to their primitives.
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(let parent=object.parent;parent&&parent!==root;parent=parent.parent){
      for(const key of ['atlasDecoration','atlasVegetation','interactionIds','atlasInstanceId','atlasPartId']){
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
    batch.userData.instanceSelections=selections;batch.userData.atlasVegetation=first.userData.atlasVegetation;
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);batches++;instances+=originals.length;
  }
  root.userData.batching={batches,instances};
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
      material.customProgramCacheKey=()=> 'atlas-vegetation-wind-v82';material.needsUpdate=true;
    }
  });
}

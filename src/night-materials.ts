import * as THREE from 'three';
/** Match the DCC's leaf grade while preserving the original alpha and normal textures. */
export function treatNightMaterials(root:THREE.Object3D){
 const seen=new Set<THREE.Material>();
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  object.castShadow=true;object.receiveShadow=true;
  for(const material of Array.isArray(object.material)?object.material:[object.material]){
   if(seen.has(material)||!(material instanceof THREE.MeshStandardMaterial))continue;seen.add(material);
   const tint=material.userData.atlasLeafTint as number[]|undefined;
   if(tint?.length===3&&!material.userData.atlasNightGraded){
    const prior=material.onBeforeCompile;material.color.set(0xffffff);material.roughness=.78;
    material.onBeforeCompile=(shader,renderer)=>{prior.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n diffuseColor.rgb=vec3(${tint.map(n=>n.toFixed(5)).join(',')})*dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));`);};
    material.customProgramCacheKey=()=>`atlas-night-leaf-${tint.join('-')}`;material.userData.atlasNightGraded=true;material.needsUpdate=true;
   }
   if(material.name.includes('wooden_lantern_01')&&material.name.includes('glass')){
    material.opacity=.14;material.transparent=true;material.depthWrite=false;material.metalness=0;material.roughness=.16;
   }
  }
 });
}

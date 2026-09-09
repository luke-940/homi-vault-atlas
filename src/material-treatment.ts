import * as THREE from "three";

export const BARK_TREATMENT_VERSION="atlas-bark-grey-brown-r4-research";
export const CLIFF_TREATMENT_VERSION="atlas-cliff-warm-limestone-r2";

/** The map and explorer share albedo-only treatments of source bark and cliff textures. */
export function applyAtlasMaterialTreatment(material:THREE.Material){
  if(!(material instanceof THREE.MeshStandardMaterial)||!["m_bark","m_research_bark","m_cliff"].includes(material.name))return;
  const researchBark=material.name==="m_research_bark";
  const bark=material.name==="m_bark"||researchBark;
  if(!researchBark)material.color.setRGB(1,1,1);
  material.onBeforeCompile=shader=>{
    const chunk=THREE.ShaderChunk.map_fragment;
    const sample="diffuseColor *= sampledDiffuseColor;";
    if(!chunk.includes(sample)||!shader.fragmentShader.includes("#include <map_fragment>"))throw new Error("Atlas texture shader contract changed");
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",chunk.replace(sample,bark?`
      float barkLuma=dot(sampledDiffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
      vec3 barkAlbedo=mix(vec3(barkLuma),sampledDiffuseColor.rgb,0.12)*${(researchBark?20.0:6.8).toFixed(1)}*vec3(1.08,1.0,0.88);
      vec3 barkHighlight=max(barkAlbedo-vec3(0.7),vec3(0.0));
      sampledDiffuseColor.rgb=min(barkAlbedo,vec3(0.7))+barkHighlight/(vec3(1.0)+barkHighlight/0.3);
      diffuseColor *= sampledDiffuseColor;
    `:`
      float cliffLuma=dot(sampledDiffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
      vec3 cliffAlbedo=mix(vec3(cliffLuma),sampledDiffuseColor.rgb,0.18)*1.75*vec3(1.08,1.0,0.9);
      vec3 cliffHighlight=max(cliffAlbedo-vec3(0.7),vec3(0.0));
      sampledDiffuseColor.rgb=min(cliffAlbedo,vec3(0.7))+cliffHighlight/(vec3(1.0)+cliffHighlight/0.3);
      diffuseColor *= sampledDiffuseColor;
    `));
  };
  material.customProgramCacheKey=()=>bark?BARK_TREATMENT_VERSION+(researchBark?"-research":"-tree"):CLIFF_TREATMENT_VERSION;
  material.needsUpdate=true;
}

export function applyAtlasSceneMaterials(root:THREE.Object3D){
  const visited=new Set<THREE.Material>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(visited.has(material))continue;
      visited.add(material);applyAtlasMaterialTreatment(material);
    }
  });
}

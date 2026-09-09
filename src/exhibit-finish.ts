import * as THREE from 'three';

/** Put the working map tables in the open forecourt where the visitor can see them. */
export function finishAtlasWorkshop(root:THREE.Group){
 if(!root.getObjectByName('atlas-cartography-pavilion')||root.userData.workshopFinished)return;
 const isDeskPart=(name:string)=>/^atlas-(drafting-|grid-|compass-arm-)/.test(name);
 root.traverse(object=>{if(isDeskPart(object.name)&&!isDeskPart(object.parent?.name??''))object.position.z+=9;});
 root.userData.workshopFinished=true;
}

/** The overview cabinet contains miniature copies of the seven real instruments.
 * It reuses shipped geometry/materials. Close-range detail is absent in the world
 * overview and hidden below its readable screen size; no extra download is needed.
 */
export function finishResearchCabinet(root:THREE.Group){
 const cabinet=root.getObjectByName('rocket-seven-questions-display');
 if(!cabinet||root.getObjectByName('seven-instrument-miniatures'))return;
 cabinet.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||Array.isArray(object.material)||!object.material.name.startsWith('m_ivory'))return;
  const backing=object.material.clone() as THREE.MeshStandardMaterial;backing.color.set('#285452');backing.roughness=.92;object.material=backing;
 });
 const lod=new THREE.Group();lod.name='seven-instrument-miniatures';lod.userData={atlasLodRoot:true,atlasLodRadius:2.1};
 const detail=new THREE.Group(),distant=new THREE.Group();detail.userData.atlasLodLevel=0;distant.userData.atlasLodLevel=1;lod.add(detail,distant);
 for(let i=1;i<=7;i++){
  const source=root.getObjectByName(`rocket-lens-${i}`);if(!source)continue;
  const miniature=source.clone(true);miniature.name=`cabinet-instrument-${i}`;miniature.position.set(0,0,0);miniature.updateMatrixWorld(true);
  const footings:THREE.Object3D[]=[];miniature.traverse(object=>{if(/plinth|selection-plaque|__m_stone/.test(object.name))footings.push(object);});footings.forEach(object=>object.removeFromParent());
  miniature.traverse(object=>{
   object.userData={interactionIds:['pl_e591ec3f2052']};
   if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}
  });
  const box=new THREE.Box3().setFromObject(miniature),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=Math.min(.28/size.x,.64/size.y,.3/size.z);
  const holder=new THREE.Group();holder.position.set((i-4)*.39,1.27,.25);
  miniature.scale.multiplyScalar(scale);miniature.position.copy(center).multiplyScalar(-scale);holder.add(miniature);detail.add(holder);
 }
 // The cabinet's authored local transform keeps the array aligned with its panels.
 cabinet.add(lod);root.userData.cabinetMiniatures=detail.children.length;
}

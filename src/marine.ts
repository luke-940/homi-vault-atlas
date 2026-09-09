import * as THREE from 'three';
import {islands,islandById} from './islands';
import type {ProjectId} from './content';
const anchors:Record<ProjectId,[number,number]>={rocket:[-8,-4],groot:[6,-1],common:[-7,7],atlas:[2,7]};
const scales:Record<ProjectId,number>={rocket:.12,groot:.13,common:.12,atlas:.12};
/** Slow scenery, deliberately separate from content and knowledge relations. */
export class AtlasMarine {
  readonly root=new THREE.Group();
  readonly vessel=new THREE.Vector4();
  private ship:THREE.Object3D;private whale:THREE.Object3D;
  private boats:THREE.Object3D[]=[];private birds:THREE.Object3D[]=[];
  private route=new THREE.CatmullRomCurve3([[-14,-8],[-1,-13],[12,-8],[15,4],[10,15],[-3,16],[-15,10],[-17,0]].map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
  private sceneId:'world'|ProjectId='world';
  constructor(source:THREE.Group){
    const clone=(name:string)=>{const template=source.getObjectByName(name);if(!template)throw new Error('Marine source is incomplete.');return template.clone(true);};
    this.root.name='atlas-marine-scenery';this.ship=clone('marine-ship');this.whale=clone('marine-whale');this.root.add(this.ship,this.whale);
    for(let i=0;i<4;i++){const boat=clone('marine-rowboat');this.boats.push(boat);this.root.add(boat);}
    for(let i=0;i<7;i++){const bird=clone('marine-gull');this.birds.push(bird);this.root.add(bird);}
    this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=true;}});
    this.setScene('world');
  }
  setScene(id:'world'|ProjectId){
    this.sceneId=id;const detail=id!=='world',scale=detail?1:.18;
    this.ship.scale.setScalar(scale);this.whale.scale.setScalar(scale);
    this.boats.forEach((boat,index)=>{
      const spec=detail?islandById.get(id)!:islands[index];boat.visible=!detail||index===0;if(!boat.visible)return;
      const d=spec.shoreline.dock.waterlineAnchor,radial=new THREE.Vector2(d[0],d[2]).normalize().multiplyScalar(2.4),s=detail?1:scales[spec.id],off=detail?[0,0]:anchors[spec.id];
      boat.position.set((d[0]+radial.x)*s+off[0],-.16*s,(d[2]+radial.y)*s+off[1]);boat.scale.setScalar(s);boat.rotation.y=-spec.shoreline.dock.yawRadians;
    });
    this.birds.forEach(b=>b.scale.setScalar(detail?.75:.11));this.update(0);
  }
  update(seconds:number){
    const detail=this.sceneId!=='world',scale=detail?1:.18;
    let position:THREE.Vector3,tangent:THREE.Vector3;
    if(detail){const angle=seconds/180*Math.PI*2;position=new THREE.Vector3(Math.cos(angle)*54,-.3,Math.sin(angle)*49);tangent=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle));}
    else{const t=(seconds/160)%1;position=this.route.getPointAt(t);tangent=this.route.getTangentAt(t);position.y=-.3*scale;}
    const yaw=Math.atan2(tangent.x,tangent.z)+Math.PI;
    this.ship.position.copy(position);this.ship.rotation.set(Math.sin(seconds*.8)*.012,yaw,Math.sin(seconds*.63)*.022);
    this.vessel.set(position.x,position.z,Math.atan2(tangent.x,tangent.z),scale);
    const q=seconds/65*Math.PI*2,phase=(seconds%50)/50,surface=phase<.38?Math.sin(phase/.38*Math.PI):0;
    this.whale.position.set((detail?46:10)+Math.cos(q)*(detail?7:3.9),(-2.2+surface*2.1)*scale,(detail?-24:-9.5)+Math.sin(q)*(detail?4:1.7));
    this.whale.rotation.set(Math.sin(q)*.04,-q+Math.PI/2,Math.sin(seconds*.7)*.025);
    this.whale.visible=phase<.48;
    this.birds.forEach((bird,index)=>{
      const angle=seconds*.022+index*.075,cx=detail?4:2,cz=detail?10:3,r=detail?22:9;
      bird.position.set(cx+Math.cos(angle)*r+index*(detail?.5:.1),(detail?13:3.2)+Math.sin(seconds*.6+index)*scale*.6,cz+Math.sin(angle)*r);
      bird.rotation.set(Math.sin(seconds*1.3+index)*.08,-angle+Math.PI/2,Math.sin(seconds*1.5+index)*.08);
    });
    this.boats.forEach((b,i)=>{b.rotation.z=Math.sin(seconds*.65+i)*.016;});
  }
}

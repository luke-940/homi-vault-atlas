import * as THREE from 'three';
import type { ProjectId } from './content';

export const WORLD_OFFSETS:Record<ProjectId,[number,number,number]>={rocket:[-60,0,-50],groot:[55,0,-30],common:[-55,0,55],atlas:[42,0,65]};
export const WORLD_BOUNDS={min:new THREE.Vector3(-235,.7,-230),max:new THREE.Vector3(235,180,230)};
export const MOON_DIRECTION=new THREE.Vector3(-.55,.75,-.4).normalize();
export const WIND=new THREE.Vector2(.86,.51).normalize();
// Direction, wavelength, amplitude, phase. Shared by the surface vertex shader and vessel motion.
export const SWELLS=[
 {direction:[.86,.51],length:33,amplitude:.36,phase:0},
 {direction:[.96,.28],length:18,amplitude:.17,phase:1.7},
 {direction:[.48,.88],length:9.8,amplitude:.085,phase:3.1},
 {direction:[-.25,.96],length:5.3,amplitude:.045,phase:.8},
];
export function waterHeight(x:number,z:number,time:number){
 let h=0;
 for(const wave of SWELLS){const k=2*Math.PI/wave.length;h+=wave.amplitude*Math.sin(k*(x*wave.direction[0]+z*wave.direction[1])-Math.sqrt(9.81*k)*time+wave.phase);}
 return h;
}
export function worldPoint(point:readonly number[],island:ProjectId){return new THREE.Vector3(point[0],point[1],point[2]).add(new THREE.Vector3(...WORLD_OFFSETS[island]));}
export function localPoint(point:THREE.Vector3,island:ProjectId){return point.clone().sub(new THREE.Vector3(...WORLD_OFFSETS[island]));}

/** Distant stars stay geometry, while the moon supplies a coherent reflection direction. */
export class NightSky {
 readonly root=new THREE.Group();
 private stars:THREE.Points;
 private moon:THREE.Mesh;
 constructor(){
  const coords:number[]=[],colors:number[]=[];let seed=830092;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1100;i++){
   const theta=random()*Math.PI*2,y=.08+random()*.92,r=Math.sqrt(1-y*y);coords.push(750*r*Math.cos(theta),750*y,750*r*Math.sin(theta));
   const intensity=.15+Math.pow(random(),3)*.8;colors.push(intensity*.8,intensity*.9,intensity);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  this.stars=new THREE.Points(geometry,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,fog:false}));this.stars.frustumCulled=false;this.root.add(this.stars);
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(5.2,24,16),new THREE.MeshBasicMaterial({color:'#e4e3cf',fog:false}));
  this.moon.position.copy(MOON_DIRECTION).multiplyScalar(650);this.root.add(this.moon);
 }
 update(camera:THREE.Camera){this.root.position.copy(camera.position);}
 dispose(){this.stars.geometry.dispose();(this.stars.material as THREE.Material).dispose();this.moon.geometry.dispose();(this.moon.material as THREE.Material).dispose();}
}

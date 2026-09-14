import * as THREE from 'three';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {waterHeight,WORLD_OFFSETS} from './environment';
import {islands} from './islands';
import type {ProjectId} from './content';
const TAU=Math.PI*2;
const smooth=(a:number,b:number,t:number)=>{const q=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return q*q*(3-2*q);};
/** Maritime scenery shares the ocean height; it does not encode knowledge relationships. */
export class AtlasMarine{
 readonly root=new THREE.Group();readonly vessel=new THREE.Vector4();
 private ship:THREE.Object3D;private whale:THREE.Object3D;private mixer:THREE.AnimationMixer;
 private birds:{root:THREE.Object3D;left:THREE.Object3D;right:THREE.Object3D;perch:THREE.Vector3;rest:number;flight:number;phase:number}[]=[];
 private lastTime=0;
 private beacon=new THREE.SpotLight('#f3d49d',1400,175,.045,.75,1);
 private beam:THREE.Mesh;
 private route=new THREE.CatmullRomCurve3([[-137,-75],[-24,-122],[100,-113],[166,-35],[137,91],[20,145],[-121,120],[-154,20]].map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
 private spray:THREE.Points;private sprayPositions=new Float32Array(48*3);
 constructor(source:THREE.Group,animations:THREE.AnimationClip[]){
  const find=(name:string)=>{const o=source.getObjectByName(name);if(!o)throw Error('Maritime model incomplete: '+name);return cloneSkinned(o);};
  this.root.name='atlas-night-marine';this.ship=new THREE.Group();this.ship.add(find('marine-ship'));this.whale=find('marine-whale');this.root.add(this.ship,this.whale);
  const lighthouse=find('marine-lighthouse');lighthouse.position.set(62,2.4,49);this.root.add(lighthouse);
  this.beacon.position.set(62,19.34,49);this.root.add(this.beacon,this.beacon.target);
  const beamGeometry=new THREE.ConeGeometry(7.7,170,32,1,true);beamGeometry.translate(0,-85,0);beamGeometry.rotateX(-Math.PI/2);
  this.beam=new THREE.Mesh(beamGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float d=clamp(p.z/170.,0.,1.);float edge=1.-smoothstep(.25,1.,length(p.xy)/max(.15,d*7.7));gl_FragColor=vec4(.78,.65,.40,(1.-d)*.017*(.35+.65*edge));}'}));
  this.beam.position.copy(this.beacon.position);this.root.add(this.beam);
  this.mixer=new THREE.AnimationMixer(this.whale);for(const clip of animations)if(clip.name.includes('WhaleSwim'))this.mixer.clipAction(clip).play();
  const rest=[38,53,47,61,43],duration=[10,14,17,11,15];
  for(let i=0;i<5;i++){
   const bird=find('marine-gull'),spec=islands[i%4],dock=spec.shoreline.dock.waterlineAnchor,off=WORLD_OFFSETS[spec.id];
   // Authored mooring post top is 1.35 m; the gull toe mesh reaches 0.138 m below its origin.
   const perch=new THREE.Vector3(dock[0]+off[0]+(i===4?-.65:0),1.488,dock[2]+off[2]+2.8+(i===4?.6:0));
   const post=find('marine-perch');post.position.copy(perch).setY(0);this.root.add(post);
   this.birds.push({root:bird,left:bird.getObjectByName('gull-wing-L')!,right:bird.getObjectByName('gull-wing-R')!,perch,rest:rest[i],flight:duration[i],phase:i*7.1});this.root.add(bird);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.sprayPositions,3));
  this.spray=new THREE.Points(geo,new THREE.PointsMaterial({color:'#b9cfda',size:.055,transparent:true,opacity:.45,depthWrite:false}));this.spray.frustumCulled=false;this.root.add(this.spray);
  this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=true;}});
  this.update(0);
 }
 setScene(_id:'world'|ProjectId){} // Continuous world: scenery never teleports or rescales at region boundaries.
 update(seconds:number){
  const dt=Math.min(.1,Math.max(0,seconds-this.lastTime));this.lastTime=seconds;this.mixer.update(dt);
  const beamAngle=seconds/32*TAU;this.beacon.target.position.copy(this.beacon.position).add(new THREE.Vector3(Math.sin(beamAngle)*170,-5,Math.cos(beamAngle)*170));this.beam.rotation.set(0,beamAngle,0);
  const phase=(seconds/360)%1,p=this.route.getPointAt(phase),tangent=this.route.getTangentAt(phase),yaw=Math.atan2(tangent.x,tangent.z);
  const h=waterHeight(p.x,p.z,seconds),forward=tangent.clone().setY(0).normalize(),side=new THREE.Vector3(forward.z,0,-forward.x);
  const pitch=Math.atan2(waterHeight(p.x+forward.x*4,p.z+forward.z*4,seconds)-waterHeight(p.x-forward.x*4,p.z-forward.z*4,seconds),8);
  const roll=Math.atan2(waterHeight(p.x+side.x,p.z+side.z,seconds)-waterHeight(p.x-side.x,p.z-side.z,seconds),2);
  this.ship.position.set(p.x,h-1.35,p.z);this.ship.rotation.set(-pitch,yaw,-roll*.6);this.vessel.set(p.x,p.z,yaw,1);
  const q=seconds/155*TAU,cycle=seconds%62,wx=144+Math.cos(q)*26,wz=-18+Math.sin(q)*42;
  const surface=smooth(24,35,cycle)*(1-smooth(42,58,cycle));
  this.whale.position.set(wx,waterHeight(wx,wz,seconds)-3.3+surface*2.5,wz);
  this.whale.rotation.set((smooth(24,31,cycle)-smooth(33,39,cycle))*.06-(smooth(43,49,cycle)-smooth(55,62,cycle))*.25,Math.atan2(-26*Math.sin(q),42*Math.cos(q)),Math.sin(seconds*.4)*.018);
  // Breath rises briefly from the two blowholes, then disperses. No constant fountain.
  const breath=smooth(34,35,cycle)*(1-smooth(37,39,cycle));this.spray.visible=breath>.01;
  if(this.spray.visible){
   this.whale.updateMatrixWorld(true);this.spray.position.copy(this.whale.localToWorld(new THREE.Vector3(0,1.03,3.1)));
   for(let i=0;i<48;i++){const age=((cycle-34)*.7+i/48)%1,a=i*2.399;this.sprayPositions[i*3]=Math.cos(a)*age*.65;this.sprayPositions[i*3+1]=age*2.4;this.sprayPositions[i*3+2]=Math.sin(a)*age*.5+age*.45;}
   this.spray.geometry.attributes.position.needsUpdate=true;(this.spray.material as THREE.PointsMaterial).opacity=breath*.38;
  }
  this.birds.forEach((b,i)=>{
   const local=(seconds+b.phase)%(b.rest+b.flight),f=THREE.MathUtils.clamp((local-b.rest)/b.flight,0,1),flying=local>b.rest;
   if(!flying){b.root.position.copy(b.perch);b.root.rotation.set(0,.4+i*1.7,0);b.left.rotation.set(0,-1.10,.12);b.right.rotation.set(0,1.10,-.12);b.left.scale.set(.56,1,.70);b.right.scale.copy(b.left.scale);return;}
   const eased=f*f*(3-2*f),angle=eased*TAU,radius=9+i*1.7,lift=Math.sin(f*Math.PI);
   b.root.position.copy(b.perch).add(new THREE.Vector3((Math.cos(angle)-1)*radius,lift*(4+i*.45),Math.sin(angle)*radius*.65));
   b.root.rotation.set(-Math.cos(f*Math.PI)*.06,Math.atan2(-Math.sin(angle),Math.cos(angle)*.65),-Math.sin(angle)*.22);
   const flap=(f<.2||f>.79?Math.sin(seconds*(8.4+i*.32))*.52:Math.sin(seconds*1.1+i)*.045);
   const spread=smooth(0,.12,f)*(1-smooth(.85,1,f));
   b.left.rotation.set(0,-1.10*(1-spread),.12+flap*spread);b.right.rotation.set(0,1.10*(1-spread),-.12-flap*spread);
   b.left.scale.set(THREE.MathUtils.lerp(.56,1,spread),1,THREE.MathUtils.lerp(.70,1,spread));b.right.scale.copy(b.left.scale);
  });
 }
 get motionStatus(){return {whaleClips:this.mixer.stats.actions.inUse,birds:this.birds.length,cycleSeconds:62,cyclePhase:Math.round((this.lastTime%62)*10)/10,whaleY:this.whale.position.y,whalePosition:this.whale.position.toArray(),shipPosition:this.ship.position.toArray(),flyingBirds:this.birds.filter(b=>((this.lastTime+b.phase)%(b.rest+b.flight))>b.rest).length};}
 get whalePosition(){return this.whale.position.clone();}
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.whale);this.spray.geometry.dispose();(this.spray.material as THREE.Material).dispose();this.beam.geometry.dispose();(this.beam.material as THREE.Material).dispose();}
}

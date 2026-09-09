import * as THREE from "three";

export const ATMOSPHERE_COLOR = new THREE.Color().setRGB(.018,.145,.18);

export type ShoreShape = {
  coast: ReadonlyArray<readonly number[]>;
  exclusion?: ReadonlyArray<readonly number[]>;
  scale?: number;
  offset?: readonly number[];
  foamWidth?: number;
  foamOpacity?: number;
  segmentOverrides?: {index:number;foamWidth:number;foamOpacity:number}[];
};

export function inPolygon(x: number, z: number, polygon: ReadonlyArray<readonly number[]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function edgeDistance(x: number, z: number, polygon: ReadonlyArray<readonly number[]>) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return distance;
}

const vertex = `
varying vec3 vWorld;
uniform float uTime;
uniform float uScale;
uniform float uCoastScale;
uniform float uExtent;
uniform sampler2D uShore;
float shore(vec2 p) { vec4 d=texture2D(uShore,p/(2.*uExtent)+.5); return (d.r*65280.+d.g*255.)/65535.*32.-8.; }
void main(){
 vec3 p=(modelMatrix*vec4(position,1.)).xyz;float dist=shore(p.xz);float k=smoothstep(0.,1.2*uScale,dist);
 float wave=sin(dot(p.xz,vec2(.8829,-.4695))*6.283185/(14.*uScale)-uTime*.72)*.16;
 wave+=sin(dot(p.xz,vec2(-.31,.9507))*6.283185/(8.*uScale)-uTime*.92)*.065;
 p.y+=wave*uScale*mix(.25,1.,k);
 vec4 w=vec4(p,1.);vWorld=w.xyz;
 gl_Position=projectionMatrix*viewMatrix*w;
}`;

const fragment = `
precision highp float;
varying vec3 vWorld;
uniform float uTime;
uniform float uScale;
uniform float uCoastScale;
uniform float uExtent;
uniform sampler2D uShore;
uniform sampler2D uNormal;
uniform float uHasNormal;
uniform vec3 uCamera;
uniform vec3 uHazeColor;
uniform vec4 uVessel;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){
 vec2 p=vWorld.xz;vec2 uv=p/(2.*uExtent)+.5;
 vec4 field=texture2D(uShore,clamp(uv,0.,1.));
 float insideField=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float dist=mix(24.,(field.r*65280.+field.g*255.)/65535.*32.-8.,insideField);
 float localScale=uCoastScale;
 vec2 q=p/uScale;
 vec2 swellWarp=vec2(noise(q*.055+uTime*.008),noise(q*.071+vec2(9.,17.)-uTime*.006))-.5;
 float phase=dot(q+swellWarp*22.,vec2(.8211,.5708))*6.283185/14.-uTime*.785398;
 float rippleWarp=(noise(q*.09+vec2(uTime*.006,-uTime*.004))-.5)*2.4;
 float rip=dot(q,vec2(-.31,.9507))*6.283185/1.8-uTime*2.244+rippleWarp;
 // Integrate high-frequency waves over the pixel footprint. Without this,
 // distant ripples become broad repeating interference stripes.
 float detail=1.-smoothstep(90.,240.,length(uCamera-vWorld));
 float ripVisible=1.-smoothstep(.45,2.5,fwidth(rip));
 float swellVisible=1.-smoothstep(.6,3.0,fwidth(phase));
 float swellVariation=.25+.75*smoothstep(.25,.75,noise(q*.085));
 float swellDistance=1.-smoothstep(50.*uScale,160.*uScale,length(uCamera-vWorld));
 vec2 slope=cos(phase)*.065*vec2(.8211,.5708)*swellVisible*swellVariation*swellDistance+cos(rip)*.006*vec2(-.31,.9507)*ripVisible*detail;
 vec2 drift=vec2(noise(q*.07),noise(q*.07+vec2(13.7,7.2)))-.5;
 vec3 n1=texture2D(uNormal,q*.22+drift*.7+uTime*vec2(.007,.0036)).xyz*2.-1.;
 mat2 r=mat2(.3624,.9320,-.9320,.3624);
 vec3 n2=texture2D(uNormal,r*q*.31-drift*.6+uTime*vec2(-.0032,.005)).xyz*2.-1.;
 vec2 rotatedNormal=vec2(dot(r[0],n2.xy),dot(r[1],n2.xy));
 slope+=uHasNormal*(n1.xy*.15+rotatedNormal*.13)*detail;
 slope+=vec2(noise(q*.17+uTime*.01)-.5,noise(q*.15+vec2(17.,4.)-uTime*.007)-.5)*.045;
 vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 V=normalize(uCamera-vWorld);
 float fresnel=pow(1.-max(dot(V,N),0.),4.);
 float shoreProfile=.65+noise(q*.17)*1.1;
 float depth=smoothstep(.12*localScale,2.8*localScale*shoreProfile,max(dist+(noise(q*.18)-.5)*2.4*localScale,0.));
 vec3 shallow=vec3(.06,.32,.30),deep=vec3(.018,.145,.18);
 vec3 color=mix(shallow,deep,depth);
 float low=noise(q*.035+vec2(uTime*.002));color*=.91+low*.15;
 color=mix(color,vec3(.33,.49,.47),fresnel*.32);
 vec3 L=normalize(vec3(-.55,.8,-.3)),H=normalize(L+V);
 float spec=pow(max(dot(N,H),0.),72.);
 color+=vec3(.82,.73,.48)*spec*.29;
 float turbulence=noise(q*.85+vec2(uTime*.06,-uTime*.045));
 float foamWidth=max(field.b*.5,fwidth(dist)*.6);
 float foam=1.-smoothstep(foamWidth*.1,foamWidth,abs(dist-(turbulence-.5)*.16*localScale));
 foam*=smoothstep(.35,.7,turbulence)*field.a*insideField;
 float wash=(1.-smoothstep(.2,1.3,max(dist,0.)/localScale))*smoothstep(.55,.78,noise(q*.5+uTime*.07));
 foam+=wash*.14*step(0.,dist)*insideField;
 color=mix(color,vec3(.78,.85,.73),foam);
 vec2 wakeDelta=p-uVessel.xy,forward=vec2(sin(uVessel.z),cos(uVessel.z));
 float behind=-dot(wakeDelta,forward)/max(uVessel.w,.001),side=abs(dot(wakeDelta,vec2(forward.y,-forward.x)))/max(uVessel.w,.001);
 float wakeWidth=.25+behind*.22;
 float wake=(1.-smoothstep(.08,.32,abs(side-wakeWidth)))*smoothstep(.8,2.,behind)*(1.-smoothstep(5.,12.,behind));
 wake*=.28+noise(vec2(behind*1.3+uTime*.3,side*2.))*.4;
 color=mix(color,vec3(.69,.81,.74),wake*.34*step(.01,uVessel.w));
 // Share a linear radiance with the sky mesh; both follow the same
 // tone-mapping path in direct and composer rendering.
 float horizon=smoothstep(150.,430.,length(uCamera-vWorld));
 color=mix(color,uHazeColor,horizon);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class AtlasWater {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private field: THREE.Texture;
  private fields=new Map<string,THREE.Texture>();
  private fieldGeneration=0;
  private disposed=false;
  private fallback: THREE.DataTexture;
  private normal?: THREE.Texture;
  constructor(camera: THREE.Camera) {
    this.field = new THREE.DataTexture(new Uint8Array([255,255,0,0]),1,1);
    this.field.needsUpdate=true;
    this.fallback = new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
    this.fallback.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(200,200,192,192); geometry.rotateX(-Math.PI/2);
    const points=geometry.attributes.position;
    const stretch=(value:number)=>{const t=Math.abs(value)/100;return Math.sign(value)*(t<=.66?t/.66*100:100+Math.pow((t-.66)/.34,2)*900);};
    for(let i=0;i<points.count;i++){points.setX(i,stretch(points.getX(i)));points.setZ(i,stretch(points.getZ(i)));}
    points.needsUpdate=true;geometry.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{
      uTime:{value:0},uScale:{value:.42},uCoastScale:{value:.13},uExtent:{value:120},uShore:{value:this.field},
      uVessel:{value:new THREE.Vector4(0,0,0,0)},uNormal:{value:this.fallback},uHasNormal:{value:0},uCamera:{value:camera.position},uHazeColor:{value:ATMOSPHERE_COLOR.clone()},
    }}));
    this.mesh.name="atlas-water"; this.mesh.position.y=0;
    this.mesh.frustumCulled=false;
  }
  setShore(id:string,detailed:boolean,onReady:()=>void=()=>{}) {
    const token=++this.fieldGeneration;
    this.mesh.scale.setScalar(detailed?1:.4);
    this.mesh.material.uniforms.uExtent.value=detailed?65:35;
    this.mesh.material.uniforms.uScale.value=detailed?1:.42;
    this.mesh.material.uniforms.uCoastScale.value=detailed?1:.13;
    const apply=(texture:THREE.Texture)=>{if(this.disposed||token!==this.fieldGeneration)return;this.mesh.material.uniforms.uShore.value=texture;onReady();};
    const cached=this.fields.get(id);if(cached){apply(cached);return;}
    this.mesh.material.uniforms.uShore.value=this.field;
    new THREE.TextureLoader().load(`./assets/shores/${id}.png`,texture=>{
      if(this.disposed){texture.dispose();return;}
      texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      this.fields.set(id,texture);apply(texture);
    },undefined,()=>{});
  }
  setNormal(texture: THREE.Texture) {
    this.normal=texture;texture.colorSpace=THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=2;
    this.mesh.material.uniforms.uNormal.value=texture;
    this.mesh.material.uniforms.uHasNormal.value=1;
  }
  setVessel(pose:THREE.Vector4){this.mesh.material.uniforms.uVessel.value=pose;}
  setTime(seconds:number){this.mesh.material.uniforms.uTime.value=seconds;}
  dispose(){this.disposed=true;this.fieldGeneration++;for(const t of this.fields.values())t.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();this.field.dispose();this.fallback.dispose();this.normal?.dispose();}
}

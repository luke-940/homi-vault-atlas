import * as THREE from "three";
import { SWELLS, MOON_DIRECTION } from "./environment";
import { OceanSpectrum } from "./ocean-spectrum";

export const ATMOSPHERE_COLOR = new THREE.Color().setRGB(.008,.018,.035);

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

const swellCode=SWELLS.map(w=>`{
 vec2 direction=vec2(${w.direction.map(n=>n.toFixed(6)).join(',')});
 float k=${(Math.PI*2/w.length).toFixed(8)};
 float phase=dot(p.xz,direction)*k-sqrt(9.81*k)*uTime+${w.phase.toFixed(6)};
 p.y+=${w.amplitude.toFixed(6)}*sin(phase);
 slope+=direction*k*${w.amplitude.toFixed(6)}*cos(phase);
}`).join('\n');
const vertex=`varying vec3 vWorld;varying vec2 vSlope;uniform float uTime;
void main(){vec3 p=(modelMatrix*vec4(position,1.)).xyz;vec2 slope=vec2(0.);
${swellCode}
vWorld=p;vSlope=slope;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
const fragment=`
precision highp float;
varying vec3 vWorld;varying vec2 vSlope;
uniform float uTime;uniform float uSpectrumSize;uniform float uHasSpectrum;
uniform sampler2D uSpectrum;uniform sampler2D uNormal;uniform sampler2D uShore;
uniform float uHasNormal;uniform vec3 uCamera;uniform vec3 uMoon;uniform vec4 uVessel;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){
 vec2 p=vWorld.xz;float distanceToEye=length(uCamera-vWorld);
 vec2 uv=p/512.+.5;vec4 shore=texture2D(uShore,clamp(uv,0.,1.));
 float inField=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float coast=mix(24.,(shore.r*65280.+shore.g*255.)/65535.*32.-8.,inField);
 vec3 fft=texture2D(uSpectrum,p/uSpectrumSize).rgb;
 vec3 fft2=texture2D(uSpectrum,(p+vec2(19.7,32.1))/(uSpectrumSize*.57)).rgb;
 float mipFade=1.-smoothstep(240.,650.,distanceToEye);
 vec2 ripple=(fft.xz*.28+fft2.xz*.09)*uHasSpectrum*mipFade;
 vec3 normalMap=texture2D(uNormal,p*.17+uTime*vec2(.008,.005)).xyz*2.-1.;
 ripple+=normalMap.xy*.035*uHasNormal*(1.-uHasSpectrum)*(1.-smoothstep(55.,160.,distanceToEye));
 vec3 N=normalize(vec3(-vSlope.x+ripple.x,1.,-vSlope.y+ripple.y));
 vec3 V=normalize(uCamera-vWorld);float ndv=max(dot(N,V),0.);
 float fresnel=.025+.975*pow(1.-ndv,5.);
 vec3 reflectDirection=reflect(-V,N);
 vec3 sky=mix(vec3(.027,.049,.080),vec3(.004,.012,.028),smoothstep(0.,.7,reflectDirection.y));
 float shallow=1.-smoothstep(.2,5.,max(coast,0.));
 vec3 water=mix(vec3(.005,.022,.035),vec3(.012,.075,.072),shallow*.8);
 vec3 color=mix(water,sky,fresnel*.88);
 vec3 H=normalize(uMoon+V);float ndh=max(dot(N,H),0.);
 float glint=pow(ndh,260.)*.065+pow(ndh,65.)*.009;
 color+=vec3(.69,.78,.88)*glint;
 float small=noise(p*.82+vec2(uTime*.11,-uTime*.06));
 float washFront=.28+.6*sin(uTime*.78+noise(p*.08)*6.);
 float foamBand=1.-smoothstep(.20,1.05,abs(coast-washFront-(small-.5)*.85));
 float pockets=smoothstep(.4,.78,noise(p*.33+uTime*.025));
 float foam=foamBand*pockets*step(-.15,coast)*inField;
 // Broad, broken wash at rock pockets. A continuous constant-width outline is deliberately absent.
 foam+=exp(-max(coast,0.)*1.4)*smoothstep(.7,.9,small)*.18*step(0.,coast)*inField;
 vec2 delta=p-uVessel.xy,forward=vec2(sin(uVessel.z),cos(uVessel.z));
 float aft=-dot(delta,forward),side=abs(dot(delta,vec2(forward.y,-forward.x)));
 float width=.4+aft*.20;
 float wake=(1.-smoothstep(.10,.48,abs(side-width)))*smoothstep(2.,4.,aft)*(1.-smoothstep(15.,24.,aft));
 wake*=smoothstep(.15,.72,small)*step(.01,uVessel.w);
 float bow=exp(-pow((aft+4.)/1.6,2.))*exp(-pow((side-1.05)/.45,2.))*step(.01,uVessel.w);
 color=mix(color,vec3(.25,.40,.43),clamp(foam*.48+wake*.36+bow*.22,0.,.68));
 float horizon=smoothstep(350.,900.,distanceToEye);color=mix(color,vec3(.008,.018,.035),horizon);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class AtlasWater{
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
 private field:THREE.Texture;
 private fallback:THREE.DataTexture;
 private spectrum?:OceanSpectrum;
 private normal?:THREE.Texture;
 private disposed=false;
 private shoreRequested=false;
 constructor(private camera:THREE.Camera,renderer?:THREE.WebGLRenderer){
  this.field=new THREE.DataTexture(new Uint8Array([255,255,0,0]),1,1);this.field.needsUpdate=true;
  this.fallback=new THREE.DataTexture(new Float32Array([0,1,0,1]),1,1,THREE.RGBAFormat,THREE.FloatType);this.fallback.needsUpdate=true;
  if(renderer?.extensions.has('EXT_color_buffer_float'))this.spectrum=new OceanSpectrum(renderer);
  const geometry=new THREE.PlaneGeometry(400,400,256,256);geometry.rotateX(-Math.PI/2);
  const p=geometry.attributes.position;
  const stretch=(v:number)=>{const t=Math.abs(v)/200;return Math.sign(v)*(t<=.7?t/.7*170:170+((t-.7)/.3)**2*900);};
  for(let i=0;i<p.count;i++){p.setX(i,stretch(p.getX(i)));p.setZ(i,stretch(p.getZ(i)));}p.needsUpdate=true;geometry.computeBoundingSphere();
  this.mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{uTime:{value:0},uSpectrum:{value:this.spectrum?.texture??this.fallback},uSpectrumSize:{value:48},uHasSpectrum:{value:this.spectrum?1:0},uNormal:{value:this.fallback},uHasNormal:{value:0},uShore:{value:this.field},uCamera:{value:camera.position},uMoon:{value:MOON_DIRECTION},uVessel:{value:new THREE.Vector4()}}}));
  this.mesh.name='atlas-night-ocean';this.mesh.frustumCulled=false;
 }
 setShore(_id:string,_detailed:boolean,onReady:()=>void=()=>{}){
  if(this.shoreRequested)return;this.shoreRequested=true;
  new THREE.TextureLoader().load('./assets/shores/v83-world.png',texture=>{
   if(this.disposed){texture.dispose();return;}texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
   this.field.dispose();this.field=texture;this.mesh.material.uniforms.uShore.value=texture;onReady();
  },undefined,()=>{this.shoreRequested=false;});
 }
 setNormal(texture:THREE.Texture){this.normal=texture;texture.colorSpace=THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;this.mesh.material.uniforms.uNormal.value=texture;this.mesh.material.uniforms.uHasNormal.value=1;}
 setVessel(pose:THREE.Vector4){this.mesh.material.uniforms.uVessel.value=pose;}
 setTime(time:number){this.mesh.material.uniforms.uTime.value=time;this.mesh.position.x=Math.floor(this.camera.position.x/2)*2;this.mesh.position.z=Math.floor(this.camera.position.z/2)*2;this.spectrum?.update(time);}
 get spectrumActive(){return Boolean(this.spectrum);}
 resetSpectrum(){this.spectrum?.reset();}
 dispose(){this.disposed=true;this.spectrum?.dispose();this.field.dispose();this.fallback.dispose();this.normal?.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}

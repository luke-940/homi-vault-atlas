import * as THREE from "three";

export const ATMOSPHERE_COLOR = new THREE.Color().setRGB(.09,.16,.175);

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

// A numeric distance field derived from the authored coastline, never a decorative island halo.
function distanceField(shapes: ShoreShape[], extent: number) {
  const side = 384, data = new Uint8Array(side * side * 4);
  const transformed = shapes.map(s => {
    const scale = s.scale ?? 1, off = s.offset ?? [0, 0];
    const transform = (p: readonly number[]) => [p[0] * scale + off[0], p[1] * scale + off[1]];
    return { coast: s.coast.map(transform), exclusion: s.exclusion?.map(transform), scale, width:s.foamWidth??.32, opacity:s.foamOpacity??.34, overrides:s.segmentOverrides??[] };
  });
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    const x = ((i + .5) / side * 2 - 1) * extent;
    const z = ((j + .5) / side * 2 - 1) * extent;
    let nearest = 24, foamWidth = .32, foamOpacity = .34, excluded = false;
    for (const s of transformed) {
      let unsigned=Infinity,segment=0;
      for(let edge=0;edge<s.coast.length;edge++){
        const a=s.coast[edge],b=s.coast[(edge+1)%s.coast.length],dx=b[0]-a[0],dz=b[1]-a[1];
        const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
        const distance=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
        if(distance<unsigned){unsigned=distance;segment=edge;}
      }
      const distance = unsigned * (inPolygon(x, z, s.coast) ? -1 : 1);
      if (distance < nearest) {
        nearest = distance;const override=s.overrides.find(o=>o.index===segment);
        foamWidth=(override?.foamWidth??s.width)*s.scale;foamOpacity=override?.foamOpacity??s.opacity;
      }
      if (s.exclusion && inPolygon(x, z, s.exclusion)) excluded = true;
    }
    const value = Math.round(THREE.MathUtils.clamp((nearest + 8) / 32, 0, 1) * 65535);
    const index = (j * side + i) * 4;
    data[index] = value >> 8; data[index + 1] = value & 255;
    data[index + 2] = Math.round(THREE.MathUtils.clamp(foamWidth/.5,0,1)*255);
    data[index + 3] = excluded ? 0 : Math.round(THREE.MathUtils.clamp(foamOpacity,0,1)*255);
  }
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

const vertex = `
varying vec3 vWorld;
uniform float uTime;
uniform float uScale;
uniform float uExtent;
uniform sampler2D uShore;
float shore(vec2 p) { vec4 d=texture2D(uShore,p/(2.*uExtent)+.5); return (d.r*65280.+d.g*255.)/65535.*32.-8.; }
void main(){
 vec3 p=position;float dist=shore(p.xz);float k=smoothstep(0.,1.2*uScale,dist);
 float wave=sin(dot(p.xz,vec2(.8211,.5708))*6.283185/(14.*uScale)-uTime*.785398)*.065;
 wave+=sin(dot(p.xz,vec2(-.31,.9507))*6.283185/(1.8*uScale)-uTime*2.244)*.014;
 p.y+=wave*uScale*mix(.25,1.,k);
 vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;
 gl_Position=projectionMatrix*viewMatrix*w;
}`;

const fragment = `
precision highp float;
varying vec3 vWorld;
uniform float uTime;
uniform float uScale;
uniform float uExtent;
uniform sampler2D uShore;
uniform sampler2D uNormal;
uniform float uHasNormal;
uniform vec3 uCamera;
uniform vec3 uHazeColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){
 vec2 p=vWorld.xz;vec2 uv=p/(2.*uExtent)+.5;
 vec4 field=texture2D(uShore,clamp(uv,0.,1.));
 float insideField=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float dist=mix(24.,(field.r*65280.+field.g*255.)/65535.*32.-8.,insideField);
 float localScale=uScale;
 vec2 q=p/uScale;
 float phase=dot(q,vec2(.8211,.5708))*6.283185/14.-uTime*.785398;
 float rippleWarp=(noise(q*.09+vec2(uTime*.006,-uTime*.004))-.5)*2.4;
 float rip=dot(q,vec2(-.31,.9507))*6.283185/1.8-uTime*2.244+rippleWarp;
 // Integrate high-frequency waves over the pixel footprint. Without this,
 // distant ripples become broad repeating interference stripes.
 float detail=1.-smoothstep(65.,200.,length(uCamera-vWorld)/uScale);
 float ripVisible=1.-smoothstep(.45,2.5,fwidth(rip));
 float swellVisible=1.-smoothstep(.6,3.0,fwidth(phase));
 float swellVariation=.55+.45*noise(q*.045);
 vec2 slope=cos(phase)*.029*vec2(.8211,.5708)*swellVisible*swellVariation*mix(.04,1.,detail)+cos(rip)*.018*vec2(-.31,.9507)*ripVisible*detail;
 vec2 drift=vec2(noise(q*.07),noise(q*.07+vec2(13.7,7.2)))-.5;
 vec3 n1=texture2D(uNormal,q*.22+drift*.7+uTime*vec2(.007,.0036)).xyz*2.-1.;
 mat2 r=mat2(.3624,.9320,-.9320,.3624);
 vec3 n2=texture2D(uNormal,r*q*.31-drift*.6+uTime*vec2(-.0032,.005)).xyz*2.-1.;
 vec2 rotatedNormal=vec2(dot(r[0],n2.xy),dot(r[1],n2.xy));
 slope+=uHasNormal*(n1.xy*.105+rotatedNormal*.09)*detail;
 vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 V=normalize(uCamera-vWorld);
 float fresnel=pow(1.-max(dot(V,N),0.),4.);
 float depth=smoothstep(.12*localScale,5.*localScale,max(dist,0.));
 vec3 shallow=vec3(.12,.36,.32),deep=vec3(.015,.115,.145);
 vec3 color=mix(shallow,deep,depth);
 float low=noise(q*.035+vec2(uTime*.002));color*=.91+low*.15;
 color=mix(color,vec3(.33,.49,.47),fresnel*.48);
 vec3 L=normalize(vec3(-.55,.8,-.3)),H=normalize(L+V);
 float spec=pow(max(dot(N,H),0.),96.);
 color+=vec3(.82,.73,.48)*spec*.24;
 float turbulence=noise(q*1.6+vec2(uTime*.035,-uTime*.018));
 float foamWidth=max(field.b*.5,fwidth(dist)*.6);
 float foam=1.-smoothstep(foamWidth*.1,foamWidth,abs(dist-(turbulence-.5)*.16*localScale));
 foam*=smoothstep(.15,.55,turbulence)*field.a*insideField;
 color=mix(color,vec3(.78,.85,.73),foam);
 // Share a linear radiance with the sky mesh; both follow the same
 // tone-mapping path in direct and composer rendering.
 float horizon=smoothstep(150.,430.,length(uCamera-vWorld)/uScale);
 color=mix(color,uHazeColor,horizon);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class AtlasWater {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private field: THREE.DataTexture;
  private fallback: THREE.DataTexture;
  private normal?: THREE.Texture;
  constructor(camera: THREE.Camera) {
    this.field = distanceField([], 120);
    this.fallback = new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
    this.fallback.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(1000,1000,160,160); geometry.rotateX(-Math.PI/2);
    this.mesh = new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{
      uTime:{value:0},uScale:{value:.13},uExtent:{value:120},uShore:{value:this.field},
      uNormal:{value:this.fallback},uHasNormal:{value:0},uCamera:{value:camera.position},uHazeColor:{value:ATMOSPHERE_COLOR.clone()},
    }}));
    this.mesh.name="atlas-water"; this.mesh.position.y=0;
    this.mesh.frustumCulled=false;
  }
  setShore(shapes: ShoreShape[], detailed: boolean) {
    const extent=detailed?65:35;
    const old=this.field;this.field=distanceField(shapes,extent);
    Object.assign(this.mesh.material.uniforms.uShore,{value:this.field});old.dispose();
    this.mesh.material.uniforms.uExtent.value=extent;
    this.mesh.material.uniforms.uScale.value=detailed?1:.13;
  }
  setNormal(texture: THREE.Texture) {
    this.normal=texture;texture.colorSpace=THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=2;
    this.mesh.material.uniforms.uNormal.value=texture;
    this.mesh.material.uniforms.uHasNormal.value=1;
  }
  setTime(seconds:number){this.mesh.material.uniforms.uTime.value=seconds;}
  dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();this.field.dispose();this.fallback.dispose();this.normal?.dispose();}
}

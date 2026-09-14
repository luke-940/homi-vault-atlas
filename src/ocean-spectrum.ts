import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {SUBTRANSFORM_FRAGMENT_SOURCE,INITIAL_SPECTRUM_FRAGMENT_SOURCE,PHASE_FRAGMENT_SOURCE,SPECTRUM_FRAGMENT_SOURCE,NORMAL_MAP_FRAGMENT_SOURCE} from './ocean-spectrum-shaders';

const vertex=`varying vec2 v_coordinates;void main(){v_coordinates=uv;gl_Position=vec4(position.xy,0.,1.);}`;
/** Small GPU spectrum, based on David Li's MIT Stockham ocean. No CPU readback or per-frame allocation. */
export class OceanSpectrum{
 private targets:THREE.WebGLRenderTarget[]=[];
 private materials:THREE.ShaderMaterial[]=[];
 private quad:FullScreenQuad;
 private initial:THREE.WebGLRenderTarget;
 private phaseA:THREE.WebGLRenderTarget;
 private phaseB:THREE.WebGLRenderTarget;
 private spectral:THREE.WebGLRenderTarget;
 private ping:THREE.WebGLRenderTarget;
 private pong:THREE.WebGLRenderTarget;
 private normals:THREE.WebGLRenderTarget;
 private initialMaterial:THREE.ShaderMaterial;
 private phaseMaterial:THREE.ShaderMaterial;
 private spectrumMaterial:THREE.ShaderMaterial;
 private horizontal:THREE.ShaderMaterial;
 private vertical:THREE.ShaderMaterial;
 private normalMaterial:THREE.ShaderMaterial;
 private seed:THREE.DataTexture;
 private started=false;
 private lastTime=0;
 readonly size=48;
 constructor(private renderer:THREE.WebGLRenderer,readonly resolution=128){
  const target=()=>{const t=new THREE.WebGLRenderTarget(resolution,resolution,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});t.texture.wrapS=t.texture.wrapT=THREE.RepeatWrapping;this.targets.push(t);return t;};
  this.initial=target();this.phaseA=target();this.phaseB=target();this.spectral=target();this.ping=target();this.pong=target();this.normals=target();
  const shader=(fragment:string,extra:Record<string,THREE.IUniform>={})=>{const m=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{u_resolution:{value:resolution},u_size:{value:this.size},...extra}});this.materials.push(m);return m;};
  const values=new Float32Array(resolution*resolution*4);let random=83271;
  for(let i=0;i<values.length;i+=4){random=(1664525*random+1013904223)>>>0;values[i]=random/4294967296*Math.PI*2;}
  this.seed=new THREE.DataTexture(values,resolution,resolution,THREE.RGBAFormat,THREE.FloatType);this.seed.needsUpdate=true;
  this.initialMaterial=shader(INITIAL_SPECTRUM_FRAGMENT_SOURCE,{u_wind:{value:new THREE.Vector2(7.8,4.6)}});
  this.phaseMaterial=shader(PHASE_FRAGMENT_SOURCE,{u_phases:{value:this.seed},u_deltaTime:{value:0}});
  this.spectrumMaterial=shader(SPECTRUM_FRAGMENT_SOURCE,{u_phases:{value:this.phaseA.texture},u_initialSpectrum:{value:this.initial.texture},u_choppiness:{value:1.25}});
  const fft={u_input:{value:null},u_transformSize:{value:resolution},u_subtransformSize:{value:2}};
  this.horizontal=shader('#define HORIZONTAL\n'+SUBTRANSFORM_FRAGMENT_SOURCE,THREE.UniformsUtils.clone(fft));
  this.vertical=shader(SUBTRANSFORM_FRAGMENT_SOURCE,THREE.UniformsUtils.clone(fft));
  this.normalMaterial=shader(NORMAL_MAP_FRAGMENT_SOURCE,{u_displacementMap:{value:this.pong.texture}});
  this.quad=new FullScreenQuad(this.initialMaterial);
 }
 get texture(){return this.normals.texture;}
 reset(){this.started=false;this.lastTime=0;this.seed.needsUpdate=true;}
 private draw(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget){this.quad.material=material;this.renderer.setRenderTarget(target);this.quad.render(this.renderer);}
 update(time:number){
  if(this.started&&time-this.lastTime<1/30)return;
  const previous=this.renderer.getRenderTarget(),autoClear=this.renderer.autoClear;this.renderer.autoClear=true;
  try{
   if(!this.started)this.draw(this.initialMaterial,this.initial);
   this.phaseMaterial.uniforms.u_phases.value=this.started?this.phaseA.texture:this.seed;
   this.phaseMaterial.uniforms.u_deltaTime.value=this.started?Math.min(time-this.lastTime,.1):0;
   this.draw(this.phaseMaterial,this.phaseB);[this.phaseA,this.phaseB]=[this.phaseB,this.phaseA];
   this.spectrumMaterial.uniforms.u_phases.value=this.phaseA.texture;this.draw(this.spectrumMaterial,this.spectral);
   const levels=Math.log2(this.resolution);let input=this.spectral;
   for(let i=0;i<levels*2;i++){
    const m=i<levels?this.horizontal:this.vertical,target=i%2?this.pong:this.ping;
    m.uniforms.u_input.value=input.texture;m.uniforms.u_subtransformSize.value=2**(i%levels+1);this.draw(m,target);input=target;
   }
   this.normalMaterial.uniforms.u_displacementMap.value=input.texture;this.draw(this.normalMaterial,this.normals);
   this.started=true;this.lastTime=time;
  }finally{this.renderer.setRenderTarget(previous);this.renderer.autoClear=autoClear;}
 }
 dispose(){for(const t of this.targets)t.dispose();for(const m of this.materials)m.dispose();this.seed.dispose();this.quad.dispose();}
}

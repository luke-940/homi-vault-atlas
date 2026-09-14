import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export type FlightState = {active:boolean;locked:boolean;fallback:boolean};
export type FlightAxes = {forward:number;right:number;up:number};
const editable=(t:EventTarget|null)=>t instanceof HTMLElement&&Boolean(t.closest('input,textarea,select,[contenteditable="true"]'));

/** View direction is owned by PointerLockControls; translation includes the sea and adjacent islands. */
export class AtlasFlight {
 readonly controls:PointerLockControls;
 private active=false;
 private keys=new Set<string>();
 private axes:FlightAxes={forward:0,right:0,up:0};
 private drag?:{id:number;x:number;y:number};
 private direction=new THREE.Vector3();
 private right=new THREE.Vector3();
 private velocity=new THREE.Vector3();
 private euler=new THREE.Euler(0,0,0,'YXZ');
 constructor(private camera:THREE.Camera,private canvas:HTMLCanvasElement,private manual:()=>void,private change:(s:FlightState)=>void){
  this.controls=new PointerLockControls(camera,canvas);this.controls.pointerSpeed=.68;
  this.controls.minPolarAngle=.06;this.controls.maxPolarAngle=Math.PI-.06;
  this.controls.addEventListener('change',this.lookChanged);
  this.controls.addEventListener('lock',this.locked);
  this.controls.addEventListener('unlock',this.unlocked);
  document.addEventListener('keydown',this.keyDown);document.addEventListener('keyup',this.keyUp);
  document.addEventListener('pointerlockerror',this.lockFailed);
  canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);
  canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerUp);
  window.addEventListener('blur',this.blur);
 }
 get state():FlightState{return {active:this.active,locked:this.controls.isLocked,fallback:this.active&&!this.controls.isLocked};}
 start(){
  this.active=true;this.controls.enabled=true;this.clearInput();this.manual();this.canvas.focus({preventScroll:true});this.change(this.state);
  if(matchMedia('(pointer:coarse)').matches||!this.canvas.requestPointerLock)return;
  // PointerLockControls owns the lock events and mouse-look. Catch request rejection to retain drag-look.
  try{const request=this.canvas.requestPointerLock();request?.catch(()=>this.lockFailed());}catch{this.lockFailed();}
 }
 stop(){
  this.active=false;this.clearInput();
  if(this.controls.isLocked)this.controls.unlock();
  this.change(this.state);
 }
 clearInput(){this.keys.clear();this.axes={forward:0,right:0,up:0};this.drag=undefined;}
 setAxes(axes:Partial<FlightAxes>){for(const key of ['forward','right','up'] as const)if(axes[key]!==undefined)this.axes[key]=THREE.MathUtils.clamp(axes[key]!, -1,1);if(this.active)this.manual();}
 private lookChanged=()=>{if(this.active)this.manual();};
 private locked=()=>{this.active=true;this.change({active:true,locked:true,fallback:false});};
 private unlocked=()=>{this.active=false;this.clearInput();this.change({active:false,locked:false,fallback:false});};
 private lockFailed=()=>{if(this.active)this.change({active:true,locked:false,fallback:true});};
 private blur=()=>this.stop();
 private keyDown=(e:KeyboardEvent)=>{
  if(!this.active||editable(e.target)||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.code==='Escape'){e.preventDefault();this.stop();return;}
  if(!['KeyW','KeyA','KeyS','KeyD','Space','KeyC','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
  e.preventDefault();this.keys.add(e.code);this.manual();
 };
 private keyUp=(e:KeyboardEvent)=>{this.keys.delete(e.code);};
 private pointerDown=(e:PointerEvent)=>{
  if(!this.active||this.controls.isLocked||e.button!==0)return;
  this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);
 };
 private pointerMove=(e:PointerEvent)=>{
  if(!this.active||this.controls.isLocked||this.drag?.id!==e.pointerId)return;
  const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
  this.drag.x=e.clientX;this.drag.y=e.clientY;
  if(!dx&&!dy)return;this.manual();this.euler.setFromQuaternion(this.camera.quaternion,'YXZ');
  this.euler.y-=dx*.0021;this.euler.x=THREE.MathUtils.clamp(this.euler.x-dy*.0021,-Math.PI/2+.06,Math.PI/2-.06);this.euler.z=0;
  this.camera.quaternion.setFromEuler(this.euler);
 };
 private pointerUp=(e:PointerEvent)=>{if(this.drag?.id===e.pointerId)this.drag=undefined;};
 update(dt:number){
  if(!this.active)return false;
  const key=(...codes:string[])=>codes.some(c=>this.keys.has(c))?1:0;
  const forward=key('KeyW','ArrowUp')-key('KeyS','ArrowDown')+this.axes.forward;
  const right=key('KeyD','ArrowRight')-key('KeyA','ArrowLeft')+this.axes.right;
  const up=key('Space')-key('KeyC')+this.axes.up;
  if(!forward&&!right&&!up)return false;
  this.manual();this.camera.getWorldDirection(this.direction);
  this.right.set(1,0,0).applyQuaternion(this.camera.quaternion);this.right.y=0;this.right.normalize();
  this.velocity.copy(this.direction).multiplyScalar(forward).addScaledVector(this.right,right);this.velocity.y+=up;
  const amount=this.velocity.length();if(amount>1)this.velocity.divideScalar(amount);
  const speed=key('ShiftLeft','ShiftRight')?32:10;
  this.camera.position.addScaledVector(this.velocity,Math.min(dt,.05)*speed);return true;
 }
 dispose(){
  this.stop();this.controls.dispose();document.removeEventListener('keydown',this.keyDown);document.removeEventListener('keyup',this.keyUp);
  document.removeEventListener('pointerlockerror',this.lockFailed);window.removeEventListener('blur',this.blur);
  this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);
  this.canvas.removeEventListener('pointerup',this.pointerUp);this.canvas.removeEventListener('pointercancel',this.pointerUp);
 }
}

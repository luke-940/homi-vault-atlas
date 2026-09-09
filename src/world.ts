import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { ProjectId } from "./content";
import { islands, islandById, placeById, type IslandSpec, type KnowledgeObject } from "./islands";
import { ATMOSPHERE_COLOR, AtlasWater, inPolygon, edgeDistance } from "./water";
import { CameraSolids, pathRoute, validPanPoint, type CollisionShape } from "./camera-geometry";
import { cameraRoute, sampleCameraRoute, type CameraRoute } from "./camera-travel";
import { batchDecorations, applyVegetationWind, type InstanceSelection } from "./scene-batching";
import { AtlasMarine } from "./marine";
import { finishResearchCabinet, finishAtlasWorkshop } from "./exhibit-finish";
import { SceneResources } from "./scene-resources";
import { applyAtlasSceneMaterials, applyAtlasMaterialTreatment, finishV82Materials } from "./material-treatment";

export const anchors:Record<ProjectId,[number,number,number]>={rocket:[-8,0,-4],groot:[6,0,-1],common:[-7,0,7],atlas:[2,0,7]};
const terrainScale:Record<ProjectId,number>={rocket:.12,groot:.13,common:.12,atlas:.12};
type SceneId="world"|ProjectId;
type Triple=[number,number,number];
export type CameraSnapshot={sceneId:SceneId;position:Triple;target:Triple;zoom:number;selectedPlaceId?:string;fov?:number};
export type SceneState={sceneId:SceneId;stage:"loading"|"ready"|"error";message?:string};
export type PlacePosition={x:number;y:number;visible:boolean;depth:number};
type Options={
  initialScene?:SceneId;
  onReady:()=>void;onError:(reason:string)=>void;onSelect:(id:ProjectId)=>void;
  onProject:(positions:Record<string,{x:number;y:number;visible:boolean}>)=>void;
  onSelectPlace?:(placeId:string)=>void;onPlaces?:(positions:Record<string,PlacePosition>)=>void;
  onSceneState?:(state:SceneState)=>void;
};
type LoadedScene={id:SceneId;root:THREE.Group;solids:CameraSolids;bytes:number;loadMs:number;landscape?:THREE.Group;landscapeLoading?:boolean;landscapeStatus?:string};
type Travel={route:CameraRoute;target:THREE.Vector3;startTarget:THREE.Vector3;fov:number;startFov:number;elapsedMs:number};
const vec=(p:readonly number[])=>new THREE.Vector3(p[0],p[1],p[2]);

export class AtlasWorld {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(37,1,.1,1100);
  readonly controls:OrbitControls;
  model:THREE.Group|null=null;
  private current?:LoadedScene;
  private worldCache?:LoadedScene;
  private sceneCache=new Map<SceneId,LoadedScene>();
  private sharedTextures=new Map<string,THREE.Texture>();
  private options:Options;
  private host:HTMLElement;
  private observer:ResizeObserver;
  private composer:EffectComposer;
  private ao:SSAOPass;
  private output:OutputPass;
  private sun:THREE.DirectionalLight;
  private environment:THREE.WebGLRenderTarget;
  private water:AtlasWater;
  private sky:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>;
  private ktx2:KTX2Loader;
  private loader:GLTFLoader;
  private resources=new SceneResources();
  private previousCacheEnabled=THREE.Cache.enabled;
  private generation=0;
  private request?:AbortController;
  private disposed=false;
  private contextLost=false;
  private ready=false;
  private reduced=false;
  private paused=false;
  private quality:"auto"|"high"|"low"="auto";
  private automaticLight=false;
  private lastQualityReview=0;
  private mobile=false;
  private frame=0;
  private dirty=true;
  private interaction=false;
  private lastTick=performance.now();
  private lastRender=0;
  private animatedSeconds=0;
  private frames=0;
  private frameSamples:number[]=[];
  private callbackSamples:number[]=[];
  private cpuSamples:number[]=[];
  private transitionSamples:number[]=[];
  private lastDiagnostic=0;
  private lastProjection=0;
  private travel:Travel|null=null;
  private safePosition=new THREE.Vector3();
  private safeTarget=new THREE.Vector3();
  private selectedPlaceId?:string;
  private hoveredPlaceId?:string;
  private hoverCheckedAt=0;
  private activeProject?:ProjectId;
  private raycaster=new THREE.Raycaster();
  private pointerDown?:{x:number;y:number;time:number};
  private focusedMeshes:THREE.Mesh[]=[];
  private pulses:{mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];temporary:THREE.Material[];start:number}[]=[];
  private instancePulses:{mesh:THREE.InstancedMesh;index:number;original:THREE.Color;start:number}[]=[];
  private motions:{object:THREE.Object3D;base:THREE.Euler;kind:string;phase:number;axis:"x"|"y"|"z";radians:number;period:number;activeSince:number|null}[]=[];
  private lods:{root:THREE.Object3D;levels:THREE.Object3D[];radius:number;level:number}[]=[];
  private lastStage:SceneState={sceneId:"world",stage:"loading"};
  private desiredScene:SceneId="world";
  private pendingSnapshot?:CameraSnapshot;
  private normalReady=false;
  private marine?:AtlasMarine;
  private marineRequest?:Promise<void>;
  private marineStatus="not_requested";
  private windTime={value:0};
  private loadingStarted=0;

  constructor(host:HTMLElement,options:Options){
    this.host=host;this.options=options;this.mobile=host.clientWidth<=800;
    THREE.Cache.enabled=true;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    this.renderer.setClearColor("#0b343b");this.renderer.info.autoReset=false;
    const canvas=this.renderer.domElement;
    canvas.tabIndex=0;canvas.setAttribute("role","application");
    canvas.setAttribute("aria-label","섬을 탐험하는 3D 화면. 방향키로 이동, Q와 E로 회전, 더하기와 빼기로 확대 또는 축소, Home으로 처음 시점으로 돌아갑니다.");
    host.append(canvas);
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;
    this.scene.environmentIntensity=.35;room.dispose();pmrem.dispose();
    this.scene.fog=new THREE.FogExp2("#123c40",.006);
    this.scene.add(new THREE.HemisphereLight("#cee9df","#364d49",1.25));
    this.sun=new THREE.DirectionalLight("#ffe4b5",2.5);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.normalBias=.025;
    this.sun.shadow.bias=-.00015;this.sun.shadow.radius=2;
    this.scene.add(this.sun,this.sun.target);
    const fill=new THREE.DirectionalLight("#88c9d0",.65);fill.position.set(18,30,16);this.scene.add(fill);
    this.water=new AtlasWater(this.camera);this.scene.add(this.water.mesh);
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(950,24,12),new THREE.MeshBasicMaterial({color:ATMOSPHERE_COLOR,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false}));
    this.sky.name="atlas-atmosphere";this.sky.renderOrder=-1000;this.sky.frustumCulled=false;this.scene.add(this.sky);
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true;this.controls.dampingFactor=.12;
    this.controls.screenSpacePanning=false;this.controls.rotateSpeed=.65;this.controls.zoomSpeed=.9;
    this.controls.panSpeed=.85;
    this.controls.addEventListener("start",this.onControlStart);
    this.controls.addEventListener("end",this.onControlEnd);
    this.controls.addEventListener("change",this.onControlChange);
    this.setSceneCamera(options.initialScene??"world");
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.ao=new SSAOPass(this.scene,this.camera,512,512,12);
    this.ao.kernelRadius=2.2;this.ao.minDistance=.0004;this.ao.maxDistance=.025;
    this.composer.addPass(this.ao);this.output=new OutputPass();this.composer.addPass(this.output);
    this.ktx2=new KTX2Loader().setTranscoderPath("./assets/basis/").setWorkerLimit(2).detectSupport(this.renderer);
    this.loader=new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();
    canvas.addEventListener("pointerdown",this.onDown);canvas.addEventListener("pointerup",this.onUp);canvas.addEventListener("pointermove",this.onMove);canvas.addEventListener("pointerleave",this.onLeave);
    canvas.addEventListener("keydown",this.onKey);canvas.addEventListener("webglcontextlost",this.onContextLost);
    canvas.addEventListener("webglcontextrestored",this.onContextRestored);
    document.addEventListener("visibilitychange",this.onVisibility);
    new THREE.TextureLoader().load("./assets/textures/water-normal.webp",texture=>{
      if(this.disposed){texture.dispose();return;}this.water.setNormal(texture);this.normalReady=true;this.invalidate();
    },undefined,()=>{this.normalReady=false;});
    void this.loadScene(options.initialScene??"world");this.invalidate();
  }

  get sceneId():SceneId{return this.current?.id??"world";}
  get sceneState():SceneState{return {...this.lastStage};}
  private get island():IslandSpec|undefined{return this.sceneId==="world"?undefined:islandById.get(this.sceneId);}
  private announce(state:SceneState){this.lastStage=state;this.options.onSceneState?.(state);this.updateDiagnostics();}
  private async loadScene(id:SceneId):Promise<boolean>{
    if(this.disposed)return false;
    this.desiredScene=id;
    if(this.contextLost)return false;
    const token=++this.generation;this.request?.abort();const request=new AbortController();this.request=request;
    this.loadingStarted=performance.now();this.announce({sceneId:id,stage:"loading"});
    try{
      let loaded:LoadedScene;
      if(this.sceneCache.has(id)){loaded=this.sceneCache.get(id)!;this.sceneCache.delete(id);this.sceneCache.set(id,loaded);}
      else{
        const spec=id==="world"?undefined:islandById.get(id);
        if(id!=="world"&&!spec)throw new Error("Unknown island");
        const url=spec?.modelUrl??"./assets/atlas-v82-world.glb";
        const [response,collisionResponse]=await Promise.all([
          fetch(url,{signal:request.signal}),spec?fetch(spec.collisionUrl,{signal:request.signal}):Promise.resolve(null),
        ]);
        if(!response.ok||collisionResponse&&!collisionResponse.ok)throw new Error("Scene resources unavailable");
        const [buffer,collision]=await Promise.all([response.arrayBuffer(),collisionResponse?.json()??Promise.resolve({shapes:[]})]);
        if(token!==this.generation||this.disposed)return false;
        const gltf=await this.loader.parseAsync(buffer,new URL("./assets/",location.href).href);
        if(token!==this.generation||this.disposed){this.resources.discard(gltf.scene);return false;}
        loaded={id,root:gltf.scene,solids:new CameraSolids((collision as {shapes:CollisionShape[]}).shapes),bytes:buffer.byteLength,loadMs:performance.now()-this.loadingStarted};
        this.shareTextures(loaded.root);applyAtlasSceneMaterials(loaded.root);finishV82Materials(loaded.root);finishResearchCabinet(loaded.root);finishAtlasWorkshop(loaded.root);batchDecorations(loaded.root);applyVegetationWind(loaded.root,this.windTime);this.resources.acquire(loaded.root);
        loaded.root.traverse(object=>{
          if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}
        });
        if(id==="world")this.worldCache=loaded;
        this.sceneCache.set(id,loaded);
      }
      if(token!==this.generation||this.disposed)return false;
      this.clearPulse();const previous=this.current;
      if(previous&&previous!==loaded)this.scene.remove(previous.root);
      this.current=loaded;this.model=loaded.root;this.scene.add(loaded.root);
      // Two detailed islands plus the small overview are kept; eviction owns disposal.
      for(const [key,cached] of [...this.sceneCache]){
        if(this.sceneCache.size<=3)break;
        if(key==="world"||cached===loaded)continue;
        this.sceneCache.delete(key);this.releaseScene(cached);
      }
      this.selectedPlaceId=undefined;this.hoveredPlaceId=undefined;this.travel=null;this.focusedMeshes=[];
      this.configureScene(id);this.collectAnimatedObjects();this.setSceneCamera(id);
      const pending=this.pendingSnapshot;this.pendingSnapshot=undefined;
      if(pending?.sceneId===id)this.applySnapshot(pending);
      this.frameSamples=[];this.lastRender=0;
      this.transitionSamples.push(performance.now()-this.loadingStarted);if(this.transitionSamples.length>30)this.transitionSamples.shift();
      this.announce({sceneId:id,stage:"ready"});
      this.marine?.setScene(id);void this.ensureMarine();void this.loadLandscape(loaded,request,token);
      if(!this.ready){this.ready=true;this.options.onReady();}
      this.invalidate();return true;
    }catch(error){
      if(this.disposed||token!==this.generation||request.signal.aborted)return false;
      const message=id==="world"?"풍경을 불러오지 못했습니다. 지도와 자료 읽기는 계속 이용할 수 있습니다.":"이 섬의 풍경을 불러오지 못했습니다. 다시 입장하거나 지도에서 자료를 살펴보세요.";
      this.announce({sceneId:id,stage:"error",message});
      if(!this.current)this.options.onError(message);
      this.invalidate();return false;
    }
  }
  private releaseScene(loaded:LoadedScene){
    if(loaded.landscape){loaded.landscape.removeFromParent();this.resources.release(loaded.landscape);}
    this.resources.release(loaded.root);
  }
  private async loadLandscape(loaded:LoadedScene,request:AbortController,token:number){
    if(loaded.id==="world"||loaded.landscape||loaded.landscapeLoading)return;
    const stage=islandById.get(loaded.id)?.sceneStages?.find(s=>s.id==="landscape");if(!stage)return;
    loaded.landscapeLoading=true;loaded.landscapeStatus="loading";
    try{
      const response=await fetch(stage.url,{signal:request.signal});if(!response.ok)throw new Error("Landscape unavailable");
      const bytes=await response.arrayBuffer();if(this.disposed||token!==this.generation)return;
      const gltf=await this.loader.parseAsync(bytes,new URL("./assets/",location.href).href);
      if(this.disposed||token!==this.generation){this.resources.discard(gltf.scene);return;}
      this.shareTextures(gltf.scene);applyAtlasSceneMaterials(gltf.scene);finishV82Materials(gltf.scene);batchDecorations(gltf.scene);applyVegetationWind(gltf.scene,this.windTime);
      gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
      this.resources.acquire(gltf.scene);loaded.landscape=gltf.scene;loaded.root.add(gltf.scene);loaded.landscapeStatus="ready";
      const base=loaded.root.userData.batching??{batches:0,instances:0},extra=gltf.scene.userData.batching;
      loaded.root.userData.batching={batches:base.batches+extra.batches,instances:base.instances+extra.instances};
      this.invalidate();
    }catch{loaded.landscapeStatus=request.signal.aborted?"cancelled":"unavailable";}
    finally{loaded.landscapeLoading=false;}
  }
  private ensureMarine(){
    if(this.marineRequest||this.marine)return this.marineRequest;
    this.marineStatus="loading";
    this.marineRequest=(async()=>{
      try{
        const response=await fetch("./assets/atlas-v82-marine.glb");if(!response.ok)throw new Error("Marine asset unavailable");
        const buffer=await response.arrayBuffer();if(this.disposed)return;
        const gltf=await this.loader.parseAsync(buffer,new URL("./assets/",location.href).href);
        if(this.disposed){this.resources.discard(gltf.scene);return;}
        this.shareTextures(gltf.scene);this.resources.acquire(gltf.scene);
        this.marine=new AtlasMarine(gltf.scene);this.marine.setScene(this.sceneId);this.scene.add(this.marine.root);
        this.water.setVessel(this.marine.vessel);this.marineStatus="ready";this.invalidate();
      }catch{this.marineStatus="unavailable";}
    })();
    return this.marineRequest;
  }
  private shareTextures(root:THREE.Group){
    const replaced=new Set<THREE.Texture>(),retainedImages=new Set<unknown>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        for(const [slot,value] of Object.entries(material)){
          if(!(value instanceof THREE.Texture)||!value.name.startsWith("texture-"))continue;
          const key=[value.name,value.colorSpace,value.wrapS,value.wrapT,...value.repeat.toArray(),...value.offset.toArray(),value.rotation].join(":");
          const existing=this.sharedTextures.get(key);
          if(existing&&existing!==value){(material as unknown as Record<string,unknown>)[slot]=existing;replaced.add(value);retainedImages.add(existing.source.data);}
          else if(!existing){
            this.sharedTextures.set(key,value);
            const lease=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({map:value}));
            this.resources.acquire(lease);retainedImages.add(value.source.data);
          }else retainedImages.add(value.source.data);
        }
      }
    });
    for(const texture of replaced){texture.dispose();const data=texture.source?.data as {close?:()=>void}|undefined;if(data&&!retainedImages.has(data))data.close?.();}
  }
  async enterIsland(id:ProjectId,placeId?:string){
    this.desiredScene=id;this.pendingSnapshot=undefined;
    let success=true;
    if(this.sceneId!==id||!this.current)success=await this.loadScene(id);
    else this.cancelPendingLoad();
    if(success&&placeId)this.focusPlace(placeId);
    return success;
  }
  async showWorld(snapshot?:CameraSnapshot){
    this.desiredScene="world";this.pendingSnapshot=undefined;
    const alreadyCurrent=this.sceneId==="world"&&!!this.current;
    if(alreadyCurrent)this.cancelPendingLoad();
    const success=alreadyCurrent?true:await this.loadScene("world");
    if(success){if(snapshot?.sceneId==="world")this.applySnapshot(snapshot);else this.focus();}
    return success;
  }
  captureCamera():CameraSnapshot{return {sceneId:this.sceneId,position:this.camera.position.toArray() as Triple,target:this.controls.target.toArray() as Triple,zoom:this.camera.zoom,fov:this.camera.fov,selectedPlaceId:this.selectedPlaceId};}
  async restoreCamera(snapshot:CameraSnapshot,expectedScene?:SceneId){
    if(!snapshot||!this.validSnapshot(snapshot)||(expectedScene&&snapshot.sceneId!==expectedScene))return false;
    expectedScene??=snapshot.sceneId;
    if(this.lastStage.sceneId===expectedScene&&this.lastStage.stage!=="ready"){
      if(this.lastStage.stage==="loading"||this.contextLost)this.pendingSnapshot=snapshot;
      return false;
    }
    this.desiredScene=snapshot.sceneId;
    if(this.contextLost){this.pendingSnapshot=snapshot;return false;}
    const alreadyCurrent=!!this.current&&this.sceneId===snapshot.sceneId;
    if(alreadyCurrent)this.cancelPendingLoad();
    const ok=alreadyCurrent?true:await this.loadScene(snapshot.sceneId);
    if(ok)this.applySnapshot(snapshot);return ok;
  }
  private cancelPendingLoad(){
    if(this.current&&this.desiredScene===this.current.id&&this.lastStage.stage==="ready")return;
    this.generation++;this.request?.abort();this.request=undefined;
    // A saved scene is not renderable while its WebGL context is lost.
    // History/Reader restoration must preserve the visible recovery state.
    if(this.current&&!this.contextLost)this.announce({sceneId:this.current.id,stage:"ready"});
  }
  private validSnapshot(snapshot:CameraSnapshot){
    return (snapshot.sceneId==="world"||islandById.has(snapshot.sceneId))&&[...snapshot.position,...snapshot.target,snapshot.zoom,snapshot.fov??37].every(Number.isFinite)&&snapshot.position.length===3&&snapshot.target.length===3&&snapshot.zoom>0;
  }
  private applySnapshot(snapshot:CameraSnapshot){
    this.travel=null;this.controls.enableDamping=false;
    this.controls.update();
    this.camera.position.fromArray(snapshot.position);this.controls.target.fromArray(snapshot.target);
    this.camera.zoom=snapshot.zoom;this.camera.fov=snapshot.fov??37;this.camera.updateProjectionMatrix();
    this.selectedPlaceId=snapshot.selectedPlaceId;this.controls.update();this.controls.enableDamping=!this.reduced;
    this.saveSafePose();this.frameSamples=[];this.invalidate();
  }
  private configureScene(id:SceneId){
    const detail=id!=="world";
    this.controls.enablePan=detail;this.controls.minDistance=detail?5.5:10;this.controls.maxDistance=detail?105:57;
    this.controls.minPolarAngle=detail?.25:.35;this.controls.maxPolarAngle=detail?1.3:1.15;
    const radius=detail?48:25;this.sun.position.set(detail?-65:-18,detail?100:28,detail?-45:-12);
    this.sun.target.position.set(0,0,0);
    Object.assign(this.sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:detail?240:100});
    this.sun.shadow.camera.updateProjectionMatrix();
    (this.scene.fog as THREE.FogExp2).density=detail?.0018:.006;
    this.water.setShore(id,detail,()=>this.invalidate());
    this.ao.kernelRadius=detail?1.5:2.2;
    this.resize();
  }
  private setSceneCamera(id:SceneId){
    const spec=id==="world"?undefined:islandById.get(id);
    this.controls.enableDamping=false;this.controls.update();
    this.camera.fov=spec?50:37;this.camera.zoom=1;
    this.camera.position.copy(spec?vec(spec.entryCamera.position):new THREE.Vector3(this.mobile?23:12,this.mobile?30:18,this.mobile?35:24));
    this.controls.target.copy(spec?vec(spec.entryCamera.target):new THREE.Vector3(-1,.5,2));
    if(spec&&this.mobile){this.camera.position.sub(this.controls.target).multiplyScalar(1.2).add(this.controls.target);this.camera.fov=55;}
    this.camera.updateProjectionMatrix();this.controls.update();this.controls.enableDamping=!this.reduced;this.saveSafePose();this.invalidate();
  }
  focus(id?:ProjectId){
    if(this.sceneId!=="world")return;
    this.activeProject=id;this.selectedPlaceId=undefined;
    const anchor=id?anchors[id]:undefined;
    const position=anchor?new THREE.Vector3(anchor[0]+(this.mobile?12:10),this.mobile?16:13,anchor[2]+16):new THREE.Vector3(this.mobile?23:12,this.mobile?30:18,this.mobile?35:24);
    const target=anchor?new THREE.Vector3(anchor[0],1.6,anchor[2]):new THREE.Vector3(-1,.5,2);
    this.beginTravel([position],target,37);
  }
  focusPlace(placeId:string){
    const place=placeById.get(placeId);if(!place||this.sceneId!==place.islandId||!this.island)return;
    this.selectedPlaceId=placeId;
    const target=vec(place.cameraLookAt),position=vec(place.arrivalPose.position);
    this.camera.fov=place.arrivalPose.fovDegrees??50;this.camera.updateProjectionMatrix();
    const asset=this.island.assets.find(a=>a.id===place.interactionAssetId)??this.island.assets.find(a=>a.id===place.assetId);
    if(asset){
      const bounds=new THREE.Box3(vec(asset.worldAssemblyBounds.min),vec(asset.worldAssemblyBounds.max));
      const radius=bounds.getSize(new THREE.Vector3()).length()/2;
      const vertical=THREE.MathUtils.degToRad(this.camera.fov)/2;
      const horizontal=Math.atan(Math.tan(vertical)*this.camera.aspect*(this.mobile?.82:.72));
      const fit=radius/Math.sin(Math.min(vertical,horizontal))*1.18;
      const offset=position.clone().sub(target);if(offset.length()<fit)position.copy(target).add(offset.setLength(Math.min(105,fit)));
    }
    let points=[position];
    if(this.current&&this.current.solids.sweep(this.camera.position,position)<1)points=pathRoute(this.camera.position,position,this.island.paths);
    this.beginTravel(points,target,this.camera.fov);
    this.pulsePlace(place);this.resize();this.invalidate();
  }
  private beginTravel(points:THREE.Vector3[],target:THREE.Vector3,fov:number){
    if(this.reduced){
      const position=points[points.length-1];
      if(!this.current?.solids.contains(position)){this.camera.position.copy(position);this.controls.target.copy(target);this.camera.fov=fov;this.camera.updateProjectionMatrix();this.controls.update();this.saveSafePose();}
      this.travel=null;
    }else this.travel={route:cameraRoute(this.camera.position,points),target:target.clone(),startTarget:this.controls.target.clone(),fov,startFov:this.camera.fov,elapsedMs:0};
    this.invalidate();
  }
  reset(){this.selectedPlaceId=undefined;this.activeProject=undefined;this.travel=null;this.setSceneCamera(this.sceneId);}
  zoom(factor:number){
    if(!Number.isFinite(factor)||factor<=0)return;
    this.travel=null;const offset=this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance,this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset);this.enforceCamera();this.controls.update();this.invalidate();
  }
  pan(dx:number,dz:number){
    if(!this.island)return;this.travel=null;
    const right=new THREE.Vector3().subVectors(this.camera.position,this.controls.target).setY(0).normalize();
    const screenRight=new THREE.Vector3(right.z,0,-right.x),delta=screenRight.multiplyScalar(dx).addScaledVector(right,dz);
    this.camera.position.add(delta);this.controls.target.add(delta);this.enforceCamera();this.controls.update();this.invalidate();
  }
  rotate(delta:number){
    this.travel=null;const offset=this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),delta);
    this.camera.position.copy(this.controls.target).add(offset);this.enforceCamera();this.controls.update();this.invalidate();
  }
  private saveSafePose(){this.safePosition.copy(this.camera.position);this.safeTarget.copy(this.controls.target);}
  private enforceCamera(authoredTravel=false){
    const spec=this.island;if(!spec){this.saveSafePose();return;}
    const targetMoved=this.controls.target.distanceToSquared(this.safeTarget)>.000001;
    if(targetMoved&&!this.travel&&!authoredTravel){
      const valid=(p:THREE.Vector3)=>validPanPoint(p,spec.coast,[]);
      if(!valid(this.controls.target)){
        let corrected:THREE.Vector3;
        if(!valid(this.safeTarget)){
          // A look-at point can sit inside architecture. Only the eye collides with solids.
          // A restored target outside the coast may move continuously inward, never jump to a path.
          const clearance=(p:THREE.Vector3)=>edgeDistance(p.x,p.z,spec.coast)*(inPolygon(p.x,p.z,spec.coast)?1:-1);
          const inward=clearance(this.controls.target)>=clearance(this.safeTarget)-.00001;
          corrected=inward?this.controls.target.clone():this.safeTarget.clone();
        }
        else{
          let lo=0,hi=1;for(let i=0;i<12;i++){const t=(lo+hi)/2;if(valid(this.safeTarget.clone().lerp(this.controls.target,t)))lo=t;else hi=t;}
          corrected=this.safeTarget.clone().lerp(this.controls.target,lo);
        }
        const shift=corrected.clone().sub(this.controls.target);this.controls.target.copy(corrected);this.camera.position.add(shift);
      }
      this.selectedPlaceId=undefined;
    }
    const floor=inPolygon(this.camera.position.x,this.camera.position.z,spec.coast)?2.85:.45;
    this.camera.position.y=Math.max(this.camera.position.y,floor);
    const t=this.current?.solids.sweep(this.safePosition,this.camera.position)??1;
    if(t<1){this.camera.position.copy(this.safePosition.clone().lerp(this.camera.position,t));if(this.travel)this.travel=null;}
    this.saveSafePose();
  }
  setReduced(value:boolean){
    this.reduced=value;this.controls.enableDamping=!value;this.frameSamples=[];
    if(value&&this.travel){const t=this.travel;this.beginTravel(t.route.points,t.target,t.fov);}
    if(value){for(const m of this.motions){m.object.rotation.copy(m.base);m.activeSince=null;}this.clearPulse();}
    this.invalidate();
  }
  setPaused(value:boolean){
    this.paused=value;this.controls.enabled=!value&&!this.contextLost;this.frameSamples=[];this.lastRender=0;
    if(value){cancelAnimationFrame(this.frame);this.frame=0;}else{this.lastTick=performance.now();this.invalidate();}
    this.updateDiagnostics();
  }
  setQuality(value:"auto"|"high"|"low"){
    this.quality=value;this.frameSamples=[];this.automaticLight=false;this.applyQuality();
  }
  private applyQuality(){
    const light=this.quality==="low"||this.automaticLight;
    const ratio=Math.min(devicePixelRatio,light?1:this.quality==="high"?1.6:1.25);
    this.renderer.setPixelRatio(ratio);this.composer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled=this.quality!=="low";
    this.sun.shadow.map?.dispose();this.sun.shadow.map=null;
    const size=light?1024:2048;this.sun.shadow.mapSize.set(size,size);
    this.resize();this.invalidate();
  }
  private resize(){
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    this.mobile=width<=800;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
    if(width>900&&this.sceneId==="world")this.camera.setViewOffset(width,height,-width*.08,height*.16,width,height);
    else if(width>800&&this.sceneId!=="world"&&this.selectedPlaceId)this.camera.setViewOffset(width,height,width*.10,0,width,height);
    else if(width<=800&&this.sceneId!=="world")this.camera.setViewOffset(width,height,0,height*.17,width,height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();this.composer?.setSize(width,height);
    this.ao?.setSize(Math.ceil(width*this.renderer.getPixelRatio()*.65),Math.ceil(height*this.renderer.getPixelRatio()*.65));
    this.invalidate();
  }
  private onControlStart=()=>{this.interaction=true;this.travel=null;this.invalidate();};
  private onControlEnd=()=>{this.interaction=false;this.invalidate();};
  private onControlChange=()=>{this.dirty=true;this.invalidate();};
  private onDown=(event:PointerEvent)=>{this.hoveredPlaceId=undefined;this.pointerDown={x:event.clientX,y:event.clientY,time:performance.now()};};
  private pickAt(event:PointerEvent):{kind:"island";id:ProjectId}|{kind:"place";id:string}|undefined{
    if(!this.model||this.contextLost||this.paused)return;
    const bounds=this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),this.camera);
    for(const hit of this.raycaster.intersectObject(this.model,true)){
      if(!this.visibleInHierarchy(hit.object))continue;
      if(hit.object instanceof THREE.InstancedMesh&&hit.instanceId!==undefined){
        const selection=(hit.object.userData.instanceSelections as InstanceSelection[]|undefined)?.[hit.instanceId];
        if(this.sceneId==="world"&&selection?.atlasIslandId&&selection.atlasIslandId in anchors)return {kind:"island",id:selection.atlasIslandId as ProjectId};
        const id=selection?.interactionIds?.find(id=>placeById.get(id)?.islandId===this.sceneId);
        if(id)return {kind:"place",id};
      }
      let object:THREE.Object3D|null=hit.object;
      if(this.sceneId==="world"){
        while(object){
          const id=object.userData.atlasIslandId??(object.name.startsWith("project_")?object.name.slice(8):undefined);
          if(id&&id in anchors)return {kind:"island",id:id as ProjectId};object=object.parent;
        }
        return;
      }
      while(object){
        const ids=object.userData.interactionIds as string[]|undefined;
        const candidates=ids?.map(id=>placeById.get(id)).filter((p):p is KnowledgeObject=>!!p&&p.islandId===this.sceneId)??[];
        const specific=candidates.find(p=>p.parentId&&candidates.some(parent=>parent.id===p.parentId));
        const placeId=(specific??candidates[0])?.id;
        if(placeId)return {kind:"place",id:placeId};object=object.parent;
      }
      // The first visible solid occludes objects behind it.
      return;
    }
  }
  private onMove=(event:PointerEvent)=>{
    if(!this.motions.some(m=>m.kind==="clock")||event.pointerType!=="mouse"||this.pointerDown||this.interaction||performance.now()-this.hoverCheckedAt<80)return;
    this.hoverCheckedAt=performance.now();const hit=this.pickAt(event);
    this.hoveredPlaceId=hit?.kind==="place"?hit.id:undefined;
    this.renderer.domElement.style.cursor=hit?"pointer":"grab";
  };
  private onLeave=()=>{this.hoveredPlaceId=undefined;this.renderer.domElement.style.cursor="grab";};
  private onUp=(event:PointerEvent)=>{
    const down=this.pointerDown;this.pointerDown=undefined;
    if(!down||event.button!==0||Math.hypot(event.clientX-down.x,event.clientY-down.y)>7||performance.now()-down.time>650)return;
    const hit=this.pickAt(event);
    if(hit?.kind==="island")this.options.onSelect(hit.id);
    if(hit?.kind==="place"){this.focusPlace(hit.id);this.options.onSelectPlace?.(hit.id);}
  };
  private onKey=(event:KeyboardEvent)=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const step=event.shiftKey?3:1.2;
    const actions:Record<string,()=>void>={ArrowLeft:()=>this.pan(-step,0),ArrowRight:()=>this.pan(step,0),ArrowUp:()=>this.pan(0,-step),ArrowDown:()=>this.pan(0,step),q:()=>this.rotate(.14),Q:()=>this.rotate(.14),e:()=>this.rotate(-.14),E:()=>this.rotate(-.14),"+":()=>this.zoom(.85),"=":()=>this.zoom(.85),"-":()=>this.zoom(1.18),Home:()=>this.reset()};
    if(actions[event.key]){event.preventDefault();actions[event.key]();}
  };
  private onContextLost=(event:Event)=>{
    event.preventDefault();this.contextLost=true;this.request?.abort();this.generation++;
    cancelAnimationFrame(this.frame);this.frame=0;this.controls.enabled=false;
    const message="3D 화면의 연결이 끊겼습니다. 지도와 자료 읽기는 계속 사용할 수 있습니다.";
    this.announce({sceneId:this.lastStage.sceneId,stage:"error",message});this.options.onError(message);
    this.updateDiagnostics();
  };
  private onContextRestored=()=>{
    this.contextLost=false;this.controls.enabled=!this.paused;
    // Three reconstructs WebGLBackground with black during initGLContext.
    this.renderer.setClearColor("#0b343b");
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    const previous=this.environment;this.environment=pmrem.fromScene(room,.04);
    this.scene.environment=this.environment.texture;previous.dispose();room.dispose();pmrem.dispose();
    const snapshot=this.pendingSnapshot;this.pendingSnapshot=undefined;
    if(!this.current||this.current.id!==this.desiredScene){void this.loadScene(this.desiredScene).then(ok=>{if(ok&&snapshot?.sceneId===this.sceneId)this.applySnapshot(snapshot);});return;}
    if(snapshot?.sceneId===this.sceneId)this.applySnapshot(snapshot);
    this.announce({sceneId:this.sceneId,stage:"ready"});this.options.onReady();this.resize();this.invalidate();
  };
  private onVisibility=()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else{this.lastTick=performance.now();this.lastRender=0;this.invalidate();}};
  private invalidate(){
    this.dirty=true;if(this.frame||this.disposed||this.contextLost||document.hidden||this.paused)return;
    this.frame=requestAnimationFrame(this.animate);
  }
  private animate=(now:number)=>{
    this.frame=0;if(this.disposed||this.contextLost||this.paused||document.hidden)return;
    const callbackElapsed=now-this.lastTick;if(callbackElapsed>0&&callbackElapsed<500){this.callbackSamples.push(callbackElapsed);if(this.callbackSamples.length>360)this.callbackSamples.shift();}
    const cpuStart=performance.now();
    const dt=Math.min(callbackElapsed/1000,.08);this.lastTick=now;
    const before=this.camera.position.clone(),beforeTarget=this.controls.target.clone();
    const authoredTravel=!!this.travel;
    if(this.travel){
      const journey=this.travel;journey.elapsedMs+=dt*1000;
      const {eased,done}=sampleCameraRoute(journey.route,journey.elapsedMs,this.camera.position);
      this.controls.target.lerpVectors(journey.startTarget,journey.target,eased);
      this.camera.fov=THREE.MathUtils.lerp(journey.startFov,journey.fov,eased);this.camera.updateProjectionMatrix();
      if(done)this.travel=null;
    }
    this.controls.update();this.enforceCamera(authoredTravel);
    const moved=before.distanceToSquared(this.camera.position)+beforeTarget.distanceToSquared(this.controls.target)>.0000001;
    if(!this.reduced){this.animatedSeconds+=dt;this.water.setTime(this.animatedSeconds);this.windTime.value=this.animatedSeconds;this.marine?.update(this.animatedSeconds);this.animateDetails(now);}
    this.updateLods();this.sky.position.copy(this.camera.position);
    const interval=this.quality==="low"?1000/30:1000/60;
    if((now-this.lastRender>=interval-1)&&(this.dirty||moved||!this.reduced)){
      const elapsed=this.lastRender?now-this.lastRender:0;this.lastRender=now;this.renderer.info.reset();
      if(this.quality!=="low"&&!this.automaticLight)this.composer.render(dt);else this.renderer.render(this.scene,this.camera);
      this.cpuSamples.push(performance.now()-cpuStart);if(this.cpuSamples.length>360)this.cpuSamples.shift();
      this.frames++;this.dirty=false;
      if(this.quality==="auto"&&now-this.lastQualityReview>5000&&this.frameSamples.length>=120){
        this.lastQualityReview=now;
        const sorted=[...this.frameSamples].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];
        // Only lower render cost; keep the complete landscape and all knowledge objects.
        const cpu=this.cpuSamples.reduce((a,b)=>a+b,0)/this.cpuSamples.length;
        const mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
        const jitter=Math.sqrt(sorted.reduce((a,b)=>a+(b-mean)**2,0)/sorted.length)/mean;
        // A steady low callback cadence in an embedded/offscreen browser is not render overload.
        if(p95>28&&(cpu>8||jitter>.15)&&!this.automaticLight){this.automaticLight=true;this.applyQuality();}
      }
      if(now-this.lastProjection>=50){this.lastProjection=now;this.projectLabels();}
      if(this.model&&elapsed>0&&elapsed<500){this.frameSamples.push(elapsed);if(this.frameSamples.length>360)this.frameSamples.shift();}
      if(now-this.lastDiagnostic>500){this.lastDiagnostic=now;this.updateDiagnostics();}
    }
    if(!this.frame&&(!this.reduced||this.interaction||this.travel||moved||this.dirty))this.frame=requestAnimationFrame(this.animate);
  };
  private visibleInHierarchy(object:THREE.Object3D){let o:THREE.Object3D|null=object;while(o){if(!o.visible)return false;o=o.parent;}return true;}
  private projectLabels(){
    const width=this.host.clientWidth,height=this.host.clientHeight;
    const project=(point:readonly number[]):PlacePosition=>{
      const p=vec(point).project(this.camera);return {x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height,depth:p.z,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.96&&Math.abs(p.y)<.94};
    };
    if(this.sceneId==="world"){
      const positions:Record<string,PlacePosition>={};for(const [id,point]of Object.entries(anchors))positions[id]=project(point);
      this.options.onProject(positions);this.options.onPlaces?.({});
    }else if(this.island){
      this.options.onProject({});const positions:Record<string,PlacePosition>={};
      for(const place of [...this.island.places,...this.island.subInteractions]){
        const position=project(place.interactionAnchor);
        const clearance=position.visible?(this.current?.solids.sweep(this.camera.position,vec(place.interactionAnchor),.03)??1):1;
        if(clearance<.985)position.visible=false;
        positions[place.id]=position;
      }
      this.options.onPlaces?.(positions);
    }
  }
  private collectAnimatedObjects(){
    this.motions=[];this.lods=[];this.model?.traverse(object=>{
      if(object.userData.atlasFoliage||object.userData.atlasMotion){
        const axis=({X:"x",Y:"y",Z:"z"} as const)[object.userData.atlasMotionAxis as "X"|"Y"|"Z"]??"y";
        this.motions.push({object,base:object.rotation.clone(),kind:object.userData.atlasMotion??"foliage",phase:this.motions.length*1.731,axis,radians:THREE.MathUtils.degToRad(object.userData.atlasMotionDegrees??0),period:object.userData.atlasMotionPeriodSeconds??0,activeSince:null});
      }
      if(object.userData.atlasLodRoot){
        const levels=object.children.filter(c=>Number.isInteger(c.userData.atlasLodLevel)).sort((a,b)=>a.userData.atlasLodLevel-b.userData.atlasLodLevel);
        if(levels.length){const scale=object.getWorldScale(new THREE.Vector3());this.lods.push({root:object,levels,radius:(object.userData.atlasLodRadius??4)*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)),level:0});}
      }
    });
  }
  private updateLods(){
    const height=this.host.clientHeight,vertical=2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2);
    for(const lod of this.lods){
      const center=lod.root.getWorldPosition(new THREE.Vector3()),pixels=2*lod.radius/Math.max(.1,this.camera.position.distanceTo(center))/vertical*height;
      const near=lod.root.userData.atlasLodNearPixels??320,far=lod.root.userData.atlasLodFarPixels??96;
      const desired=pixels>near?0:pixels>far?1:2;
      const threshold=desired<lod.level?(lod.level===2?far:near)*1.15:(lod.level===0?near:far)*.85;
      if(desired!==lod.level&&(desired<lod.level?pixels>threshold:pixels<threshold))lod.level=Math.min(desired,lod.levels.length-1);
      lod.levels.forEach((object,i)=>object.visible=i===lod.level);
    }
  }
  private pulsePlace(place:KnowledgeObject){
    this.clearPulse();if(!this.model)return;
    this.model.traverse(object=>{
      if(object instanceof THREE.InstancedMesh){
        const selections=object.userData.instanceSelections as InstanceSelection[]|undefined;
        selections?.forEach((selection,index)=>{
          if(!selection.interactionIds?.includes(place.id))return;
          const original=new THREE.Color(1,1,1);if(object.instanceColor)object.getColorAt(index,original);
          object.setColorAt(index,new THREE.Color(1.28,1.15,.87));
          this.instancePulses.push({mesh:object,index,original,start:performance.now()});
        });
        if(object.instanceColor)object.instanceColor.needsUpdate=true;
        return;
      }
      if(!(object instanceof THREE.Mesh)||!(object.userData.interactionIds as string[]|undefined)?.includes(place.id))return;
      this.focusedMeshes.push(object);const original=object.material,temporary=(Array.isArray(original)?original:[original]).map(material=>{
        const clone=material.clone();applyAtlasMaterialTreatment(clone);if(clone instanceof THREE.MeshStandardMaterial){clone.emissive.set("#b28a4b");clone.emissiveIntensity=.16;}return clone;
      });
      object.material=Array.isArray(original)?temporary:temporary[0];this.pulses.push({mesh:object,original,temporary,start:performance.now()});
    });
  }
  private animateDetails(now:number){
    for(const motion of this.motions){
      if(motion.kind==="foliage")motion.object.rotation.z=motion.base.z+Math.sin(this.animatedSeconds*.8+motion.phase)*.004;
      else if(motion.kind==="clock"){
        const ids=motion.object.userData.interactionIds as string[]|undefined;
        const active=ids?.includes(this.hoveredPlaceId??"")||ids?.includes(this.selectedPlaceId??"");
        if(active){
          motion.activeSince??=this.animatedSeconds;
          motion.object.rotation[motion.axis]=motion.base[motion.axis]+Math.sin((this.animatedSeconds-motion.activeSince)*Math.PI*2/motion.period)*motion.radians;
        }else{motion.activeSince=null;motion.object.rotation.copy(motion.base);}
      }else if((motion.object.userData.interactionIds as string[]|undefined)?.includes(this.selectedPlaceId??"")){
        const start=this.pulses[0]?.start??now,phase=Math.min(1,(now-start)/1400);
        if(motion.kind==="turn")motion.object.rotation.y=motion.base.y+Math.sin(phase*Math.PI)*.18;
        if(motion.kind==="open")motion.object.rotation.z=motion.base.z-Math.sin(phase*Math.PI)*.16;
        if(motion.kind==="rotate")motion.object.rotation[motion.axis]=motion.base[motion.axis]+Math.sin(phase*Math.PI)*motion.radians;
      } else motion.object.rotation.copy(motion.base);
    }
    for(const pulse of this.pulses)for(const material of pulse.temporary)if(material instanceof THREE.MeshStandardMaterial)material.emissiveIntensity=.06+Math.max(0,1-(now-pulse.start)/1700)*.16;
    for(const pulse of this.instancePulses){
      pulse.mesh.setColorAt(pulse.index,pulse.original.clone().lerp(new THREE.Color(1.28,1.15,.87),Math.max(0,1-(now-pulse.start)/1700)));
      pulse.mesh.instanceColor!.needsUpdate=true;
    }
    const pulseStart=this.pulses[0]?.start??this.instancePulses[0]?.start;
    if(pulseStart!==undefined&&now-pulseStart>2000)this.clearPulse();
  }
  private clearPulse(){
    for(const p of this.pulses){p.mesh.material=p.original;for(const material of p.temporary)material.dispose();}
    for(const p of this.instancePulses){p.mesh.setColorAt(p.index,p.original);p.mesh.instanceColor!.needsUpdate=true;}
    for(const m of this.motions)if(m.kind!=="foliage"&&m.kind!=="clock")m.object.rotation.copy(m.base);
    this.pulses=[];this.instancePulses=[];this.focusedMeshes=[];
  }
  getMetrics(){
    const samples=[...this.frameSamples],sorted=[...samples].sort((a,b)=>a-b);
    const mean=samples.length?samples.reduce((s,n)=>s+n,0)/samples.length:null;
    return {sceneId:this.sceneId,stage:this.lastStage.stage,loaded:!!this.model,quality:this.quality,automaticLight:this.automaticLight,paused:this.paused,reduced:this.reduced,contextLost:this.contextLost,frames:this.frames,
      drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,
      callbackMs:this.callbackSamples.length?this.callbackSamples.reduce((s,n)=>s+n,0)/this.callbackSamples.length:null,cpuMs:this.cpuSamples.length?this.cpuSamples.reduce((s,n)=>s+n,0)/this.cpuSamples.length:null,frameMs:mean,fps:mean?1000/mean:null,p50:sorted.length?sorted[Math.floor(sorted.length*.5)]:null,p95:sorted.length?sorted[Math.floor(sorted.length*.95)]:null,
      frameSamples:samples,transitionMs:[...this.transitionSamples],loadMs:this.current?.loadMs??null,modelBytes:this.current?.bytes??null,collisionSolids:this.current?.solids.count??0,
      batching:this.model?.userData.batching,resourceOwnership:this.resources.counts,sceneCache:[...this.sceneCache.keys()],sharedTextureCount:this.sharedTextures.size,waterNormalReady:this.normalReady,marineStatus:this.marineStatus,landscapeStatus:this.current?.landscapeStatus??"not_required",lodGroups:this.lods.length,camera:this.camera.position.toArray(),target:this.controls.target.toArray(),selectedPlaceId:this.selectedPlaceId??null};
  }
  private updateDiagnostics(){
    const metrics=this.getMetrics();(window as unknown as {__ATLAS_DIAGNOSTICS__:unknown}).__ATLAS_DIAGNOSTICS__=metrics;
    this.renderer.domElement.dataset.runtime=JSON.stringify(metrics);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.generation++;this.request?.abort();cancelAnimationFrame(this.frame);
    this.observer.disconnect();this.clearPulse();this.controls.dispose();this.ktx2.dispose();
    const canvas=this.renderer.domElement;
    canvas.removeEventListener("pointerdown",this.onDown);canvas.removeEventListener("pointerup",this.onUp);canvas.removeEventListener("pointermove",this.onMove);canvas.removeEventListener("pointerleave",this.onLeave);canvas.removeEventListener("keydown",this.onKey);
    canvas.removeEventListener("webglcontextlost",this.onContextLost);canvas.removeEventListener("webglcontextrestored",this.onContextRestored);document.removeEventListener("visibilitychange",this.onVisibility);
    this.resources.dispose();this.sceneCache.clear();this.sharedTextures.clear();this.water.dispose();this.sky.geometry.dispose();this.sky.material.dispose();this.environment.dispose();this.sun.shadow.map?.dispose();
    this.ao.dispose();this.output.dispose();this.composer.dispose();this.renderer.dispose();canvas.remove();
    THREE.Cache.clear();THREE.Cache.enabled=this.previousCacheEnabled;
  }
}

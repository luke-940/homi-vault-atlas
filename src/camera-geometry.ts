import * as THREE from "three";
import { edgeDistance, inPolygon } from "./water";

type Triple = [number, number, number];
export type CollisionShape = {
  id: string; type: "box"|"capsule"|"convex";
  center?: Triple; halfSize?: Triple; rotationY?: number;
  start?: Triple; end?: Triple; radius?: number;
  vertices?: Triple[]; triangles?: [number,number,number][];
};
type Solid = {bounds:THREE.Box3;planes?:THREE.Plane[];capsule?:{a:THREE.Vector3;b:THREE.Vector3;radius:number}};
type SolidNode = {bounds:THREE.Box3;items?:Solid[];left?:SolidNode;right?:SolidNode};
function solidTree(items:Solid[]):SolidNode|undefined {
  if(!items.length)return;
  const bounds=new THREE.Box3();for(const item of items)bounds.union(item.bounds);
  if(items.length<=8)return {bounds,items};
  const size=bounds.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2;
  const sorted=items.slice().sort((a,b)=>a.bounds.min.getComponent(axis)+a.bounds.max.getComponent(axis)-b.bounds.min.getComponent(axis)-b.bounds.max.getComponent(axis));
  const middle=Math.floor(sorted.length/2);
  return {bounds,left:solidTree(sorted.slice(0,middle)),right:solidTree(sorted.slice(middle))};
}
const vector=(a:readonly number[])=>new THREE.Vector3(a[0],a[1],a[2]);

function segmentDistanceSq(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3){
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c);
  const A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;
  let s=den>1e-12?THREE.MathUtils.clamp((B*E-C*D)/den,0,1):0;
  let t=C>1e-12?THREE.MathUtils.clamp((B*s+E)/C,0,1):0;
  s=A>1e-12?THREE.MathUtils.clamp((B*t-D)/A,0,1):0;
  t=C>1e-12?THREE.MathUtils.clamp((B*s+E)/C,0,1):0;
  return w.addScaledVector(u,s).addScaledVector(v,-t).lengthSq();
}

export class CameraSolids {
  private solids:Solid[]=[];
  private tree?:SolidNode;
  private queryStats={nodes:0,solidBounds:0,candidates:0};
  get lastQuery(){return {...this.queryStats};}
  private *candidates(bounds:THREE.Box3):Generator<Solid>{
    this.queryStats={nodes:0,solidBounds:0,candidates:0};
    if(!this.tree)return;
    const stack=[this.tree];
    while(stack.length){
      const node=stack.pop()!;this.queryStats.nodes++;
      if(!bounds.intersectsBox(node.bounds))continue;
      if(node.items)for(const solid of node.items){
        this.queryStats.solidBounds++;
        if(bounds.intersectsBox(solid.bounds)){this.queryStats.candidates++;yield solid;}
      }
      else {if(node.right)stack.push(node.right);if(node.left)stack.push(node.left);}
    }
  }
  constructor(shapes:CollisionShape[]=[]){
    for(const shape of shapes){
      if(shape.type==="box"&&shape.center&&shape.halfSize){
        const center=vector(shape.center),half=vector(shape.halfSize),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),shape.rotationY??0);
        const planes:THREE.Plane[]=[],corners:THREE.Vector3[]=[];
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
          const normal=new THREE.Vector3().setComponent(axis,sign).applyQuaternion(q);
          planes.push(new THREE.Plane(normal,-normal.dot(center)-half.getComponent(axis)));
        }
        for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(new THREE.Vector3(x*half.x,y*half.y,z*half.z).applyQuaternion(q).add(center));
        this.solids.push({planes,bounds:new THREE.Box3().setFromPoints(corners)});
      }else if(shape.type==="capsule"&&shape.start&&shape.end&&shape.radius){
        const a=vector(shape.start),b=vector(shape.end),radius=shape.radius;
        this.solids.push({capsule:{a,b,radius},bounds:new THREE.Box3().setFromPoints([a,b]).expandByScalar(radius)});
      }else if(shape.type==="convex"&&shape.vertices?.length&&shape.triangles?.length){
        const points=shape.vertices.map(vector),center=points.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
        const planes=shape.triangles.map(indices=>{
          const plane=new THREE.Plane().setFromCoplanarPoints(points[indices[0]],points[indices[1]],points[indices[2]]);
          if(plane.distanceToPoint(center)>0)plane.negate();
          return plane;
        });
        this.solids.push({planes,bounds:new THREE.Box3().setFromPoints(points)});
      }
    }
    this.tree=solidTree(this.solids);
  }
  get count(){return this.solids.length;}
  /** Earliest contact for a .45 m camera body, including a movement that crosses and exits a wall. */
  sweep(from:THREE.Vector3,to:THREE.Vector3,radius=.45){
    let earliest=1;
    const movementBounds=new THREE.Box3().setFromPoints([from,to]).expandByScalar(radius);
    for(const solid of this.candidates(movementBounds)){
      if(solid.planes){
        let entry=0,exit=1,fromInside=true,miss=false;
        for(const plane of solid.planes){
          const a=plane.distanceToPoint(from)-radius,b=plane.distanceToPoint(to)-radius;
          if(a>0)fromInside=false;
          if(a>0&&b>0){miss=true;break;}
          if(a<=0&&b<=0)continue;
          const t=a/(a-b);
          if(a>b)entry=Math.max(entry,t);else exit=Math.min(exit,t);
          if(entry>exit){miss=true;break;}
        }
        if(!miss&&!fromInside)earliest=Math.min(earliest,entry);
        if(fromInside){
          const nearest=solid.planes.reduce((a,b)=>a.distanceToPoint(from)>b.distanceToPoint(from)?a:b);
          // Recovery may leave the nearest face, never continue deeper and exit the opposite wall.
          if(nearest.distanceToPoint(to)<nearest.distanceToPoint(from)-1e-8)earliest=0;
        }
      }else if(solid.capsule){
        const c=solid.capsule,r=radius+c.radius;
        if(segmentDistanceSq(from,to,c.a,c.b)>r*r)continue;
        if(segmentDistanceSq(from,from,c.a,c.b)<=r*r){
          const axis=c.b.clone().sub(c.a),t=THREE.MathUtils.clamp(from.clone().sub(c.a).dot(axis)/(axis.lengthSq()||1),0,1);
          const outward=from.clone().sub(c.a.clone().addScaledVector(axis,t));
          if(outward.dot(to.clone().sub(from))< -1e-8)earliest=0;
          continue;
        }
        let lo=0,hi=1;
        for(let i=0;i<14;i++){
          const mid=(lo+hi)/2,p=from.clone().lerp(to,mid);
          if(segmentDistanceSq(from,p,c.a,c.b)<=r*r)hi=mid;else lo=mid;
        }
        earliest=Math.min(earliest,hi);
      }
    }
    return Math.max(0,earliest-(earliest<1?.002:0));
  }
  contains(point:THREE.Vector3,radius=.45){
    // The camera sphere must overlap the real solid bounds. Without this,
    // offset planes of a thin acute triangle can mark far-away space as solid.
    const query=new THREE.Box3(point.clone(),point.clone()).expandByScalar(radius);
    for(const s of this.candidates(query)){
      if(s.planes?s.planes.every(p=>p.distanceToPoint(point)<=radius):
        !!s.capsule&&segmentDistanceSq(point,point,s.capsule.a,s.capsule.b)<=Math.pow(radius+s.capsule.radius,2))return true;
    }
    return false;
  }
}

export function validPanPoint(point:THREE.Vector3,coast:ReadonlyArray<readonly number[]>,footprints:ReadonlyArray<ReadonlyArray<readonly number[]>>){
  if(!inPolygon(point.x,point.z,coast)||edgeDistance(point.x,point.z,coast)<1.85)return false;
  return footprints.every(p=>!inPolygon(point.x,point.z,p)&&edgeDistance(point.x,point.z,p)>=1.85);
}

export function nearestPathPoint(point:THREE.Vector3,paths:ReadonlyArray<{points:ReadonlyArray<readonly number[]>}>){
  let best=point.clone(),distance=Infinity;
  for(const path of paths)for(let i=0;i<path.points.length-1;i++){
    const a=path.points[i],b=path.points[i+1];
    const ax=a[0],az=a[a.length-1],bx=b[0],bz=b[b.length-1],dx=bx-ax,dz=bz-az;
    const t=THREE.MathUtils.clamp(((point.x-ax)*dx+(point.z-az)*dz)/(dx*dx+dz*dz||1),0,1);
    const p=new THREE.Vector3(ax+t*dx,2.4,az+t*dz),d=p.distanceToSquared(point);
    if(d<distance){distance=d;best=p;}
  }
  return best;
}

/** Connected authored path segments; shortest route used for deliberate place-to-place travel. */
export function pathRoute(from:THREE.Vector3,to:THREE.Vector3,paths:ReadonlyArray<{points:ReadonlyArray<readonly number[]>}>){
  const points:THREE.Vector3[]=[],edges:Map<number,number[]> = new Map();
  const index=(p:readonly number[])=>{
    const v=new THREE.Vector3(p[0],2.4,p[p.length-1]);
    let i=points.findIndex(q=>q.distanceToSquared(v)<.01);
    if(i<0){i=points.length;points.push(v);edges.set(i,[]);}return i;
  };
  for(const path of paths)for(let i=0;i<path.points.length-1;i++){
    const a=index(path.points[i]),b=index(path.points[i+1]);edges.get(a)!.push(b);edges.get(b)!.push(a);
  }
  if(!points.length)return [to.clone()];
  const nearest=(p:THREE.Vector3)=>points.reduce((best,q,i)=>Math.hypot(q.x-p.x,q.z-p.z)<Math.hypot(points[best].x-p.x,points[best].z-p.z)?i:best,0);
  const start=nearest(from),end=nearest(to),cost=points.map(()=>Infinity),prev=points.map(()=>-1),remaining=new Set(points.map((_,i)=>i));cost[start]=0;
  while(remaining.size){
    let current=-1;for(const i of remaining)if(current<0||cost[i]<cost[current])current=i;
    if(current<0||cost[current]===Infinity)break;remaining.delete(current);if(current===end)break;
    for(const next of edges.get(current)??[]){const d=cost[current]+points[current].distanceTo(points[next]);if(d<cost[next]){cost[next]=d;prev[next]=current;}}
  }
  if(cost[end]===Infinity)return [to.clone()];
  const result:THREE.Vector3[]=[];for(let i=end;i>=0;i=prev[i]){result.unshift(points[i].clone());if(i===start)break;}
  const height=Math.max(from.y,to.y,7);
  return result.map(p=>p.setY(height)).concat([to.clone()]);
}

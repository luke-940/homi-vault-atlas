import * as THREE from "three";

export type CameraRoute={points:THREE.Vector3[];distances:number[];length:number;durationMs:number};
/** Distance along the route sets travel time; adding curve samples never adds waiting time. */
export function cameraRoute(start:THREE.Vector3,waypoints:THREE.Vector3[]):CameraRoute {
  const points=[start.clone()];
  for(const point of waypoints)if(point.distanceToSquared(points[points.length-1])>1e-12)points.push(point.clone());
  const distances=[0];
  for(let i=1;i<points.length;i++)distances.push(distances[i-1]+points[i-1].distanceTo(points[i]));
  const length=distances[distances.length-1];
  return {points,distances,length,durationMs:THREE.MathUtils.clamp(900+length*35,900,3200)};
}
export function sampleCameraRoute(route:CameraRoute,elapsedMs:number,out:THREE.Vector3){
  const progress=THREE.MathUtils.clamp(elapsedMs/route.durationMs,0,1);
  const eased=progress*progress*(3-2*progress),distance=eased*route.length;
  if(progress===1||route.points.length===1){out.copy(route.points[route.points.length-1]);return {eased,done:progress===1};}
  let lo=1,hi=route.distances.length-1;
  while(lo<hi){const mid=(lo+hi)>>>1;if(route.distances[mid]<distance)lo=mid+1;else hi=mid;}
  const span=route.distances[lo]-route.distances[lo-1];
  out.lerpVectors(route.points[lo-1],route.points[lo],span?(distance-route.distances[lo-1])/span:0);
  return {eased,done:false};
}

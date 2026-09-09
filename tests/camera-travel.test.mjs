import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Vector3} from 'three';
const bundle=await build({entryPoints:[new URL('../src/camera-travel.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {cameraRoute,sampleCameraRoute}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const v=(x,y,z)=>new Vector3(x,y,z);
test('a route completes at the same time and position regardless of waypoint density',()=>{
 const sparse=cameraRoute(v(0,7,0),[v(10,7,0),v(10,7,10)]);
 const dense=cameraRoute(v(0,7,0),[...Array.from({length:1000},(_,i)=>v((i+1)/100,7,0)),...Array.from({length:1000},(_,i)=>v(10,7,(i+1)/100))]);
 assert.ok(Math.abs(sparse.durationMs-dense.durationMs)<1e-8);
 for(let ms=0;ms<=1600;ms+=25){const a=v(0,0,0),b=v(0,0,0);sampleCameraRoute(sparse,ms,a);sampleCameraRoute(dense,ms,b);assert.ok(a.distanceTo(b)<1e-8);}
 const out=v(0,0,0);assert.equal(sampleCameraRoute(dense,dense.durationMs,out).done,true);assert.deepEqual(out.toArray(),[10,7,10]);
});
test('distance sampling follows the bend and handles repeated or stationary points',()=>{
 const route=cameraRoute(v(0,7,0),[v(0,7,0),v(10,7,0),v(10,7,10)]),out=v(0,0,0);
 sampleCameraRoute(route,route.durationMs/2,out);assert.deepEqual(out.toArray(),[10,7,0]);
 const stationary=cameraRoute(v(1,2,3),[v(1,2,3)]);sampleCameraRoute(stationary,30,out);assert.deepEqual(out.toArray(),[1,2,3]);
 assert.equal(cameraRoute(v(0,0,0),[v(1000,0,0)]).durationMs,3200);
});

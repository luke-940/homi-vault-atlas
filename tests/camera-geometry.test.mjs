import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Vector3} from 'three';
const bundle=await build({entryPoints:[new URL('../src/camera-geometry.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {CameraSolids}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const v=(x,y,z)=>new Vector3(x,y,z);
const box=(id,center,halfSize,rotationY=0)=>({id,type:'box',center,halfSize,rotationY});

test('door opening, walls and recovery from an embedded starting point remain distinct',()=>{
 const gate=new CameraSolids([box('left',[-3,3,0],[.6,3,.7]),box('right',[3,3,0],[.6,3,.7]),box('lintel',[0,6,0],[3.6,.5,.7])]);
 assert.equal(gate.sweep(v(0,2,5),v(0,2,-5)),1);
 assert.ok(gate.sweep(v(3,2,5),v(3,2,-5))<.4);
 assert.equal(gate.contains(v(0,2,0)),false);
 const wall=new CameraSolids([box('wall',[0,0,0],[1,1,1])]);
 assert.equal(wall.sweep(v(1.2,0,0),v(2,0,0)),1);
 assert.equal(wall.sweep(v(1.2,0,0),v(-2,0,0)),0);
});

test('many distant solids do not require testing every solid for a local camera movement',()=>{
 const shapes=[];for(let x=0;x<85;x++)for(let z=0;z<80;z++)shapes.push(box(`solid-${x}-${z}`,[x*5,1,z*5],[.4,1,.4]));
 const scene=new CameraSolids(shapes);
 assert.equal(scene.count,6800);
 assert.ok(scene.sweep(v(-2,1,0),v(2,1,0))<.3);
 assert.ok(scene.lastQuery.solidBounds<80,JSON.stringify(scene.lastQuery));
 assert.equal(scene.contains(v(0,1,0)),true);
 assert.ok(scene.lastQuery.solidBounds<80,JSON.stringify(scene.lastQuery));
 assert.equal(scene.contains(v(-20,1,-20)),false);
 assert.equal(scene.lastQuery.solidBounds,0);
});

test('an acute thin roof triangle cannot mark distant empty space as occupied',()=>{
 const roof={id:'thin-roof',type:'convex',vertices:[[0,-.05,0],[10,-.05,0],[10,-.05,.001],[0,.05,0],[10,.05,0],[10,.05,.001]],triangles:[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]]};
 const scene=new CameraSolids([roof]);
 assert.equal(scene.contains(v(-2,0,0)),false);
 assert.equal(scene.contains(v(5,0,.0002)),true);
 assert.equal(scene.sweep(v(-3,0,0),v(-2,0,0)),1);
});

test('mixed scene traversal agrees with independent per-solid contact checks',()=>{
 const shapes=[box('rotated',[1,2,-2],[3,2,.3],Math.PI/4),box('low',[5,.5,2],[.5,.5,2]),{id:'trunk',type:'capsule',start:[-4,0,1],end:[-3,7,1],radius:.3}];
 const scene=new CameraSolids(shapes),singles=shapes.map(s=>new CameraSolids([s]));let state=311;
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<240;i++){
  const a=v(rand()*20-10,rand()*9,rand()*20-10),b=v(rand()*20-10,rand()*9,rand()*20-10);
  assert.ok(Math.abs(scene.sweep(a,b)-Math.min(...singles.map(s=>s.sweep(a,b))))<1e-12);
  assert.equal(scene.contains(a),singles.some(s=>s.contains(a)));
 }
});

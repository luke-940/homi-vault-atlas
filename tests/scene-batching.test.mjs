import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchDecorations} from '../src/scene-batching.ts';

test('static batching preserves quantized glTF vertices under island and object transforms',()=>{
 const root=new THREE.Group();root.position.set(55,0,-30);
 const material=new THREE.MeshStandardMaterial();
 for(const x of [8,14,22]){
  const geometry=new THREE.BoxGeometry(2,2,2),position=geometry.getAttribute('position');
  geometry.setAttribute('position',new THREE.Int16BufferAttribute(Array.from(position.array,v=>Math.round(v*32767)),3,true));
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,3,7);mesh.rotation.y=.4;mesh.scale.set(2,3,4);root.add(mesh);
 }
 root.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(root);
 batchDecorations(root);root.updateMatrixWorld(true);const after=new THREE.Box3().setFromObject(root);
 assert.equal(root.userData.batching.staticBatches,1);
 assert.ok(before.min.distanceTo(after.min)<1e-4);
 assert.ok(before.max.distanceTo(after.max)<1e-4);
 const mesh=root.children.find(o=>o.isMesh);assert.ok(mesh.geometry.getAttribute('position').array instanceof Float32Array);
 root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});material.dispose();
});

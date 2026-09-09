import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyAtlasMaterialTreatment,BARK_TREATMENT_VERSION} from '../src/material-treatment.ts';

test('bark albedo correction preserves source maps, UV transform, normals and physical response',()=>{
 const map=new THREE.Texture(),normal=new THREE.Texture(),roughness=new THREE.Texture();
 map.repeat.set(2,3);map.offset.set(.15,.2);map.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshStandardMaterial({name:'m_bark',map,normalMap:normal,roughnessMap:roughness,roughness:.82,metalness:0,color:'#D3B696'});
 material.normalScale.set(.13,.14);const before=material.toJSON();
 applyAtlasMaterialTreatment(material);
 assert.equal(material.map,map);assert.equal(material.normalMap,normal);assert.equal(material.roughnessMap,roughness);
 assert.deepEqual(material.normalScale.toArray(),[.13,.14]);assert.equal(material.roughness,.82);
 assert.deepEqual(map.repeat.toArray(),[2,3]);assert.deepEqual(map.offset.toArray(),[.15,.2]);
 assert.deepEqual(material.emissive.toArray(),[0,0,0]);assert.deepEqual(material.color.toArray(),[1,1,1]);
 const shader={fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};material.onBeforeCompile(shader,{});
 assert.ok(shader.fragmentShader.includes('sampledDiffuseColor.rgb'));
 assert.ok(shader.fragmentShader.includes('#include <normal_fragment_maps>'));
 assert.equal((shader.fragmentShader.match(/diffuseColor \*= sampledDiffuseColor;/g)||[]).length,1);
 assert.equal(material.customProgramCacheKey(),BARK_TREATMENT_VERSION+"-tree");
 assert.notEqual(before.color,material.toJSON().color);
 const clone=material.clone();applyAtlasMaterialTreatment(clone);assert.equal(clone.customProgramCacheKey(),BARK_TREATMENT_VERSION+"-tree");
 assert.throws(()=>material.onBeforeCompile({fragmentShader:'changed'},{}),/contract changed/);
});

test('wood, stone and leaf materials are unaffected by the bark-only correction',()=>{
 for(const name of ['m_wood','m_stone','m_leaf']){
  const material=new THREE.MeshStandardMaterial({name,color:'#72664a',roughness:.73});const before=material.toJSON(),hook=material.onBeforeCompile;
  applyAtlasMaterialTreatment(material);assert.deepEqual(material.toJSON(),before);assert.equal(material.onBeforeCompile,hook);
 }
});


test('research bark preserves its pigment and emits a floating-point shader gain with a distinct cache key',()=>{
 const map=new THREE.Texture(),normal=new THREE.Texture();map.repeat.set(2,3);map.offset.set(.15,.2);
 const material=new THREE.MeshStandardMaterial({name:'m_research_bark',map,normalMap:normal,color:'#796345',roughness:.92,metalness:0});
 material.normalScale.setScalar(.12);const pigment=material.color.toArray();
 applyAtlasMaterialTreatment(material);
 assert.deepEqual(material.color.toArray(),pigment);assert.equal(material.map,map);assert.equal(material.normalMap,normal);
 assert.deepEqual(map.repeat.toArray(),[2,3]);assert.deepEqual(map.offset.toArray(),[.15,.2]);
 assert.deepEqual(material.normalScale.toArray(),[.12,.12]);assert.equal(material.roughness,.92);assert.equal(material.metalness,0);
 const shader={fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};material.onBeforeCompile(shader,{});
 const gainExpression=shader.fragmentShader.split('\n').find(line=>line.includes('vec3 barkAlbedo='));
 assert.match(gainExpression,/\*20\.0\*vec3/);assert.doesNotMatch(gainExpression,/\*20\*vec3/);
 assert.ok(shader.fragmentShader.includes('#include <normal_fragment_maps>'));
 assert.equal(material.customProgramCacheKey(),BARK_TREATMENT_VERSION+'-research');
 const tree=new THREE.MeshStandardMaterial({name:'m_bark'});applyAtlasMaterialTreatment(tree);
 assert.notEqual(material.customProgramCacheKey(),tree.customProgramCacheKey());
});

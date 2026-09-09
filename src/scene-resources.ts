import * as THREE from "three";

type Disposable=THREE.BufferGeometry|THREE.Material|THREE.Texture;
/** Each root holds one reference to each shared resource, regardless of mesh count. */
export class SceneResources {
  private references=new Map<Disposable,number>();
  private roots=new Map<THREE.Object3D,Set<Disposable>>();
  private images=new Map<object,number>();
  acquire(root:THREE.Object3D){
    if(this.roots.has(root))return;
    const set=new Set<Disposable>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      if(object.geometry)set.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        set.add(material);
        for(const value of Object.values(material))if(value instanceof THREE.Texture)set.add(value);
      }
    });
    for(const resource of set){
      const count=this.references.get(resource)??0;this.references.set(resource,count+1);
      if(count===0&&resource instanceof THREE.Texture&&typeof resource.source?.data==="object"&&resource.source.data){
        const image=resource.source.data;this.images.set(image,(this.images.get(image)??0)+1);
      }
    }
    this.roots.set(root,set);
  }
  release(root:THREE.Object3D){
    const set=this.roots.get(root);if(!set)return;this.roots.delete(root);
    for(const resource of set){
      const count=(this.references.get(resource)??1)-1;
      if(count>0){this.references.set(resource,count);continue;}
      this.references.delete(resource);resource.dispose();
      if(resource instanceof THREE.Texture&&typeof resource.source?.data==="object"&&resource.source.data){
        const image=resource.source.data,count=(this.images.get(image)??1)-1;
        if(count>0)this.images.set(image,count);else{
          this.images.delete(image);
          const closable=image as {close?:()=>void};if(typeof closable.close==="function")closable.close();
        }
      }
    }
  }
  discard(root:THREE.Object3D){this.acquire(root);this.release(root);}
  dispose(){for(const root of [...this.roots.keys()])this.release(root);}
  get counts(){return {roots:this.roots.size,resources:this.references.size,images:this.images.size};}
}

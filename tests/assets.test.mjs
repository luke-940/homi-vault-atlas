import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { inspectGLB, inspectImage, inspectKTX2, inspectCollision, validateAssets, WEBP_SRGB_ICC_PROFILE } from "../scripts/validate-assets.mjs";

const pad = (buffer, byte = 0) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, byte)]);
function crc(bytes) { let value = 0xffffffff; for (const b of bytes) { value ^= b; for (let i = 0; i < 8; i++) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1; } return (value ^ 0xffffffff) >>> 0; }
function pngChunk(type, body) { const result = Buffer.alloc(body.length + 12); result.writeUInt32BE(body.length); result.write(type, 4, 4, "ascii"); body.copy(result, 8); result.writeUInt32BE(crc(result.subarray(4, body.length + 8)), body.length + 8); return result; }
function png(extra = []) { const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2; return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", header), ...extra, pngChunk("IDAT", deflateSync(Buffer.from([0, 120, 140, 180]))), pngChunk("IEND", Buffer.alloc(0))]); }
function glb(change = () => {}, image = png()) {
  const positions = Buffer.alloc(36); [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => positions.writeFloatLE(v, i * 4));
  const uv = Buffer.alloc(24); [0, 0, 1, 0, 0, 1].forEach((v, i) => uv.writeFloatLE(v, i * 4));
  const indices = Buffer.from([0, 0, 1, 0, 2, 0]), prefix = Buffer.concat([positions, uv, pad(indices)]), bin = Buffer.concat([prefix, image]);
  const json = {
    asset: { version: "2.0", generator: "HomiAtlasFixture" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "island_groot", children: [1], extras: { atlasIslandId: "groot" } }, { name: "part_panel", mesh: 0, extras: { atlasInstanceId: "groot-guide", atlasPartId: "panel", interactionIds: ["pl_fixture"] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: 3, mimeType: "image/png" }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 6 }, { buffer: 0, byteOffset: prefix.length, byteLength: image.length }], buffers: [{ byteLength: bin.length }],
  };
  change(json, bin); const text = pad(Buffer.from(JSON.stringify(json)), 32), binary = pad(bin), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + text.length + binary.length, 8); jh.writeUInt32LE(text.length); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4); return Buffer.concat([head, jh, text, bh, binary]);
}
const place = { id: "pl_fixture", assetId: "groot-guide", interactionAssetId: "groot-guide", physicalPartIds: ["panel"] };
const fails = (fn, code) => assert.throws(fn, error => error.code === code);

test("actual physical mesh identity and UV contract can be checked without visual claims", () => {
  const result = inspectGLB(glb(), { places: [place] }); assert.equal(result.nodes, 2); assert.equal(result.images[0].width, 1); assert.equal(result.actualRaycast, "not_checked");
});
test("embedded PNG provenance chunks are rejected before metadata can be logged", () => {
  fails(() => inspectGLB(glb(() => {}, png([pngChunk("iTXt", Buffer.from("ExampleHiddenTerm"))]))), "IMAGE_PRIVATE_METADATA");
});
test("PNG CRC, compressed payload and trailing bytes are independently checked", () => {
  const corrupt = png(); corrupt[corrupt.length - 1] ^= 1; fails(() => inspectImage(corrupt, "image/png"), "PNG_CRC");
  fails(() => inspectImage(Buffer.concat([png(), Buffer.from([0])]), "image/png"), "PNG_TRAILING_DATA");
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const bad = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", header), pngChunk("IDAT", Buffer.from([1, 2, 3])), pngChunk("IEND", Buffer.alloc(0))]);
  fails(() => inspectImage(bad, "image/png"), "PNG_DEFLATE");
});
test("private patterns inspect GLB keys and values while errors reveal no matched text", () => {
  const hidden = "ExampleHiddenTerm", privatePatterns = [{ id: "policy-1", expression: new RegExp(hidden, "u") }];
  const result = validateAssets([{ path: "assets/model.glb", body: glb(j => { j.nodes[0].extras[hidden] = true; }) }], { privatePatterns });
  assert.equal(result.valid, false); assert.equal(result.issues[0].code, "PRIVATE_PUBLICATION_RULE"); assert.ok(!JSON.stringify(result).includes(hidden));
});
test("encoded local paths are rejected even without a private dictionary", () => {
  const localPath = ["", "Users", "example", "source"].join("/");
  fails(() => inspectGLB(glb(j => { j.nodes[0].extras.atlasPartId = encodeURIComponent(localPath); })), "PRIVATE_PATH_URI_OR_CREDENTIAL");
});
test("missing physical part, missing UV and nonfinite geometry cannot pass", () => {
  fails(() => inspectGLB(glb(), { places: [{ ...place, physicalPartIds: ["different-panel"] }] }), "GLB_PHYSICAL_PART_DIFFERENT");
  fails(() => inspectGLB(glb(j => { delete j.meshes[0].primitives[0].attributes.TEXCOORD_0; })), "GLB_POSITION_UV_CONTRACT");
  fails(() => inspectGLB(glb((j, bin) => { bin.writeFloatLE(NaN); })), "GLB_NONFINITE_ATTRIBUTE");
});
test("invalid indices, cycles and external image references are rejected", () => {
  fails(() => inspectGLB(glb((j, bin) => { bin.writeUInt16LE(9, 60); })), "GLB_INDEX_OUT_OF_RANGE");
  fails(() => inspectGLB(glb(j => { j.nodes[1].children = [0]; })), "GLB_NODE_CYCLE");
  fails(() => inspectGLB(glb(j => { j.images[0].uri = "elsewhere.png"; })), "GLB_EXTERNAL_IMAGE_PATH");
});
test("motion metadata belongs to a named empty pivot", () => {
  fails(() => inspectGLB(glb(j => { j.nodes[1].extras.atlasMotion = "open"; })), "GLB_MOTION_REQUIRES_EMPTY_PIVOT");
  assert.equal(inspectGLB(glb(j => { j.nodes[0].extras.atlasMotion = "open"; })).nodes, 2);
});
test("authored instrument axes and degrees are explicit and cannot silently become a generic turn",()=>{
 const motion={atlasMotion:"rotate",atlasMotionAxis:"X",atlasMotionDegrees:8,interactionIds:["pl_fixture"]};
 assert.equal(inspectGLB(glb(j=>Object.assign(j.nodes[0].extras,motion))).nodes,2);
 for(const change of [{atlasMotionAxis:"invalid"},{atlasMotionDegrees:0},{atlasMotionDegrees:31},{interactionIds:[]}])fails(()=>inspectGLB(glb(j=>Object.assign(j.nodes[0].extras,motion,change))),"GLB_ROTATE_MOTION_CONTRACT");
 fails(()=>inspectGLB(glb(j=>Object.assign(j.nodes[0].extras,motion,{atlasMotion:"turn"}))),"GLB_ROTATE_MOTION_CONTRACT");
 fails(()=>inspectGLB(glb(j=>Object.assign(j.nodes[1].extras,motion))),"GLB_MOTION_REQUIRES_EMPTY_PIVOT");
});
test("symbolic clock motion preserves declared decorative periods and cannot become a real-time clock",()=>{
 const motion={atlasMotion:"clock",atlasMotionAxis:"Z",atlasMotionDegrees:5,atlasMotionPeriodSeconds:7,interactionIds:["pl_fixture"]};
 for(const period of [5,7,11])assert.equal(inspectGLB(glb(j=>Object.assign(j.nodes[0].extras,motion,{atlasMotionPeriodSeconds:period}))).nodes,2);
 for(const change of [{atlasMotionAxis:"Y"},{atlasMotionDegrees:6},{atlasMotionPeriodSeconds:60},{atlasMotionPeriodSeconds:0},{atlasMotion:"rotate"}])fails(()=>inspectGLB(glb(j=>Object.assign(j.nodes[0].extras,motion,change))),"GLB_CLOCK_MOTION_CONTRACT");
});
function webp(extraType) {
  // A decoded-and-verified lossless 1x1 RGB pixel, not a product screenshot.
  const source = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQxuKVtv+BiOh/AAA=", "base64");
  if (!extraType) return source;
  const data = Buffer.from("fixture"), chunk = Buffer.alloc(8); chunk.write(extraType); chunk.writeUInt32LE(data.length, 4);
  const output = Buffer.concat([source, chunk, data, Buffer.alloc(data.length % 2)]); output.writeUInt32LE(output.length - 8, 4); return output;
}
test("map WebP metadata and appended data fail; container check makes no pixel claim", () => {
  assert.equal(inspectImage(webp(), "image/webp").decodedPixels, "not_checked");
  fails(() => inspectImage(webp("EXIF"), "image/webp"), "IMAGE_PRIVATE_METADATA");
  fails(() => inspectImage(webp("XMP "), "image/webp"), "IMAGE_PRIVATE_METADATA");
  fails(() => inspectImage(Buffer.concat([webp(), Buffer.from([0])]), "image/webp"), "WEBP_SIGNATURE_LENGTH");
});
test("JPEG application metadata is rejected without echoing its body", () => {
  const app = Buffer.from([255, 216, 255, 225, 0, 5, 1, 2, 3, 255, 217]); fails(() => inspectImage(app, "image/jpeg"), "IMAGE_PRIVATE_METADATA");
});
function ktx() {
  const out = Buffer.alloc(148); Buffer.from("ab4b5458203230bb0d0a1a0a", "hex").copy(out); out.writeUInt32LE(1, 16); out.writeUInt32LE(4, 20); out.writeUInt32LE(4, 24); out.writeUInt32LE(1, 36); out.writeUInt32LE(1, 40); out.writeUInt32LE(104, 48); out.writeUInt32LE(28, 52); out.writeBigUInt64LE(132n, 80); out.writeBigUInt64LE(16n, 88); out.writeBigUInt64LE(16n, 96); out.writeUInt32LE(28, 104); out[116] = 166; out[118] = 1; return out;
}
test("KTX2 DFD, range overlap and declared image dimensions are checked", () => {
  assert.equal(inspectKTX2(ktx()).transfer, 1);
  const overlap = ktx(); overlap.writeBigUInt64LE(120n, 80); fails(() => inspectKTX2(overlap), "KTX2_SEGMENT_OVERLAP");
  const bad = ktx(); bad[118] = 0; fails(() => inspectKTX2(bad), "KTX2_BASIS_COLOR_MODEL");
});
function collision(change = () => {}) {
  const json = { schema: "atlas.collision.v1", islandId: "groot", units: "metres", up: "+Y", worldSpace: true, shapes: [{ id: "wall", instanceId: "groot-guide", partId: "wall", type: "box", center: [0, 1, 0], halfSize: [1, 1, 1], rotationY: 0, bounds: { min: [-1, 0, -1], max: [1, 2, 1] } }] }; change(json); return Buffer.from(JSON.stringify(json));
}
test("collision identity, finite extents and duplicate IDs are checked", () => {
  assert.equal(inspectCollision(collision()).shapes, 1);
  fails(() => inspectCollision(collision(j => { j.shapes[0].halfSize[0] = 0; })), "COLLISION_BOX");
  fails(() => inspectCollision(collision(j => { j.shapes.push(j.shapes[0]); })), "COLLISION_ID");
});


// A decoded synthetic 2x2 image; no source photo or publication dictionary.
const jpegFixture = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBaKKK4DE//2Q==", "base64");
function jpegApplication(marker, body) {
  const segment = Buffer.alloc(body.length + 4); segment[0] = 255; segment[1] = marker; segment.writeUInt16BE(body.length + 2, 2); body.copy(segment, 4);
  const afterJfif = 4 + jpegFixture.readUInt16BE(4);
  return Buffer.concat([jpegFixture.subarray(0, afterJfif), segment, jpegFixture.subarray(afterJfif)]);
}
test("JPEG application headers validate structure and private payloads instead of trusting APP labels", () => {
  assert.equal(inspectImage(jpegFixture, "image/jpeg").width, 2);
  const adobe = Buffer.alloc(12); adobe.write("Adobe"); adobe.writeUInt16BE(100, 5); adobe[11] = 1;
  assert.ok(inspectImage(jpegApplication(238, adobe), "image/jpeg").metadata.includes("color-transform"));
  fails(() => inspectImage(jpegApplication(238, adobe.subarray(0, 11)), "image/jpeg"), "JPEG_ADOBE_FIELDS");
  fails(() => inspectImage(jpegApplication(224, Buffer.from("opaque-unstructured-body")), "image/jpeg"), "JPEG_APP0_HEADER");
  const extension = Buffer.from([74, 70, 88, 88, 0, 0x13, 1, 1, 120, 130, 140]);
  assert.ok(inspectImage(jpegApplication(224, extension), "image/jpeg").metadata.includes("JFXX"));
  fails(() => inspectImage(jpegApplication(224, extension.subarray(0, -1)), "image/jpeg"), "JPEG_JFXX_THUMBNAIL");
  const hidden = "ExampleHiddenTerm", jfif = Buffer.alloc(14 + 18, 32);
  jfif.write("JFIF\0"); jfif[5] = 1; jfif[6] = 1; jfif[7] = 0; jfif.writeUInt16BE(1, 8); jfif.writeUInt16BE(1, 10); jfif[12] = 3; jfif[13] = 2; jfif.write(hidden, 14);
  fails(() => inspectImage(jpegApplication(224, jfif), "image/jpeg", {privatePatterns:[{id:"synthetic-1",expression:new RegExp(hidden,"u")}]}), "PRIVATE_PUBLICATION_RULE");
});
test("physical hit nodes must be reachable from the actual default scene", () => {
  fails(() => inspectGLB(glb(j => {j.scene = 9;}), {places:[place]}), "GLB_DEFAULT_SCENE");
  fails(() => inspectGLB(glb(j => {j.nodes[0].children = [];}), {places:[place]}), "GLB_EMPTY_ACTIVE_GEOMETRY");
  const disconnected = glb(j => {j.nodes.push({name:"visible_panel",mesh:0});j.nodes[0].children=[2];});
  fails(() => inspectGLB(disconnected, {places:[place]}), "GLB_PHYSICAL_HIT_MISSING");
});
function prismCollision(polygon, surfaceTriangles) {
  const n = polygon.length, vertices = [0,1].flatMap(y => polygon.map(([x,z]) => [x,y,z]));
  const triangles = [...surfaceTriangles.map(t=>[...t].reverse()),...surfaceTriangles.map(t=>t.map(i=>i+n))];
  for(let i=0;i<n;i++){const j=(i+1)%n;triangles.push([i,j,j+n],[i,j+n,i+n]);}
  return {id:"fixture-solid",instanceId:"fixture-asset",partId:"fixture-part",type:"convex",vertices,triangles,bounds:{min:[-1,0,-1],max:[1,1,1]}};
}
test("convex collision proxies reject concavity, open surfaces and zero-volume shells", () => {
  const cube = prismCollision([[-1,-1],[1,-1],[1,1],[-1,1]],[[0,1,2],[0,2,3]]);
  const pack = shape => collision(j => {j.shapes=[shape];});
  assert.equal(inspectCollision(pack(cube)).shapes,1);
  const concave = prismCollision([[-1,-1],[1,-1],[1,0],[0,0],[0,1],[-1,1]],[[0,1,3],[1,2,3],[0,3,5],[3,4,5]]);
  fails(() => inspectCollision(pack(concave)), "COLLISION_NOT_CONVEX");
  const open=structuredClone(cube);open.triangles.pop();fails(() => inspectCollision(pack(open)), "COLLISION_OPEN_SURFACE");
  const flat={...cube,vertices:[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],triangles:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]]};
  fails(() => inspectCollision(pack(flat)), "COLLISION_ZERO_VOLUME");
});

test("WebP extension resolves the real image and rejects forged or misrouted sources", () => {
  // Generated 1x1 solid-color lossless WebP; no metadata or source content.
  const webp = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQxuKVtv+BiOh/AAA=", "base64");
  const configure = j => { j.extensionsUsed = ["EXT_texture_webp"]; j.extensionsRequired = ["EXT_texture_webp"]; j.textures[0] = { extensions: { EXT_texture_webp: { source: 0 } } }; j.images[0].mimeType = "image/webp"; };
  assert.equal(inspectGLB(glb(configure, webp)).images[0].mime, "image/webp");
  fails(() => inspectGLB(glb(j => { configure(j); j.textures[0].extensions.EXT_texture_webp.source = 9; }, webp)), "GLB_WEBP_SOURCE_MIME");
  fails(() => inspectGLB(glb(j => { configure(j); j.images[0].mimeType = "image/png"; })), "GLB_WEBP_SOURCE_MIME");
  fails(() => inspectGLB(glb(j => { configure(j); j.textures[0].extensions.EXT_texture_webp.source = "0"; }, webp)), "GLB_WEBP_SOURCE");
  fails(() => inspectGLB(glb(j => { configure(j); delete j.extensionsUsed; }, webp)), "GLB_WEBP_DECLARATION");
  fails(() => inspectGLB(glb(j => { configure(j); j.textures[0] = { source: 0 }; }, webp)), "GLB_WEBP_EXTENSION_REQUIRED");
});

// Exact reviewed color-profile fixture; no photograph or private provenance.
const reviewedSrgbICC = Buffer.from("AAAByAAAAAAEMAAAbW50clJHQiBYWVogB+AAAQABAAAAAAAAYWNzcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAPbWAAEAAAAA0y0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAAAkclhZWgAAARQAAAAUZ1hZWgAAASgAAAAUYlhZWgAAATwAAAAUd3RwdAAAAVAAAAAUclRSQwAAAWQAAAAoZ1RSQwAAAWQAAAAoYlRSQwAAAWQAAAAoY3BydAAAAYwAAAA8bWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCWFlaIAAAAAAAAG+iAAA49QAAA5BYWVogAAAAAAAAYpkAALeFAAAY2lhZWiAAAAAAAAAkoAAAD4QAALbPWFlaIAAAAAAAAPbWAAEAAAAA0y1wYXJhAAAAAAAEAAAAAmZmAADypwAADVkAABPQAAAKWwAAAAAAAAAAbWx1YwAAAAAAAAABAAAADGVuVVMAAAAgAAAAHABHAG8AbwBnAGwAZQAgAEkAbgBjAC4AIAAyADAAMQA2", "base64");
function webpChunk(type, body) { const head = Buffer.alloc(8); head.write(type); head.writeUInt32LE(body.length, 4); return Buffer.concat([head, body, Buffer.alloc(body.length % 2)]); }
function webpContainer(chunks) { const head = Buffer.from("RIFF0000WEBP"); const bytes = Buffer.concat([head, ...chunks]); bytes.writeUInt32LE(bytes.length - 8, 4); return bytes; }
function webpExtended(flags = 0x20) { const body = Buffer.alloc(10); body[0] = flags; return webpChunk("VP8X", body); }
const onePixelWebpPayload = () => webp().subarray(12);
const withProfile = (profile = reviewedSrgbICC, flags = 0x20) => webpContainer([webpExtended(flags), webpChunk("ICCP", profile), onePixelWebpPayload()]);

test("only the exact reviewed sRGB ICC bytes are accepted without changing image payloads", () => {
  const bytes = withProfile(), before = Buffer.from(bytes), result = inspectImage(bytes, "image/webp");
  assert.deepEqual(result.colorProfile, { ...WEBP_SRGB_ICC_PROFILE, status: "exact_reviewed_srgb_bytes" });
  assert.deepEqual(result.metadata, ["ICCP:reviewed_srgb"]); assert.equal(result.decodedPixels, "not_checked"); assert.ok(bytes.equals(before));
});
test("unknown, resized and one-byte-modified ICC profiles remain rejected", () => {
  const changed = Buffer.from(reviewedSrgbICC); changed[changed.length - 1] ^= 1;
  for (const profile of [Buffer.alloc(456), changed, reviewedSrgbICC.subarray(0, 455), Buffer.concat([reviewedSrgbICC, Buffer.from([0])])])
    fails(() => inspectImage(withProfile(profile), "image/webp"), "WEBP_ICC_IDENTITY");
});
test("ICC requires a matching VP8X flag and a real profile chunk", () => {
  fails(() => inspectImage(withProfile(reviewedSrgbICC, 0), "image/webp"), "WEBP_ICC_FLAG");
  fails(() => inspectImage(webpContainer([webpChunk("ICCP", reviewedSrgbICC), onePixelWebpPayload()]), "image/webp"), "WEBP_ICC_FLAG");
  fails(() => inspectImage(webpContainer([webpExtended(), onePixelWebpPayload()]), "image/webp"), "WEBP_ICC_FLAG");
  assert.equal(inspectImage(webpContainer([webpExtended(0), onePixelWebpPayload()]), "image/webp").width, 1);
});
test("color correction chunks cannot be duplicated or placed after image data", () => {
  fails(() => inspectImage(webpContainer([webpExtended(), onePixelWebpPayload(), webpChunk("ICCP", reviewedSrgbICC)]), "image/webp"), "WEBP_CHUNK_ORDER");
  fails(() => inspectImage(webpContainer([webpExtended(), webpChunk("ICCP", reviewedSrgbICC), webpChunk("ICCP", reviewedSrgbICC), onePixelWebpPayload()]), "image/webp"), "WEBP_DUPLICATE_CHUNK");
  const reserved = webpExtended(); reserved[9] = 1;
  fails(() => inspectImage(webpContainer([reserved, webpChunk("ICCP", reviewedSrgbICC), onePixelWebpPayload()]), "image/webp"), "WEBP_FEATURES");
});
test("a reviewed color profile never permits EXIF or XMP metadata", () => {
  for (const type of ["EXIF", "XMP "]) {
    const bytes = webpContainer([webpExtended(), webpChunk("ICCP", reviewedSrgbICC), onePixelWebpPayload(), webpChunk(type, Buffer.from("ExampleHiddenTerm"))]);
    fails(() => inspectImage(bytes, "image/webp"), "IMAGE_PRIVATE_METADATA");
  }
});

test("untextured foliage may omit UVs while textured surfaces require their declared coordinate set",()=>{
 assert.ok(inspectGLB(glb(j=>{delete j.meshes[0].primitives[0].attributes.TEXCOORD_0;j.materials[0]={pbrMetallicRoughness:{baseColorFactor:[.2,.4,.3,1]}};})).primitives>0);
 fails(()=>inspectGLB(glb(j=>{j.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord=1;})),"GLB_POSITION_UV_CONTRACT");
});

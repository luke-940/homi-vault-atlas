/** Public asset container, metadata and semantic contracts.
 * Private publication dictionaries are supplied only by the local caller.
 * This synchronous check does not claim GPU rendering or compressed-mesh decoding.
 */
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

// Exact unmodified Basis runtime files distributed with the locked three@0.185.1
// package: examples/jsm/libs/basis/. Preserve its separate Apache-2.0 notice.
export const BASIS_DECODER_CONTRACT = Object.freeze({
  "assets/basis/basis_transcoder.js": Object.freeze({ bytes: 57529, sha256: "8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1" }),
  "assets/basis/basis_transcoder.wasm": Object.freeze({ bytes: 527333, sha256: "6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a" }),
});

// One reviewed sRGB ICC v4.3 profile. This exact technical color payload is
// allowed without permitting arbitrary ICC descriptions, tags or metadata.
export const WEBP_SRGB_ICC_PROFILE = Object.freeze({
  bytes: 456,
  sha256: "12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc",
});

const MAX_FILE = 256 * 1024 * 1024;
const MAX_IMAGE = 64 * 1024 * 1024;
const MAX_METADATA = 1024 * 1024;
const ID = /^[a-zA-Z0-9_.:/-]{1,200}$/u;
const finite = n => typeof n === "number" && Number.isFinite(n);
const vector = (v, size) => Array.isArray(v) && v.length === size && v.every(finite);
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const issue = (code, field = "container") => { const error = new Error(code); error.code = code; error.field = field; throw error; };
const check = (condition, code, field) => { if (!condition) issue(code, field); };
const range = (offset, length, size, field) => check(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= size, "INVALID_BYTE_RANGE", field);
const utf8 = bytes => { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { issue("INVALID_UTF8"); } };
const parseJSON = bytes => { try { return JSON.parse(utf8(bytes)); } catch { issue("INVALID_JSON"); } };
const writerValues = new Set(["Khronos glTF Blender I/O v5.2.40", "glTF-Transform v4.5.0"]);

function scan(value, patterns, field = "json", depth = 0) {
  check(depth <= 48, "METADATA_TOO_DEEP", field);
  if (typeof value === "string") {
    check(value.length <= MAX_METADATA, "METADATA_TOO_LONG", field);
    let normalized = value.normalize("NFKC");
    try { normalized += "\n" + decodeURIComponent(value).normalize("NFKC"); } catch { /* Literal percent is valid. */ }
    check(!/(?:[a-z][a-z\d+.-]*:\/\/|\bmailto:|\bdata:|\/Users\/|\/home\/|\/private\/|[a-z]:\\|\[\[|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu.test(normalized), "PRIVATE_PATH_URI_OR_CREDENTIAL", field);
    check(!/\b(?:source_path|snapshot_path|canonical_path|raw_source|source_sha256|char_start|char_end)\b/iu.test(normalized), "PRIVATE_PROVENANCE_FIELD_OR_TEXT", field);
    if (field === "json.asset.generator" && writerValues.has(value)) return;
    for (const pattern of patterns) if (pattern.expression.test(normalized)) issue("PRIVATE_PUBLICATION_RULE", field);
  } else if (Array.isArray(value)) value.forEach((v, i) => scan(v, patterns, `${field}[${i}]`, depth + 1));
  else if (object(value)) for (const [key, v] of Object.entries(value)) {
    scan(key, patterns, `${field}.[key]`, depth + 1);
    scan(v, patterns, `${field}.${/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/u.test(key) ? key : "[unapproved-field]"}`, depth + 1);
  } else check(value === null || typeof value === "boolean" || finite(value), "INVALID_METADATA_VALUE", field);
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let j = 0; j < 8; j++) i = (i & 1) ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

export function inspectImage(bytes, mime, { privatePatterns = [], imageDepth = 0 } = {}) {
  check(Number.isInteger(imageDepth) && imageDepth >= 0 && imageDepth <= 2, "IMAGE_NESTING_LIMIT");
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_IMAGE, "INVALID_IMAGE_SIZE");
  const report = { mime, bytes: bytes.length, metadata: [], width: null, height: null, decodedPixels: "not_checked" };
  if (mime === "image/png") {
    check(bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "PNG_SIGNATURE");
    let offset = 8, ended = false, header = null; const data = [];
    while (offset < bytes.length) {
      range(offset, 12, bytes.length); const n = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      range(offset + 8, n + 4, bytes.length); check(crc32(bytes.subarray(offset + 4, offset + 8 + n)) === bytes.readUInt32BE(offset + 8 + n), "PNG_CRC");
      const body = bytes.subarray(offset + 8, offset + 8 + n);
      check(!["tEXt", "zTXt", "iTXt", "eXIf"].includes(type), "IMAGE_PRIVATE_METADATA", "image.metadata");
      check(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "sRGB", "gAMA", "cHRM", "sBIT", "pHYs", "bKGD", "oFFs"].includes(type), "IMAGE_UNREVIEWED_CHUNK", "image.metadata");
      if (type === "oFFs") check(n === 9 && body.every(v => v === 0), "PNG_OFFSET_METADATA");
      if (type === "sRGB") check(n === 1 && body[0] <= 3, "PNG_COLOR_METADATA");
      if (type === "gAMA") check(n === 4 && body.readUInt32BE(0) > 0, "PNG_COLOR_METADATA");
      if (type === "cHRM") check(n === 32, "PNG_COLOR_METADATA");
      if (type === "pHYs") check(n === 9 && body[8] <= 1, "PNG_PIXEL_METADATA");
      if (type === "sBIT") check(n >= 1 && n <= 4 && body.every(v => v > 0 && v <= 16), "PNG_COLOR_METADATA");
      if (type === "bKGD") check([1, 2, 6].includes(n), "PNG_COLOR_METADATA");
      if (type === "PLTE") check(n > 0 && n <= 768 && n % 3 === 0, "PNG_PALETTE");
      if (type === "tRNS") check(n > 0 && n <= 256, "PNG_TRANSPARENCY");
      if (type === "IHDR") { check(offset === 8 && n === 13 && !header, "PNG_HEADER"); header = body; report.width = body.readUInt32BE(0); report.height = body.readUInt32BE(4); }
      else check(header, "PNG_HEADER_ORDER");
      if (type === "IDAT") data.push(body);
      if (type === "IEND") { check(n === 0 && offset + 12 === bytes.length, "PNG_TRAILING_DATA"); ended = true; }
      if (!["IDAT", "IHDR", "IEND"].includes(type)) report.metadata.push(type);
      offset += 12 + n;
    }
    check(ended && header && data.length, "PNG_INCOMPLETE");
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header[9]];
    check(channels && [1, 2, 4, 8, 16].includes(header[8]) && header[10] === 0 && header[11] === 0 && header[12] === 0, "PNG_UNSUPPORTED_FORMAT");
    check(report.width > 0 && report.height > 0 && report.width <= 8192 && report.height <= 8192, "IMAGE_DIMENSIONS");
    const expected = (Math.ceil(report.width * channels * header[8] / 8) + 1) * report.height;
    check(expected <= 512 * 1024 * 1024, "IMAGE_DECODE_LIMIT");
    let raw; try { raw = inflateSync(Buffer.concat(data), { maxOutputLength: expected }); } catch { issue("PNG_DEFLATE"); }
    check(raw.length === expected, "PNG_DECODE_LENGTH"); report.decodedPixels = "deflate_and_scanline_length_checked";
  } else if (mime === "image/jpeg") {
    check(bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217, "JPEG_SIGNATURE");
    let offset = 2, scans = 0, ended = false; const applicationTypes = new Set();
    while (offset < bytes.length) {
      check(bytes[offset] === 255, "JPEG_MARKER"); while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217) { check(offset === bytes.length, "JPEG_TRAILING_DATA"); ended = true; break; }
      check(marker !== 216 && marker !== 0 && !(marker >= 208 && marker <= 215), "JPEG_MARKER");
      range(offset, 2, bytes.length); const n = bytes.readUInt16BE(offset); check(n >= 2, "JPEG_SEGMENT"); range(offset, n, bytes.length);
      if ([225, 226, 237, 254].includes(marker)) issue("IMAGE_PRIVATE_METADATA", "image.metadata");
      if (marker >= 224 && marker <= 239) {
        check([224, 238].includes(marker), "IMAGE_UNREVIEWED_CHUNK", "image.metadata");
        const body = bytes.subarray(offset + 2, offset + n);
        // Scan without reporting the payload. A familiar APP marker alone is
        // not evidence that an arbitrary metadata body is a safe color header.
        scan(body.toString("utf8"), privatePatterns, "image.metadata");
        if (marker === 224) {
          const kind = body.toString("ascii", 0, 5);
          check(["JFIF\0", "JFXX\0"].includes(kind), "JPEG_APP0_HEADER");
          check(!applicationTypes.has(kind), "JPEG_DUPLICATE_APPLICATION"); applicationTypes.add(kind);
          if (kind === "JFIF\0") {
            check(body.length >= 14 && body[5] === 1 && body[6] <= 2 && body[7] <= 2 && body.readUInt16BE(8) > 0 && body.readUInt16BE(10) > 0, "JPEG_JFIF_FIELDS");
            const width = body[12], height = body[13];
            check((width === 0) === (height === 0) && body.length === 14 + 3 * width * height, "JPEG_JFIF_THUMBNAIL");
            report.metadata.push("JFIF");
          } else {
            check(applicationTypes.has("JFIF\0"), "JPEG_JFXX_ORDER");
            check(body.length >= 6 && [0x10, 0x11, 0x13].includes(body[5]), "JPEG_JFXX_FIELDS");
            if (body[5] === 0x10) inspectImage(body.subarray(6), "image/jpeg", { privatePatterns, imageDepth: imageDepth + 1 });
            else {
              check(body.length >= 8 && body[6] > 0 && body[7] > 0, "JPEG_JFXX_THUMBNAIL");
              const expected = body[5] === 0x11 ? 8 + 768 + body[6] * body[7] : 8 + 3 * body[6] * body[7];
              check(body.length === expected, "JPEG_JFXX_THUMBNAIL");
            }
            report.metadata.push("JFXX");
          }
        } else {
          check(!applicationTypes.has("Adobe"), "JPEG_DUPLICATE_APPLICATION"); applicationTypes.add("Adobe");
          check(body.length === 12 && body.toString("ascii", 0, 5) === "Adobe" && body.readUInt16BE(5) === 100 && body[11] <= 2, "JPEG_ADOBE_FIELDS");
          report.metadata.push("color-transform");
        }
      }
      if ([192, 193, 194].includes(marker)) { check(n >= 8, "JPEG_FRAME"); report.height = bytes.readUInt16BE(offset + 3); report.width = bytes.readUInt16BE(offset + 5); }
      offset += n;
      if (marker === 218) {
        scans++;
        while (offset < bytes.length - 1) {
          if (bytes[offset] !== 255) { offset++; continue; }
          const next = bytes[offset + 1]; if (next === 0 || next >= 208 && next <= 215) { offset += 2; continue; }
          if (next === 255) { offset++; continue; } break;
        }
      }
    }
    check(ended && scans > 0, "JPEG_INCOMPLETE");
  } else if (mime === "image/webp") {
    check(bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length, "WEBP_SIGNATURE_LENGTH");
    let offset = 12, payloads = 0, extendedFlags = null, lastRank = -1; const seen = new Set();
    while (offset < bytes.length) {
      range(offset, 8, bytes.length); const type = bytes.toString("ascii", offset, offset + 4), n = bytes.readUInt32LE(offset + 4); range(offset + 8, n + (n % 2), bytes.length);
      check(!seen.has(type), "WEBP_DUPLICATE_CHUNK"); seen.add(type);
      check(!["EXIF", "XMP "].includes(type), "IMAGE_PRIVATE_METADATA", "image.metadata");
      check(["VP8 ", "VP8L", "VP8X", "ICCP", "ALPH"].includes(type), "IMAGE_UNREVIEWED_CHUNK", "image.metadata");
      const rank = { VP8X: 0, ICCP: 1, ALPH: 2, "VP8 ": 3, VP8L: 3 }[type];
      check(rank >= lastRank, "WEBP_CHUNK_ORDER"); lastRank = rank;
      const body = bytes.subarray(offset + 8, offset + 8 + n);
      if (type === "VP8X") { check(offset === 12 && n === 10 && (body[0] & 0xcf) === 0 && body.subarray(1, 4).every(v => v === 0), "WEBP_FEATURES"); extendedFlags = body[0]; report.width = 1 + body.readUIntLE(4, 3); report.height = 1 + body.readUIntLE(7, 3); }
      if (type === "ICCP") {
        check(extendedFlags !== null && (extendedFlags & 0x20) !== 0, "WEBP_ICC_FLAG");
        check(n === WEBP_SRGB_ICC_PROFILE.bytes && createHash("sha256").update(body).digest("hex") === WEBP_SRGB_ICC_PROFILE.sha256, "WEBP_ICC_IDENTITY", "image.metadata");
        report.metadata.push("ICCP:reviewed_srgb"); report.colorProfile = { ...WEBP_SRGB_ICC_PROFILE, status: "exact_reviewed_srgb_bytes" };
      }
      if (type === "VP8 ") { check(n >= 10 && body.subarray(3, 6).toString("hex") === "9d012a", "WEBP_FRAME"); payloads++; report.width ??= body.readUInt16LE(6) & 16383; report.height ??= body.readUInt16LE(8) & 16383; }
      if (type === "VP8L") { check(n >= 5 && body[0] === 47, "WEBP_LOSSLESS_FRAME"); const bits = body.readUInt32LE(1); check(bits >>> 29 === 0, "WEBP_VERSION"); payloads++; report.width ??= 1 + (bits & 16383); report.height ??= 1 + ((bits >>> 14) & 16383); }
      if (n % 2) check(bytes[offset + 8 + n] === 0, "WEBP_PADDING"); offset += 8 + n + (n % 2);
    }
    check(payloads === 1, "WEBP_PAYLOAD_COUNT");
    check(Boolean(extendedFlags !== null && (extendedFlags & 0x20)) === seen.has("ICCP"), "WEBP_ICC_FLAG");
  } else if (mime === "image/ktx2") return inspectKTX2(bytes, { privatePatterns });
  else issue("IMAGE_MIME_UNSUPPORTED");
  check(Number.isInteger(report.width) && Number.isInteger(report.height) && report.width > 0 && report.height > 0 && report.width <= 8192 && report.height <= 8192, "IMAGE_DIMENSIONS");
  return report;
}

export function inspectKTX2(bytes, { privatePatterns = [] } = {}) {
  check(bytes.length >= 104 && bytes.length <= MAX_IMAGE && bytes.subarray(0, 12).toString("hex") === "ab4b5458203230bb0d0a1a0a", "KTX2_HEADER");
  const width = bytes.readUInt32LE(20), height = bytes.readUInt32LE(24), levels = bytes.readUInt32LE(40), scheme = bytes.readUInt32LE(44);
  check(width > 0 && height > 0 && width <= 8192 && height <= 8192 && bytes.readUInt32LE(28) === 0 && bytes.readUInt32LE(32) === 0 && bytes.readUInt32LE(36) === 1 && levels > 0 && levels <= 14 && [0, 1, 2].includes(scheme), "KTX2_DIMENSIONS_FORMAT");
  const segments = [{ start: 0, end: 80 + levels * 24 }]; range(0, 80 + levels * 24, bytes.length);
  const segment = (offset, length, name) => { range(offset, length, bytes.length, name); if (length) { check(offset >= segments[0].end, "KTX2_SEGMENT_OVERLAP"); segments.push({ start: offset, end: offset + length }); } };
  const dfd = bytes.readUInt32LE(48), dfdLength = bytes.readUInt32LE(52), kvd = bytes.readUInt32LE(56), kvdLength = bytes.readUInt32LE(60);
  segment(dfd, dfdLength, "ktx.dfd"); segment(kvd, kvdLength, "ktx.kvd");
  const u64 = at => { const n = bytes.readBigUInt64LE(at); check(n <= BigInt(Number.MAX_SAFE_INTEGER), "KTX2_INTEGER_RANGE"); return Number(n); };
  segment(u64(64), u64(72), "ktx.sgd");
  check(dfdLength >= 28 && bytes.readUInt32LE(dfd) === dfdLength && dfdLength <= MAX_METADATA, "KTX2_DFD");
  const colorModel = bytes[dfd + 12], transfer = bytes[dfd + 14];
  check([163, 166].includes(colorModel) && [1, 2].includes(transfer), "KTX2_BASIS_COLOR_MODEL");
  for (let i = 0; i < levels; i++) { const offset = u64(80 + i * 24), length = u64(88 + i * 24); check(length > 0, "KTX2_EMPTY_LEVEL"); segment(offset, length, "ktx.level"); }
  segments.sort((a, b) => a.start - b.start); for (let i = 1; i < segments.length; i++) check(segments[i].start >= segments[i - 1].end, "KTX2_SEGMENT_OVERLAP");
  check(kvdLength <= MAX_METADATA, "METADATA_TOO_LONG"); const metadata = []; let offset = kvd;
  while (offset < kvd + kvdLength) {
    range(offset, 4, kvd + kvdLength); const n = bytes.readUInt32LE(offset); offset += 4; range(offset, n, kvd + kvdLength); const entry = bytes.subarray(offset, offset + n), nul = entry.indexOf(0);
    check(nul > 0, "KTX2_KEY_VALUE"); const key = utf8(entry.subarray(0, nul)), value = utf8(entry.subarray(nul + 1)).replace(/\0$/u, "");
    check(["KTXwriter", "KTXwriterScParams", "KTXorientation", "KTXswizzle"].includes(key) && !metadata.includes(key), "KTX2_UNREVIEWED_METADATA", "ktx.metadata");
    scan(value, privatePatterns, "ktx.metadata");
    if (key === "KTXorientation") check(value === "rd", "KTX2_ORIENTATION");
    if (key === "KTXswizzle") check(value === "rgba" || value === "rgb1", "KTX2_SWIZZLE");
    metadata.push(key); offset += n; const pad = (4 - (n % 4)) % 4; range(offset, pad, kvd + kvdLength); check(bytes.subarray(offset, offset + pad).every(v => v === 0), "KTX2_PADDING"); offset += pad;
  }
  return { mime: "image/ktx2", bytes: bytes.length, width, height, levels, colorModel, transfer, metadata, decodedPixels: "not_checked" };
}

const extrasKeys = new Set(["atlasIslandId", "atlasSceneKind", "atlasVersion", "atlasUnits", "atlasUp", "atlasInstanceId", "atlasConstructionKitId", "atlasPartId", "atlasRole", "atlasTerrain", "atlasSourcePartCount", "interactionIds", "atlasFoliage", "atlasWindWeight", "atlasLOD", "atlasLODGroup", "atlasLODScreenHeights", "atlasMotion", "atlasMotionAxis", "atlasMotionDegrees", "atlasMotionPeriodSeconds", "atlasLodRoot", "atlasLodLevel", "atlasLodRadius", "atlasDecoration", "atlasVegetation"]);
const extensions = new Set(["EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_basisu", "EXT_texture_webp", "KHR_materials_unlit", "KHR_materials_emissive_strength", "KHR_texture_transform"]);
export function inspectGLB(bytes, { privatePatterns = [], places = [], externalImages = new Map() } = {}) {
  check(bytes.length >= 28 && bytes.length <= MAX_FILE && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, "GLB_HEADER");
  let offset = 12, json, binary;
  while (offset < bytes.length) {
    range(offset, 8, bytes.length); const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4); range(offset + 8, size, bytes.length); check(size % 4 === 0, "GLB_ALIGNMENT");
    if (type === 0x4e4f534a) { check(offset === 12 && !json, "GLB_JSON_ORDER"); json = parseJSON(bytes.subarray(offset + 8, offset + 8 + size)); }
    else if (type === 0x004e4942) { check(json && !binary, "GLB_BIN_ORDER"); binary = bytes.subarray(offset + 8, offset + 8 + size); }
    else issue("GLB_UNKNOWN_CHUNK"); offset += size + 8;
  }
  check(json && binary && json.asset?.version === "2.0" && [1, 2].includes(json.buffers?.length) && !json.buffers[0].uri && Number.isInteger(json.buffers[0].byteLength) && json.buffers[0].byteLength <= binary.length && binary.length - json.buffers[0].byteLength <= 3, "GLB_SELF_CONTAINED");
  if (json.buffers.length === 2) check(json.extensionsRequired?.includes("EXT_meshopt_compression") && !json.buffers[1].uri && json.buffers[1].extensions?.EXT_meshopt_compression?.fallback === true && Number.isInteger(json.buffers[1].byteLength) && json.buffers[1].byteLength > 0 && json.buffers[1].byteLength <= MAX_FILE, "GLB_MESHOPT_FALLBACK_BUFFER");
  check(binary.subarray(json.buffers[0].byteLength).every(v => v === 0), "GLB_BIN_PADDING"); scan(json, privatePatterns);
  for (const extension of [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]) check(extensions.has(extension), "GLB_UNREVIEWED_EXTENSION");
  function customFields(value) {
    if (!object(value) && !Array.isArray(value)) return;
    if (object(value) && value.extras !== undefined) { check(object(value.extras), "GLB_EXTRAS_TYPE"); for (const key of Object.keys(value.extras)) check(extrasKeys.has(key), "GLB_UNREVIEWED_EXTRAS", "json.extras.[unapproved-field]"); }
    if (object(value) && value.extensions !== undefined) for (const key of Object.keys(value.extensions)) check(extensions.has(key), "GLB_UNREVIEWED_EXTENSION");
    for (const child of Object.values(value)) customFields(child);
  }
  customFields(json);
  for (const view of json.bufferViews ?? []) {
    check(Number.isInteger(view.buffer) && json.buffers[view.buffer] && Number.isInteger(view.byteLength) && view.byteLength > 0, "GLB_BUFFER_VIEW"); range(view.byteOffset ?? 0, view.byteLength, json.buffers[view.buffer].byteLength);
    if (view.buffer !== 0) check(view.extensions?.EXT_meshopt_compression, "GLB_MISSING_COMPRESSED_FALLBACK");
    if (view.extensions?.EXT_meshopt_compression) { const e = view.extensions.EXT_meshopt_compression; check(e.buffer === 0 && ["ATTRIBUTES", "TRIANGLES", "INDICES"].includes(e.mode) && Number.isInteger(e.count) && e.count > 0 && Number.isInteger(e.byteStride) && e.byteStride > 0, "GLB_MESHOPT_HEADER"); range(e.byteOffset ?? 0, e.byteLength, json.buffers[0].byteLength); }
  }
  const nodes = json.nodes ?? [], names = new Set();
  check(nodes.length > 0 && nodes.length <= 50000, "GLB_NODE_COUNT");
  for (const node of nodes) {
    check(typeof node.name === "string" && ID.test(node.name) && !names.has(node.name), "GLB_NODE_NAME"); names.add(node.name);
    for (const [key, size] of [["translation", 3], ["rotation", 4], ["scale", 3], ["matrix", 16]]) if (key in node) check(vector(node[key], size), "GLB_NODE_TRANSFORM");
    for (const child of node.children ?? []) check(Number.isInteger(child) && child >= 0 && child < nodes.length, "GLB_CHILD_REFERENCE");
    if (node.mesh !== undefined) check(Number.isInteger(node.mesh) && json.meshes?.[node.mesh], "GLB_MESH_REFERENCE");
    for (const key of Object.keys(node.extras ?? {})) check(extrasKeys.has(key), "GLB_UNREVIEWED_EXTRAS", "json.nodes.extras.[unapproved-field]");
    const e = node.extras ?? {};
    for (const key of ["atlasIslandId", "atlasSceneKind", "atlasVersion", "atlasUnits", "atlasInstanceId", "atlasConstructionKitId", "atlasPartId", "atlasRole", "atlasLODGroup"]) if (key in e) check(typeof e[key] === "string" && ID.test(e[key]), "GLB_EXTRAS_TYPE");
    for (const key of ["atlasTerrain", "atlasFoliage", "atlasLodRoot", "atlasDecoration"]) if (key in e) check(typeof e[key] === "boolean", "GLB_EXTRAS_TYPE");
    if (e.atlasVegetation !== undefined) check(["tree","understory"].includes(e.atlasVegetation), "GLB_VEGETATION_TYPE");
    if (e.interactionIds) check(Array.isArray(e.interactionIds) && e.interactionIds.every(id => typeof id === "string" && ID.test(id)), "GLB_INTERACTION_IDS");
    if (e.atlasMotion) check(["turn", "open", "foliage", "rotate", "clock"].includes(e.atlasMotion) && node.mesh === undefined, "GLB_MOTION_REQUIRES_EMPTY_PIVOT");
    if (["rotate","clock"].includes(e.atlasMotion)) check(["X","Y","Z"].includes(e.atlasMotionAxis) && Number.isFinite(e.atlasMotionDegrees) && Math.abs(e.atlasMotionDegrees)>0 && Math.abs(e.atlasMotionDegrees)<=30 && e.interactionIds?.length>0, "GLB_ROTATE_MOTION_CONTRACT");
    else check(!("atlasMotionAxis" in e) && !("atlasMotionDegrees" in e), "GLB_ROTATE_MOTION_CONTRACT");
    if (e.atlasMotion === "clock") check(e.atlasMotionAxis==="Z" && e.atlasMotionDegrees===5 && [5,7,11].includes(e.atlasMotionPeriodSeconds), "GLB_CLOCK_MOTION_CONTRACT");
    else check(!("atlasMotionPeriodSeconds" in e), "GLB_CLOCK_MOTION_CONTRACT");
  }
  const visiting = new Set(), visited = new Set(), parents = new Map();
  function visit(index) { check(!visiting.has(index), "GLB_NODE_CYCLE"); if (visited.has(index)) return; visiting.add(index); for (const child of nodes[index].children ?? []) { check(!parents.has(child) || parents.get(child) === index, "GLB_NODE_MULTIPLE_PARENTS"); parents.set(child, index); visit(child); } visiting.delete(index); visited.add(index); }
  nodes.forEach((_, index) => visit(index));
  const sceneIndex = json.scene ?? 0;
  check(Array.isArray(json.scenes) && Number.isInteger(sceneIndex) && sceneIndex >= 0 && sceneIndex < json.scenes.length, "GLB_DEFAULT_SCENE");
  const roots = json.scenes[sceneIndex]?.nodes;
  check(Array.isArray(roots) && roots.length > 0 && new Set(roots).size === roots.length && roots.every(i => Number.isInteger(i) && i >= 0 && i < nodes.length), "GLB_SCENE_ROOTS");
  const reachable = new Set(), pending = [...roots];
  while (pending.length) { const index = pending.pop(); if (reachable.has(index)) continue; reachable.add(index); pending.push(...(nodes[index].children ?? [])); }
  check([...reachable].some(i => json.meshes?.[nodes[i].mesh]?.primitives?.length > 0), "GLB_EMPTY_ACTIVE_GEOMETRY");
  const components = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, elements = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const accessorMaxima = new Map();
  for (const [accessorIndex, accessor] of (json.accessors ?? []).entries()) {
    check(components[accessor.componentType] && elements[accessor.type] && Number.isInteger(accessor.count) && accessor.count > 0 && !accessor.sparse, "GLB_ACCESSOR");
    const view = json.bufferViews?.[accessor.bufferView]; check(view, "GLB_ACCESSOR_BUFFER");
    const packed = components[accessor.componentType] * elements[accessor.type], stride = view.byteStride ?? packed; check(stride >= packed, "GLB_ACCESSOR_STRIDE"); range(accessor.byteOffset ?? 0, (accessor.count - 1) * stride + packed, view.byteLength);
    for (const key of ["min", "max"]) if (key in accessor) check(vector(accessor[key], elements[accessor.type]), "GLB_ACCESSOR_BOUNDS");
    if (view.buffer === 0 && !view.extensions?.EXT_meshopt_compression) {
      const read = { 5120: "readInt8", 5121: "readUInt8", 5122: "readInt16LE", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" }[accessor.componentType];
      let maximum = -Infinity;
      for (let i = 0; i < accessor.count; i++) for (let c = 0; c < elements[accessor.type]; c++) {
        const value = binary[read]((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * stride + c * components[accessor.componentType]);
        check(finite(value), "GLB_NONFINITE_ATTRIBUTE"); maximum = Math.max(maximum, value);
      }
      accessorMaxima.set(accessorIndex, maximum);
    }
  }
  let primitives = 0;
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    primitives++; const position = json.accessors?.[primitive.attributes?.POSITION], uv = json.accessors?.[primitive.attributes?.TEXCOORD_0];
    const material=json.materials?.[primitive.material];
    const textures=[material?.pbrMetallicRoughness?.baseColorTexture,material?.pbrMetallicRoughness?.metallicRoughnessTexture,material?.normalTexture,material?.occlusionTexture,material?.emissiveTexture].filter(Boolean);
    check(position?.type === "VEC3" && position.min && position.max && (!uv || uv.type === "VEC2" && uv.count === position.count), "GLB_POSITION_UV_CONTRACT");
    for(const texture of textures){const coordinate=texture.extensions?.KHR_texture_transform?.texCoord??texture.texCoord??0,attribute=json.accessors?.[primitive.attributes?.[`TEXCOORD_${coordinate}`]];check(attribute?.type==="VEC2"&&attribute.count===position.count,"GLB_POSITION_UV_CONTRACT");}
    check(primitive.mode === undefined || primitive.mode === 4, "GLB_PRIMITIVE_MODE");
    if (primitive.indices !== undefined) {
      const index = json.accessors?.[primitive.indices]; check(index?.type === "SCALAR" && [5121, 5123, 5125].includes(index.componentType) && index.count % 3 === 0, "GLB_INDEX_REFERENCE");
      if (accessorMaxima.has(primitive.indices)) check(accessorMaxima.get(primitive.indices) < position.count, "GLB_INDEX_OUT_OF_RANGE");
    }
    check(json.materials?.[primitive.material], "GLB_MATERIAL_REFERENCE");
  }
  check(primitives > 0, "GLB_EMPTY_GEOMETRY");
  const images = (json.images ?? []).map(image => {
    if (image.uri !== undefined) {
      check(/^shared\/[a-f0-9]{24}\.ktx2$/u.test(image.uri) && image.bufferView === undefined && image.mimeType === "image/ktx2", "GLB_EXTERNAL_IMAGE_PATH");
      const bytes = externalImages.get(image.uri);
      check(Buffer.isBuffer(bytes) && createHash("sha256").update(bytes).digest("hex").startsWith(image.uri.slice(7,31)), "GLB_EXTERNAL_IMAGE_IDENTITY");
      return inspectImage(bytes, image.mimeType, {privatePatterns});
    }
    check(Number.isInteger(image.bufferView), "GLB_IMAGE_BUFFER");
    const view=json.bufferViews?.[image.bufferView];check(view && view.buffer === 0 && !view.extensions?.EXT_meshopt_compression, "GLB_IMAGE_BUFFER");
    return inspectImage(binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),image.mimeType,{privatePatterns});
  });
  const textureSources = (json.textures ?? []).map(texture => {
    const webp = texture.extensions?.EXT_texture_webp;
    if (webp !== undefined) {
      check(object(webp) && Object.keys(webp).every(key => key === "source") && Number.isInteger(webp.source) && webp.source >= 0, "GLB_WEBP_SOURCE");
      check(json.extensionsUsed?.includes("EXT_texture_webp"), "GLB_WEBP_DECLARATION");
      check(images[webp.source]?.mime === "image/webp", "GLB_WEBP_SOURCE_MIME");
      check(!texture.extensions?.KHR_texture_basisu, "GLB_AMBIGUOUS_TEXTURE_EXTENSION");
    }
    const source = texture.extensions?.KHR_texture_basisu?.source ?? webp?.source ?? texture.source;
    check(Number.isInteger(source) && source >= 0 && images[source], "GLB_IMAGE_REFERENCE");
    if (images[source].mime === "image/webp") check(webp !== undefined, "GLB_WEBP_EXTENSION_REQUIRED");
    if (texture.source !== undefined) check(Number.isInteger(texture.source) && texture.source >= 0 && images[texture.source], "GLB_IMAGE_REFERENCE");
    return source;
  });
  for (const material of json.materials ?? []) for (const [slot, color] of [[material.pbrMetallicRoughness?.baseColorTexture, "srgb"], [material.emissiveTexture, "srgb"], [material.normalTexture, "linear"], [material.pbrMetallicRoughness?.metallicRoughnessTexture, "linear"], [material.occlusionTexture, "linear"]]) if (slot) {
    const texture = json.textures?.[slot.index]; check(texture, "GLB_TEXTURE_REFERENCE"); const source = textureSources[slot.index]; check(images[source], "GLB_IMAGE_REFERENCE"); if (images[source].mime === "image/ktx2") check(images[source].transfer === (color === "srgb" ? 2 : 1), "KTX2_COLORSPACE_SLOT");
  }
  const allHitNodes = nodes.filter(n => n.mesh !== undefined && n.extras?.interactionIds?.length);
  const hitNodes = nodes.filter((n, index) => reachable.has(index) && n.mesh !== undefined && n.extras?.interactionIds?.length);
  for (const place of places) {
    const matches = hitNodes.filter(n => n.extras.interactionIds.includes(place.id)); check(matches.length > 0, "GLB_PHYSICAL_HIT_MISSING");
    check(place.physicalPartIds.every(id => matches.some(n => n.extras.atlasPartId === id)), "GLB_PHYSICAL_PART_DIFFERENT");
    check(matches.every(n => n.extras.atlasInstanceId === place.interactionAssetId || n.extras.atlasInstanceId === place.assetId), "GLB_PHYSICAL_INSTANCE_DIFFERENT");
  }
  if (places.length) for (const node of allHitNodes) for (const id of node.extras.interactionIds) check(places.some(p => p.id === id), "GLB_UNKNOWN_INTERACTION");
  return { nodes: nodes.length, activeScene: sceneIndex, reachableNodes: reachable.size, meshes: json.meshes.length, primitives, images, interactionIds: [...new Set(hitNodes.flatMap(n => n.extras.interactionIds))], metadataChecked: true, compressedGeometryDecoded: false, actualRaycast: "not_checked" };
}

function collisionFields(value, allowed, field) {
  check(object(value) && Object.keys(value).every(key => allowed.includes(key)), "COLLISION_UNREVIEWED_FIELD", field);
}

export function inspectCollision(bytes, { privatePatterns = [], island } = {}) {
  const data = parseJSON(bytes); scan(data, privatePatterns);
  collisionFields(data, ["schema", "islandId", "units", "up", "worldSpace", "generation", "actualRuntimeSweep", "ground", "shapes"], "collision");
  if (data.ground !== undefined) {
    collisionFields(data.ground, ["levelY", "waterY", "coast", "shoreProfile", "stairSource"], "collision.ground");
    if (data.ground.shoreProfile !== undefined) {
      collisionFields(data.ground.shoreProfile, ["rock-cliff", "quay"], "collision.ground.shoreProfile");
      for (const profile of Object.values(data.ground.shoreProfile)) collisionFields(profile, ["inlandCrestOffset", "shelfInnerOffset", "shelfInnerY", "shelfOuterOffset", "shelfOuterY"], "collision.ground.shoreProfile.profile");
    }
  }
  check(data.schema === "atlas.collision.v1" && ["rocket", "groot", "common", "atlas"].includes(data.islandId) && data.units === "metres" && data.up === "+Y" && data.worldSpace === true && Array.isArray(data.shapes) && data.shapes.length > 0 && data.shapes.length <= 50000, "COLLISION_HEADER");
  if (island) check(data.islandId === island.id && data.ground?.levelY === island.groundY && data.ground?.waterY === 0 && JSON.stringify(data.ground?.coast) === JSON.stringify(island.coast), "COLLISION_GROUND_DIFFERENT");
  const ids = new Set();
  for (const s of data.shapes) {
    const shapeFields = { box: ["center", "halfSize", "rotationY"], capsule: ["start", "end", "radius"], convex: ["vertices", "triangles"] };
    check(object(s) && Object.hasOwn(shapeFields, s.type), "COLLISION_SHAPE_TYPE");
    collisionFields(s, ["id", "instanceId", "partId", "type", "bounds", ...shapeFields[s.type]], "collision.shape");
    collisionFields(s.bounds, ["min", "max"], "collision.shape.bounds");
    check(typeof s.id === "string" && ID.test(s.id) && !ids.has(s.id) && ID.test(s.instanceId ?? "") && ID.test(s.partId ?? ""), "COLLISION_ID"); ids.add(s.id);
    check(object(s.bounds) && vector(s.bounds.min, 3) && vector(s.bounds.max, 3) && s.bounds.min.every((n, i) => n <= s.bounds.max[i]), "COLLISION_BOUNDS");
    if (s.type === "box") check(vector(s.center, 3) && vector(s.halfSize, 3) && s.halfSize.every(n => n > 0) && finite(s.rotationY), "COLLISION_BOX");
    else if (s.type === "capsule") check(vector(s.start, 3) && vector(s.end, 3) && finite(s.radius) && s.radius > 0 && s.start.some((n, i) => n !== s.end[i]), "COLLISION_CAPSULE");
    else if (s.type === "convex") {
      check(Array.isArray(s.vertices) && s.vertices.length >= 4 && s.vertices.every(v => vector(v, 3)) && Array.isArray(s.triangles) && s.triangles.length >= 4, "COLLISION_CONVEX");
      const center = [0, 1, 2].map(axis => s.vertices.reduce((sum, v) => sum + v[axis], 0) / s.vertices.length);
      const edges = new Map(), faces = new Set(), used = new Set(); let volume = 0;
      for (const t of s.triangles) {
        check(Array.isArray(t) && t.length === 3 && new Set(t).size === 3 && t.every(i => Number.isInteger(i) && i >= 0 && i < s.vertices.length), "COLLISION_TRIANGLE");
        const [a, b, c] = t.map(i => s.vertices[i]), u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...normal);
        check(length > 1e-10, "COLLISION_DEGENERATE_TRIANGLE");
        const centerSide = normal.reduce((sum, n, i) => sum + n * (center[i] - a[i]), 0), sign = centerSide > 0 ? -1 : 1;
        check(s.vertices.every(p => normal.reduce((sum, n, i) => sum + n * (p[i] - a[i]), 0) * sign / length <= 1e-6), "COLLISION_NOT_CONVEX");
        const face = [...t].sort((a, b) => a - b).join(":"); check(!faces.has(face), "COLLISION_DUPLICATE_TRIANGLE"); faces.add(face);
        for (let i = 0; i < 3; i++) { used.add(t[i]); const edge = [t[i], t[(i + 1) % 3]].sort((a, b) => a - b).join(":"); edges.set(edge, (edges.get(edge) ?? 0) + 1); }
        volume += Math.abs(centerSide) / 6;
      }
      check(used.size === s.vertices.length && [...edges.values()].every(count => count === 2), "COLLISION_OPEN_SURFACE");
      check(volume > 1e-10, "COLLISION_ZERO_VOLUME");
      check(s.vertices.every(v => v.every((n, i) => n >= s.bounds.min[i] - 0.0001 && n <= s.bounds.max[i] + 0.0001)), "COLLISION_VERTEX_OUTSIDE_BOUNDS");
    } else issue("COLLISION_SHAPE_TYPE");
  }
  return { shapes: data.shapes.length, metadataChecked: true, actualRuntimeSweep: "not_checked" };
}

export function validateAssets(files, { privatePatterns = [], spatial } = {}) {
  const externalImages = new Map(files.filter(f => /^assets\/shared\/[a-f0-9]{24}\.ktx2$/u.test(f.path)).map(f => [f.path.slice(7),f.body]));
  const issues = [], checked = [];
  files.forEach((file, assetIndex) => {
    if (!file.path.startsWith("assets/")) return;
    try {
      let result;
      if(file.path==="assets/asset-manifest.json"){scan(parseJSON(file.body),privatePatterns);result={metadataChecked:true,contract:"validated_by_artifact_verifier"};}
      else if (file.path.startsWith("assets/basis/")) {
        const expected = BASIS_DECODER_CONTRACT[file.path];
        check(expected && file.body.length === expected.bytes && createHash("sha256").update(file.body).digest("hex") === expected.sha256, "BASIS_DECODER_IDENTITY");
        result = { bytes: file.body.length, vendorBytes: "exact_three_0.185.1", metadataChecked: "bound_to_reviewed_vendor_bytes" };
      }
      else if (file.path.endsWith(".glb")) { const id = /^assets\/atlas-v8[12]-(rocket|groot|common|atlas)\.glb$/u.exec(file.path)?.[1], island = spatial?.islands?.find(i => i.id === id); result = inspectGLB(file.body, { privatePatterns, externalImages, places: island ? [...island.places, ...island.subInteractions] : [] }); }
      else if (/^assets\/collision\/.+\.json$/u.test(file.path)) { const id = file.path.split("/").at(-1).slice(0, -5); result = inspectCollision(file.body, { privatePatterns, island: spatial?.islands?.find(i => i.id === id) }); }
      else { const ext = file.path.split(".").at(-1), mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2" }[ext]; check(mime, "ASSET_FORMAT_UNSUPPORTED"); result = inspectImage(file.body, mime, { privatePatterns }); }
      checked.push({ assetIndex, ...result });
    } catch (error) { issues.push({ assetIndex, field: error.field ?? "container", code: error.code ?? "ASSET_PARSE_ERROR" }); }
  });
  return { valid: issues.length === 0, issues, checked, privateDictionary: privatePatterns.length ? "checked" : "not_provided", actualVisual: "not_checked" };
}

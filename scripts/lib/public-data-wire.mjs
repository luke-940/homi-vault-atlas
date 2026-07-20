import { createHash } from "node:crypto";

const packNamePattern = /^[a-z][a-z0-9-]*$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requirePackName(name) {
  if (typeof name !== "string" || !packNamePattern.test(name)) {
    throw new TypeError(`Invalid public pack name ${JSON.stringify(name)}.`);
  }
  return name;
}

export function canonicalPublicJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializePublicBrowserPackFromJson(name, jsonText) {
  requirePackName(name);
  if (typeof jsonText !== "string") {
    throw new TypeError("Public browser pack serialization requires JSON text.");
  }
  JSON.parse(jsonText);
  const jsonSha256 = sha256(jsonText);
  return `/* homi-atlas-public-pack:${name}:${jsonSha256} */\nwindow.__HOMI_ATLAS_V7_PACKS__ = window.__HOMI_ATLAS_V7_PACKS__ || {};\nwindow.__HOMI_ATLAS_V7_PACKS__[${JSON.stringify(name)}] = JSON.parse(${JSON.stringify(jsonText)});\n`;
}

export function createPublicPackArtifacts(name, value) {
  const jsonText = canonicalPublicJson(value);
  const jsText = serializePublicBrowserPackFromJson(name, jsonText);
  return {
    name,
    value,
    jsonText,
    jsText,
    jsonSha256: sha256(jsonText),
    jsSha256: sha256(jsText),
  };
}

export function parsePublicBrowserPack(jsText) {
  if (typeof jsText !== "string") {
    throw new TypeError("Public browser pack parser requires JavaScript text.");
  }
  const marker = /^\/\* homi-atlas-public-pack:([a-z][a-z0-9-]*):([a-f0-9]{64}) \*\/\n/.exec(jsText);
  if (!marker) throw new Error("Public browser pack marker is missing or malformed.");
  const [, name, declaredJsonSha256] = marker;
  const prefix = `${marker[0]}window.__HOMI_ATLAS_V7_PACKS__ = window.__HOMI_ATLAS_V7_PACKS__ || {};\nwindow.__HOMI_ATLAS_V7_PACKS__[${JSON.stringify(name)}] = JSON.parse(`;
  if (!jsText.startsWith(prefix) || !jsText.endsWith(");\n")) {
    throw new Error("Public browser pack assignment is not canonical.");
  }
  const encodedJsonText = jsText.slice(prefix.length, -3);
  const jsonText = JSON.parse(encodedJsonText);
  if (typeof jsonText !== "string") {
    throw new Error("Public browser pack does not embed JSON text.");
  }
  const actualJsonSha256 = sha256(jsonText);
  if (declaredJsonSha256 !== actualJsonSha256) {
    throw new Error("Public browser pack JSON hash does not match its exact embedded bytes.");
  }
  return {
    name,
    jsonText,
    jsonSha256: actualJsonSha256,
    value: JSON.parse(jsonText),
  };
}

export function auditPublicPackBinding({ name, jsonText, jsText }) {
  const findings = [];
  let parsedJson = null;
  let parsedWire = null;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    findings.push({
      id: "public-json-invalid",
      path: `data/${name}.json`,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    parsedWire = parsePublicBrowserPack(jsText);
  } catch (error) {
    findings.push({
      id: "public-js-wrapper-invalid",
      path: `data/${name}.js`,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (parsedWire && parsedWire.name !== name) {
    findings.push({ id: "public-pack-name-mismatch", path: `data/${name}.js`, actual: parsedWire.name });
  }
  if (parsedWire && parsedWire.jsonText !== jsonText) {
    findings.push({
      id: "public-json-js-byte-mismatch",
      path: `data/${name}.js`,
      expected: sha256(jsonText),
      actual: parsedWire.jsonSha256,
    });
  }
  if (parsedJson && parsedWire && JSON.stringify(parsedWire.value) !== JSON.stringify(parsedJson)) {
    findings.push({ id: "public-json-js-value-mismatch", path: `data/${name}.js` });
  }
  return {
    name,
    jsonSha256: sha256(jsonText),
    jsSha256: sha256(jsText),
    exactJsonBytesEmbedded: Boolean(parsedWire && parsedWire.jsonText === jsonText),
    deepEqual: Boolean(parsedJson && parsedWire && JSON.stringify(parsedWire.value) === JSON.stringify(parsedJson)),
    findings,
    pass: findings.length === 0,
  };
}

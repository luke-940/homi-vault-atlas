import { readFileSync } from "node:fs";
import path from "node:path";

const names = [
  "agency",
  "bootstrap",
  "structure",
  "relation",
  "flow",
  "temporal",
  "entity",
  "health",
  "insight",
  "publication",
] as const;

export function readPublicAtlasPacks() {
  return Object.fromEntries(names.map((name) => [
    name,
    JSON.parse(readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8")),
  ]));
}

export function installPublicAtlasDomFixture() {
  const packs = readPublicAtlasPacks();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __HOMI_ATLAS_V7_PACKS__: packs },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  return packs;
}

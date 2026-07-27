import type { SemanticSpaceModule } from "./semantic-space-contract";

let modulePromise: Promise<SemanticSpaceModule> | null = null;

export function semanticSpaceSupported() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (window.matchMedia("(max-width: 820px)").matches) return false;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function loadSemanticSpaceModule() {
  if (window.HomiAtlasSemanticSpace) return Promise.resolve(window.HomiAtlasSemanticSpace);
  if (modulePromise) return modulePromise;
  modulePromise = new Promise<SemanticSpaceModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(__ATLAS_SEMANTIC_SPACE_ASSET__, document.baseURI).href;
    script.async = true;
    script.dataset.atlasSemanticSpace = "v1";
    script.addEventListener("load", () => {
      if (!window.HomiAtlasSemanticSpace) {
        modulePromise = null;
        reject(new Error("Semantic space module loaded without registering its controller."));
        return;
      }
      resolve(window.HomiAtlasSemanticSpace);
    }, { once: true });
    script.addEventListener("error", () => {
      modulePromise = null;
      reject(new Error("Semantic space module could not be loaded."));
    }, { once: true });
    document.head.append(script);
  });
  return modulePromise;
}


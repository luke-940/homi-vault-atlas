import { SemanticSpaceEngine } from "./graph/semantic-space-engine";
import type { SemanticSpaceModule } from "./graph/semantic-space-contract";

const semanticSpaceModule: SemanticSpaceModule = {
  version: "atlas.semantic_space_renderer.v1",
  mount(container, scene, callbacks) {
    return new SemanticSpaceEngine(container, scene, callbacks);
  },
};

window.HomiAtlasSemanticSpace = semanticSpaceModule;


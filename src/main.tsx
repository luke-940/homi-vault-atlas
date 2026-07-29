import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AtlasApp } from "./app/App";
import { loadAtlasRuntime } from "./app/data";
import { AtlasProvider } from "./app/state";
import { KnowledgeProvider } from "./knowledge/KnowledgeProvider";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Atlas root is missing.");

try {
  const runtime = loadAtlasRuntime();
  createRoot(root).render(
    <StrictMode>
      <AtlasProvider runtime={runtime}>
        <KnowledgeProvider index={runtime.knowledge}>
          <AtlasApp />
        </KnowledgeProvider>
      </AtlasProvider>
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const boundary = document.createElement("main");
  boundary.className = "fatal-boundary";
  const label = document.createElement("p");
  label.textContent = "ATLAS DATA BOUNDARY";
  const title = document.createElement("h1");
  title.textContent = "지식 스냅샷을 열지 못했습니다.";
  const detail = document.createElement("span");
  detail.textContent = message;
  boundary.append(label, title, detail);
  root.replaceChildren(boundary);
}

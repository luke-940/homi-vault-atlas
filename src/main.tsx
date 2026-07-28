import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AtlasApp } from "./app/App";
import { loadAtlasRuntime } from "./app/data";
import { AtlasProvider } from "./app/state";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Atlas root is missing.");

try {
  const runtime = loadAtlasRuntime();
  createRoot(root).render(
    <StrictMode>
      <AtlasProvider runtime={runtime}>
        <AtlasApp />
      </AtlasProvider>
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <main class="fatal-boundary">
      <p>ATLAS DATA BOUNDARY</p>
      <h1>지식 스냅샷을 열지 못했습니다.</h1>
      <span>${message.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
    </main>
  `;
}

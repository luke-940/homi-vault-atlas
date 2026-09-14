import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<App />);

const readyObserver=new MutationObserver(()=>{if(document.querySelector(".topbar, #reading-content")){document.documentElement.dataset.atlasUiReady=performance.now().toFixed(1);readyObserver.disconnect();}});
readyObserver.observe(document.getElementById("root")!,{childList:true,subtree:true});

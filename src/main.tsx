import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { App } from "./App";
import { AtlasStateProvider } from "./state";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/v74.css";

class AtlasErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Atlas v7.4 render boundary", error, info.componentStack);
  }

  recover = () => {
    const safeHash = "#home";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${safeHash}`);
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <section className="fatal-boundary" role="alert">
          <span>화면 안전 경계 작동</span>
          <h1>Atlas 화면을 안전하게 멈췄습니다</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={this.recover}>안전한 첫 화면으로 다시 열기</button>
        </section>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.48, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <AtlasErrorBoundary>
          <AtlasStateProvider>
            <App />
          </AtlasStateProvider>
        </AtlasErrorBoundary>
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);

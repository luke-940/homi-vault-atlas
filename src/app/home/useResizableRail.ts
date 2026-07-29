import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const STORAGE_KEY = "homi-atlas:home-rail-width";
const MIN_WIDTH = 360;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 430;

function clampWidth(value: number) {
  const viewportLimit = typeof window === "undefined"
    ? MAX_WIDTH
    : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth * 0.42));
  return Math.round(Math.min(viewportLimit, Math.max(MIN_WIDTH, value)));
}

function initialWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const stored = Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) ?? "", 10);
  return clampWidth(Number.isFinite(stored) ? stored : DEFAULT_WIDTH);
}

export function useResizableRail() {
  const layoutRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const liveWidthRef = useRef(initialWidth());
  const [width, setWidth] = useState(liveWidthRef.current);

  const applyWidth = useCallback((next: number) => {
    const safe = clampWidth(next);
    liveWidthRef.current = safe;
    layoutRef.current?.style.setProperty("--home-rail-width", `${safe}px`);
    return safe;
  }, []);

  const commitWidth = useCallback((next: number) => {
    const safe = applyWidth(next);
    setWidth(safe);
    window.sessionStorage.setItem(STORAGE_KEY, String(safe));
  }, [applyWidth]);

  useEffect(() => {
    applyWidth(width);
    const onResize = () => commitWidth(liveWidthRef.current);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [applyWidth, commitWidth, width]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = liveWidthRef.current;
    handle.setPointerCapture(pointerId);
    document.documentElement.dataset.railResizing = "true";

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const next = startWidth + moveEvent.clientX - startX;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        applyWidth(next);
      });
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete document.documentElement.dataset.railResizing;
      commitWidth(liveWidthRef.current);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }, [applyWidth, commitWidth]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowLeft") commitWidth(liveWidthRef.current - delta);
    else if (event.key === "ArrowRight") commitWidth(liveWidthRef.current + delta);
    else if (event.key === "Home") commitWidth(MIN_WIDTH);
    else if (event.key === "End") commitWidth(MAX_WIDTH);
    else return;
    event.preventDefault();
  }, [commitWidth]);

  return {
    layoutRef,
    layoutStyle: { "--home-rail-width": `${width}px` } as CSSProperties,
    separatorProps: {
      role: "separator" as const,
      "aria-label": "Map Console 너비 조절",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": MIN_WIDTH,
      "aria-valuemax": MAX_WIDTH,
      "aria-valuenow": width,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    },
  };
}

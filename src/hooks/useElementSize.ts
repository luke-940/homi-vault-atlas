import { useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

export function normalizeObservedSize(width: number, height: number): ElementSize {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function sameElementSize(left: ElementSize, right: ElementSize) {
  return left.width === right.width && left.height === right.height;
}

export function useElementSize<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const committedSizeRef = useRef(size);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let animationFrame = 0;
    let pendingSize: ElementSize | null = null;
    const commit = () => {
      animationFrame = 0;
      if (!pendingSize || sameElementSize(committedSizeRef.current, pendingSize)) return;
      committedSizeRef.current = pendingSize;
      setSize(pendingSize);
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      pendingSize = normalizeObservedSize(width, height);
      if (!animationFrame) animationFrame = requestAnimationFrame(commit);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return { ref, ...size };
}

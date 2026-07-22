import type { ComponentPropsWithoutRef } from "react";

export function SpatialWorkspaceFrame({ className = "", ...props }: ComponentPropsWithoutRef<"section">) {
  return <section {...props} className={`spatial-workspace-frame ${className}`.trim()} />;
}

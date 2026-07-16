export type TrayDialogKeyIntent = "close" | "trap-focus" | "ignore";

export function trayDialogKeyIntent(
  key: string,
  isMobile: boolean,
  escapeClosesOnDesktop: boolean,
): TrayDialogKeyIntent {
  if (key === "Escape" && (isMobile || escapeClosesOnDesktop)) return "close";
  if (key === "Tab" && isMobile) return "trap-focus";
  return "ignore";
}

export type TrayDialogKeyIntent = "close" | "trap-focus" | "ignore";
export type ModalInertOwner = "search" | "tray";

function inertOwnerAttribute(owner: ModalInertOwner) {
  return `data-atlas-${owner}-inert`;
}

export function claimModalInert(target: HTMLElement | null, owner: ModalInertOwner) {
  if (!target) return;
  target.setAttribute(inertOwnerAttribute(owner), "");
  target.setAttribute("inert", "");
}

export function releaseModalInert(target: HTMLElement | null, owner: ModalInertOwner) {
  if (!target) return;
  target.removeAttribute(inertOwnerAttribute(owner));
  const retained = owner === "search" ? "tray" : "search";
  if (!target.hasAttribute(inertOwnerAttribute(retained))) target.removeAttribute("inert");
}

export function trayDialogKeyIntent(
  key: string,
  isMobile: boolean,
  escapeClosesOnDesktop: boolean,
): TrayDialogKeyIntent {
  if (key === "Escape" && (isMobile || escapeClosesOnDesktop)) return "close";
  if (key === "Tab" && isMobile) return "trap-focus";
  return "ignore";
}

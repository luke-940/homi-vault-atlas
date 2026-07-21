import {
  ArrowLeft,
  Binoculars,
  Compass,
  Database,
  Focus,
  GitBranch,
  Menu,
  Minimize2,
  Network,
  Route,
  Search,
  X,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { useAtlasState } from "../state";
import { atlasData } from "../data-runtime";
import type { Workspace } from "../types";
import homiMark from "../assets/brand/homi-mark-amber.svg";

const allWorkspaceItems: Array<{
  id: Exclude<Workspace, "home">;
  label: string;
  icon: typeof Compass;
}> = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "observe", label: "Observe", icon: Binoculars },
  { id: "flow", label: "Flow", icon: Route },
  { id: "time", label: "Time", icon: GitBranch },
  { id: "agency", label: "Agency", icon: Network },
];

export const workspaceItems = allWorkspaceItems.filter((item) => item.id !== "time" || atlasData.temporal.eras.length > 0);

const rovingWorkspaceIds: Workspace[] = ["home", ...workspaceItems.map((item) => item.id)];

function HomiMark() {
  return (
    <span className="brand-mark-crop" aria-hidden="true">
      <img className="brand-mark" src={homiMark} alt="" />
    </span>
  );
}

export function CommandBar() {
  const { state, dispatch } = useAtlasState();

  const handleWorkspaceKey = (event: KeyboardEvent<HTMLButtonElement>, workspace: Workspace) => {
    const index = rovingWorkspaceIds.indexOf(workspace);
    const last = rovingWorkspaceIds.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = rovingWorkspaceIds[nextIndex];
    dispatch({ type: "workspace", workspace: next });
    requestAnimationFrame(() => document.getElementById(`workspace-tab-${next}`)?.focus());
  };

  return (
    <header className="command-bar" lang="en">
      <button
        className={state.workspace === "home" ? "brand-lockup is-current" : "brand-lockup"}
        id="workspace-tab-home"
        type="button"
        onClick={() => dispatch({ type: "workspace", workspace: "home" })}
        onKeyDown={(event) => handleWorkspaceKey(event, "home")}
        tabIndex={state.workspace === "home" ? 0 : -1}
        aria-label="Homi Vault Atlas Home"
        aria-current={state.workspace === "home" ? "page" : undefined}
        aria-controls="workspace-panel-home"
      >
        <HomiMark />
        <strong>Homi Vault Atlas</strong>
      </button>

      <nav className="workspace-tabs" aria-label="Atlas workspaces">
        {workspaceItems.map((item) => (
          <button
            key={item.id}
            id={`workspace-tab-${item.id}`}
            className={state.workspace === item.id ? "workspace-tab is-active" : "workspace-tab"}
            type="button"
            onClick={() => dispatch({ type: "workspace", workspace: item.id })}
            onKeyDown={(event) => handleWorkspaceKey(event, item.id)}
            tabIndex={state.workspace === item.id ? 0 : -1}
            aria-current={state.workspace === item.id ? "page" : undefined}
            aria-controls={`workspace-panel-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="command-actions">
        {state.navigationHistory.length > 0 && (
          <button
            className="icon-button semantic-back"
            type="button"
            onClick={() => dispatch({ type: "back" })}
            aria-label="Go back to the previous Atlas scene"
            title="Back (Esc)"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        {state.theatre && (
          <button
            className="icon-button theatre-exit is-active"
            type="button"
            onClick={() => dispatch({ type: "theatre", open: false })}
            aria-label="Close theatre view"
            title="Close theatre view (Esc)"
          >
            <Minimize2 size={18} aria-hidden="true" />
          </button>
        )}
        <button
          className="tool-button search-trigger"
          type="button"
          onClick={() => dispatch({ type: "search", open: true })}
          aria-label="Search knowledge and operating roles"
          title="Search (⌘K)"
        >
          <Search size={17} aria-hidden="true" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          id="navigator-trigger"
          className={state.panel === "navigator" ? "icon-button panel-trigger is-active" : "icon-button panel-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "navigator" })}
          aria-label={state.panel === "navigator" ? "Close navigator" : "Open navigator"}
          aria-expanded={state.panel === "navigator"}
          aria-controls="atlas-navigator-tray"
          aria-haspopup="dialog"
          title="Navigator"
        >
          {state.panel === "navigator" ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button
          id="inspector-trigger"
          className={state.panel === "inspector" ? "icon-button panel-trigger is-active" : "icon-button panel-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "inspector" })}
          aria-label={state.panel === "inspector" ? "Close selection details" : "Open selection details"}
          aria-expanded={state.panel === "inspector"}
          aria-controls="atlas-inspector-tray"
          aria-haspopup="dialog"
          title="Focus"
        >
          <Focus size={18} />
        </button>
        <button
          id="data-trigger"
          className={state.panel === "data" ? "icon-button panel-trigger data-trigger is-active" : "icon-button panel-trigger data-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "data" })}
          aria-label={state.panel === "data" ? "Close evidence boundary" : "Open evidence boundary"}
          aria-expanded={state.panel === "data"}
          aria-controls="atlas-inspector-tray"
          aria-haspopup="dialog"
          title="Evidence"
        >
          <Database size={18} />
        </button>
      </div>
    </header>
  );
}

export function MobileNavigation() {
  const { state, dispatch } = useAtlasState();
  return (
    <nav className="mobile-navigation" aria-label="Atlas workspaces">
      {workspaceItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={state.workspace === id ? "is-active" : ""}
          onClick={() => dispatch({ type: "workspace", workspace: id })}
          aria-current={state.workspace === id ? "page" : undefined}
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

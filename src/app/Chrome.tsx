import {
  Activity,
  Compass,
  Network,
  Orbit,
  Search,
  UsersRound,
} from "lucide-react";
import type { Workspace } from "./contracts";
import { useAtlas } from "./state";

const navigation: Array<{ id: Workspace; label: string; icon: typeof Orbit }> = [
  { id: "explore", label: "Explore", icon: Orbit },
  { id: "observe", label: "Observe", icon: Network },
  { id: "flow", label: "Flow", icon: Compass },
  { id: "time", label: "Time", icon: Activity },
  { id: "agency", label: "Agency", icon: UsersRound },
];

export function AtlasChrome() {
  const atlas = useAtlas();
  return (
    <header className="atlas-chrome">
      <button
        type="button"
        className="atlas-brand"
        onClick={() => atlas.goWorkspace("home")}
        aria-current={atlas.route.workspace === "home" ? "page" : undefined}
      >
        <img src="./assets/brand/homi-mark-amber.svg" alt="" />
        <span>Homi Vault Atlas</span>
      </button>
      <nav aria-label="Primary workspaces" className="atlas-nav">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => atlas.goWorkspace(id)}
            aria-current={atlas.route.workspace === id ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={15} strokeWidth={1.7} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="search-trigger"
        onClick={() => atlas.setSearchOpen(true)}
        aria-label="Search Atlas"
      >
        <Search aria-hidden="true" size={16} />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
  );
}

export function MobileNavigation() {
  const atlas = useAtlas();
  return (
    <nav className="mobile-navigation" aria-label="Mobile workspaces">
      {navigation.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => atlas.goWorkspace(id)}
          aria-current={atlas.route.workspace === id ? "page" : undefined}
        >
          <Icon aria-hidden="true" size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}


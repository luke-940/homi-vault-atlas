import { useEffect } from "react";
import { Agency, Flow, Observe, Time } from "./AnalysisViews";
import { AtlasChrome, MobileNavigation } from "./Chrome";
import { Explore } from "./Explore";
import { Home } from "./Home";
import { SearchVeil } from "./SearchVeil";
import { useAtlas } from "./state";

const workspaceTitles = {
  home: "Whole Vault",
  explore: "Explore",
  observe: "Observe",
  flow: "Flow",
  time: "Time",
  agency: "Agency",
} as const;

export function AtlasApp() {
  const atlas = useAtlas();
  useEffect(() => {
    document.title = `${workspaceTitles[atlas.route.workspace]} · Homi Vault Atlas`;
  }, [atlas.route.workspace]);
  return (
    <div className="atlas-app">
      <AtlasChrome />
      {atlas.route.workspace === "home" ? <Home /> : null}
      {atlas.route.workspace === "explore" ? <Explore /> : null}
      {atlas.route.workspace === "observe" ? <Observe /> : null}
      {atlas.route.workspace === "flow" ? <Flow /> : null}
      {atlas.route.workspace === "time" ? <Time /> : null}
      {atlas.route.workspace === "agency" ? <Agency /> : null}
      <SearchVeil />
      <MobileNavigation />
    </div>
  );
}


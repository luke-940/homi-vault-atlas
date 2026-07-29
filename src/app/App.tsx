import { useEffect } from "react";
import { Agency, Flow, Time } from "./AnalysisViews";
import { AtlasChrome, MobileNavigation } from "./Chrome";
import { Explore } from "./Explore";
import { Home } from "./Home";
import { Observe } from "./observe/Observe";
import { SearchVeil } from "./SearchVeil";
import { SafeSourceReader } from "../knowledge/SafeSourceReader";
import { useAtlas } from "./state";

const workspaceTitles = {
  home: "Homi Vault",
  explore: "Explore",
  observe: "Observe",
  flow: "Flow",
  time: "Time",
  agency: "Agency",
  read: "Safe Source Reader",
} as const;

export function AtlasApp() {
  const atlas = useAtlas();
  useEffect(() => {
    document.title = atlas.route.workspace === "home"
      ? "Homi Vault Atlas"
      : `${workspaceTitles[atlas.route.workspace]} · Homi Vault Atlas`;
  }, [atlas.route.workspace]);
  const readerOpen = atlas.route.workspace === "read";
  return (
    <div className={`atlas-app${readerOpen ? " atlas-app--reader-open" : ""}`}>
      <AtlasChrome />
      {atlas.route.workspace === "home"
        || readerOpen && atlas.readerOriginWorkspace === "home" ? <Home /> : null}
      {atlas.route.workspace === "explore"
        || readerOpen && atlas.readerOriginWorkspace === "explore" ? <Explore /> : null}
      {atlas.route.workspace === "observe" ? <Observe /> : null}
      {atlas.route.workspace === "flow" ? <Flow /> : null}
      {atlas.route.workspace === "time" ? <Time /> : null}
      {atlas.route.workspace === "agency" ? <Agency /> : null}
      {atlas.route.workspace === "read" ? <SafeSourceReader /> : null}
      <SearchVeil />
      {atlas.route.workspace === "read" ? null : <MobileNavigation />}
    </div>
  );
}

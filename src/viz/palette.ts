const canonicalDistrict = (district: string) => ({
  MOC: "중심 지식",
  Papers: "연구 논거",
  Strategy: "전략",
  Signals: "신호",
  Research: "연구 기록",
  "Console/Homi": "운영 기반",
  "Console/Agent": "운영 기반",
  "Console/Templates": "운영 기반",
}[district] ?? district);

export const districtColorRoles = Object.freeze({
  "중심 지식": "#4fd5b9",
  "연구 논거": "#6f91f4",
  전략: "#f0a04b",
  신호: "#f36f87",
  "운영 기반": "#a8d05f",
  Rocket: "#ae82e3",
  Groot: "#55c994",
  "Intelligence Layer": "#759dde",
  "Independent Projects": "#9d83dc",
  "연구 기록": "#57b9cf",
  "공개 근거 경계": "#8c8a91",
} as const);

export const districtStrokeColorRoles = Object.freeze({
  "중심 지식": "var(--district-knowledge)",
  "연구 논거": "var(--district-research)",
  전략: "var(--district-strategy)",
  신호: "var(--district-signal)",
  "운영 기반": "var(--district-operations)",
  Rocket: "var(--district-rocket)",
  Groot: "var(--district-groot)",
  "Intelligence Layer": "var(--district-intelligence)",
  "Independent Projects": "var(--district-independent)",
  "연구 기록": "var(--district-research-records)",
  "공개 근거 경계": "#5e656c",
} as const);

export const colorForDistrict = (district: string) =>
  districtColorRoles[canonicalDistrict(district) as keyof typeof districtColorRoles] ?? "#c8cfcb";

export const strokeColorForDistrict = (district: string) =>
  districtStrokeColorRoles[canonicalDistrict(district) as keyof typeof districtStrokeColorRoles] ?? "var(--district-neutral)";

export const shortDistrictLabel = (district: string) => {
  const leaf = district.split("/").at(-1) ?? district;
  return leaf === "Intelligence Layer" ? "Intel" : leaf;
};

export const relationColors = {
  wikilink: "#4fd5b9",
  typed: "#ae82e3",
  route: "#f0a04b",
} as const;

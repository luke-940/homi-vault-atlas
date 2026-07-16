export const districtColorRoles = Object.freeze({
  "중심 지식": "var(--district-knowledge-fill)",
  MOC: "var(--district-knowledge-fill)",
  "연구 논거": "var(--district-research-fill)",
  Papers: "var(--district-research-fill)",
  Research: "var(--district-research-fill)",
  Rocket: "var(--district-research-fill)",
  전략: "var(--district-strategy-fill)",
  Strategy: "var(--district-strategy-fill)",
  Groot: "var(--district-strategy-fill)",
  신호: "var(--district-signal-fill)",
  Signals: "var(--district-signal-fill)",
  "운영 기반": "var(--district-operations-fill)",
  "Console/Homi": "var(--district-operations-fill)",
  "Console/Agent": "var(--district-operations-fill)",
  "Console/Templates": "var(--district-operations-fill)",
  "Intelligence Layer": "var(--district-operations-fill)",
  "공개 근거 경계": "var(--public-boundary-fill)",
} as const);

export const colorForDistrict = (district: string) =>
  districtColorRoles[district as keyof typeof districtColorRoles] ?? "var(--district-neutral-fill)";

export const shortDistrictLabel = (district: string) => {
  const leaf = district.split("/").at(-1) ?? district;
  return leaf === "Intelligence Layer" ? "Intel" : leaf;
};

export const relationColors = {
  wikilink: "#6f9f94",
  typed: "#7561b3",
  route: "#d08a51",
} as const;

const districtPalette = [
  "#b8d4f0",
  "#c8e9df",
  "#d8e5df",
  "#a9d9cf",
  "#d9e8ad",
  "#f3cda9",
  "#d5c3ef",
  "#b9e0ec",
  "#efbaba",
  "#cfd7dd",
  "#cfc5e9",
  "#dce3df",
];

const districtHash = (district: string) => [...district]
  .reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);

export const colorForDistrict = (district: string) =>
  districtPalette[districtHash(district) % districtPalette.length];

export const shortDistrictLabel = (district: string) => {
  const leaf = district.split("/").at(-1) ?? district;
  return leaf === "Intelligence Layer" ? "Intel" : leaf;
};

export const relationColors = {
  wikilink: "#6f9f94",
  typed: "#7561b3",
  route: "#d08a51",
} as const;

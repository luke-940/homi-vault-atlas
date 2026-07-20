import { describe, expect, test } from "vitest";
import {
  collectRenderedCodePoints,
  parseUnicodeRanges,
  selectPretendardSubset,
} from "../scripts/lib/pretendard-subset.mjs";

const fixtureCss = `/* Pretendard license */
/* [0] */
@font-face {
  font-family: 'Pretendard Variable';
  src: url(./woff2-dynamic-subset/PretendardVariable.subset.0.woff2) format('woff2-variations');
  unicode-range: U+20-7e;
}
/* [1] */
@font-face {
  font-family: 'Pretendard Variable';
  src: url(./woff2-dynamic-subset/PretendardVariable.subset.1.woff2) format('woff2-variations');
  unicode-range: U+ac00-d7a3;
}
/* [2] */
@font-face {
  font-family: 'Pretendard Variable';
  src: url(./woff2-dynamic-subset/PretendardVariable.subset.2.woff2) format('woff2-variations');
  unicode-range: U+1f300-1f5ff;
}
`;

describe("Pretendard build-time glyph subset contract", () => {
  test("parses exact and wildcard unicode ranges", () => {
    expect(parseUnicodeRanges("U+41-5a, U+4??")).toEqual([
      { start: 0x41, end: 0x5a },
      { start: 0x400, end: 0x4ff },
    ]);
  });

  test("keeps only assets intersecting actual rendered text", () => {
    const codePoints = collectRenderedCodePoints(["Homi Vault Atlas", "지식 지형"]);
    const subset = selectPretendardSubset(fixtureCss, codePoints);
    expect(subset.originalCount).toBe(3);
    expect(subset.selectedIndices).toEqual([0, 1]);
    expect(subset.selectedFiles).toEqual([
      "PretendardVariable.subset.0.woff2",
      "PretendardVariable.subset.1.woff2",
    ]);
    expect(subset.css).toContain("Pretendard license");
    expect(subset.css).not.toContain("subset.2.woff2");
  });
});

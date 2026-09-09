# Font notices

The fonts shipped with this project are licensed under the SIL Open Font License 1.1. The font licenses remain separate from the application license.

## atlas-serif.woff2 — Atlas Serif Bold

Based on NanumMyeongjo Bold from the official Google Fonts repository, commit `f12cf9db03e887b61a34ead809ec1b632bd013b5`.

- Source: https://github.com/google/fonts/tree/f12cf9db03e887b61a34ead809ec1b632bd013b5/ofl/nanummyeongjo
- Upstream copyright and full license: [atlas-serif-OFL.txt](atlas-serif-OFL.txt)
- Upstream Reserved Font Name warning: [atlas-serif-UPSTREAM-README.txt](atlas-serif-UPSTREAM-README.txt)
- Modified font family: **Atlas Serif**; full name: **Atlas Serif Bold**; PostScript name: **AtlasSerif-Bold**.
- Modification: converted to WOFF2 and subset using fontTools to the complete shipped Atlas text and UI, plus basic typing characters. Unused glyphs are omitted to reduce first-visit transfer. All Korean syllables used in the shipped text are retained. No outline was deliberately redesigned. Text outside this subset uses the site's system-font fallback.
- Original copyright, trademark, manufacturer and designer notices are retained. The English license metadata additionally contains the full upstream OFL.
- The modified font is distributed under the same SIL Open Font License 1.1. No upstream author or copyright holder endorsement is implied.

## atlas-sans.woff2 — Atlas Sans

Based on `PretendardVariable.woff2` distributed with Pretendard **1.3.9**. The modified family is **Atlas Sans** and the PostScript name is **AtlasSans-Regular**. It is subset to the complete shipped Atlas text and UI, plus basic typing characters. The variable weight axis and original glyph outlines are retained. Original copyright and license metadata are preserved. The modified font remains under SIL OFL 1.1; no upstream endorsement is implied.

- Source: https://github.com/orioncactus/pretendard
- License and copyright notice: [atlas-sans-OFL.txt](atlas-sans-OFL.txt)
- SHA-256 of the upstream font used before modification: `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4`

When packaging a site or release that includes these font files, include these notices and the accompanying license files in a separate `licenses/` directory. Required dependency attribution is not product advertising.

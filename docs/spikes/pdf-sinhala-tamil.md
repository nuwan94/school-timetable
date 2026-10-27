# Spike: Sinhala / Tamil PDF output (P0)

**Question.** How do we produce PDFs of timetable sheets that print correctly at a print shop and can be shared on WhatsApp, with correct Sinhala and Tamil text shaping?

**Date.** 2026-10-27

**Code.**
- `src/features/spike/` (the in-app "PDF test" screen)
- Sample strings that stress shaping:
  - Sinhala: ZWJ conjuncts (ශ්‍රී, ප්‍ර, ද්‍ය), the pre-base vowel signs ෙ / ො / ේ / ෝ, and බ්‍රහස්පතින්දා.
  - Tamil: the split / pre-base vowels தொ, பெ, கை, plus ஸ்ரீ and க்ஷ.

## Results

| Path | Sinhala | Tamil | Text selectable | Size (1 A4 page) | One tap? |
|---|---|---|---|---|---|
| **A. Browser print engine** (`window.print()`, Save as PDF) | ✅ same engine as screen | ✅ | ✅ | small | ❌ needs print dialog |
| **B. Vector PDF**: pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1, embedded Noto | ❌ **broken** | ✅ with `subset: true` · ❌ without | ✅ | 11–14 KB | ✅ |
| **C. Image PDF**: html-to-image → PNG → pdf-lib page | ✅ identical to screen | ✅ | ❌ (image) | ~180 KB at 3× | ✅ |

### Details for B (the vector PDF)

- @pdf-lib/fontkit needs a global `regeneratorRuntime`. Without it, it throws as soon as the Indic shaper runs. Workaround: `import 'regenerator-runtime/runtime'`.
- Even with that workaround, three things go wrong with Sinhala:
  - **It crashes** on any Sinhala word that *ends* in ේ or ෝ (e.g. කේ, කළේ, කෝ). The error is `Cannot read properties of null (reading 'syllable')`. Adding a trailing space or ZWNJ does not help. These endings are very common: ගුරුවරයාගේ, පාසලේ.
  - With `subset: true`, most Sinhala glyphs are simply missing from the output.
  - With `subset: false`, the wrong glyphs are drawn. The same happens for Tamil.
- Tamil with `subset: true` renders correctly, including the vowel reordering in கே, பெ, கொ and தொழில்நுட்பம்.
- Conclusion: the vector path is not reliable. It would need either a patched fontkit or a HarfBuzz WASM shaper (≈ 300–400 KB extra). That is not worth it for v1.

### Single-file build

`npm run build:single` produces one file of ~1.9 MB (≈1 MB gzipped). Served on its own over HTTP, it loads all six Noto font subsets from inlined data URIs. The bundle contains no external `src`/`href` or font URLs, and no network requests were recorded in the browser pane.

Not verified: opening it through `file://`. The browser pane cannot open local files, so this needs a manual check by double-clicking `dist-single/index.html`.

## Decision

1. **"Download PDF" / batch PDF / print-shop PDF → path C (image PDF).**
   - Shaping is always identical to the screen.
   - It works offline and on phones, and needs no fonts on the shop's PC.
   - Render at 2× with JPEG for batch outputs to keep file sizes reasonable. At 3× PNG, 110 teacher sheets would be ≈ 20 MB.
2. **"Print" (desktop, selectable text) → path A**, using the dedicated print CSS (`@page` A4, `.print-root`).
3. **PNG for WhatsApp → html-to-image** (the same renderer as C).
4. **Drop path B in P3.** Remove `@pdf-lib/fontkit` and `regenerator-runtime`, and keep `pdf-lib` only to assemble image pages. This also shrinks the bundle: fontkit accounts for a large share of today's 1.36 MB JS chunk.

## Follow-ups (P3)

- Measure 2× JPEG quality and size for a 50-class / 110-teacher batch.
- Print snapshot tests in Playwright, for both A and C.
- Check path A's pagination for the 110-teacher A3 master chart.

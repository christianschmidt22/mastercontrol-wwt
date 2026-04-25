# Font Assets

These woff2 files are NOT committed to the repository (binary assets).
Place them here before running the dev server or building.

## Required files

| File | Source | Notes |
|---|---|---|
| `Fraunces-VariableFont.woff2` | [Google Fonts — Fraunces](https://fonts.google.com/specimen/Fraunces) | Variable font (opsz, wght axes). Subset to U+0000-00FF Latin range. |
| `Switzer-Regular.woff2` | [Fontshare — Switzer](https://www.fontshare.com/fonts/switzer) | wght 400. Subset to U+0000-00FF. |
| `Switzer-Medium.woff2` | Fontshare — Switzer | wght 500. Subset to U+0000-00FF. |
| `Switzer-Semibold.woff2` | Fontshare — Switzer | wght 600. Subset to U+0000-00FF. |

Alternatively use `Switzer-Variable.woff2` (single variable file) if available from Fontshare.

## How to subset

Use `pyftsubset` (part of fonttools) or the Google Fonts subsetting service:

```bash
pip install fonttools brotli
pyftsubset Fraunces-VariableFont.ttf \
  --output-file=Fraunces-VariableFont.woff2 \
  --flavor=woff2 \
  --unicodes="U+0000-00FF"
```

## Gitignore

Add to your local `.gitignore` or the root `.gitignore`:

```
frontend/public/fonts/*.woff2
frontend/public/fonts/*.woff
frontend/public/fonts/*.ttf
```

Binary font files are large and don't diff well; distribute them out-of-band
(e.g. a shared OneDrive folder, a setup script, or a team download link).

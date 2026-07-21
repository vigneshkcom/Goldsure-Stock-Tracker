# Brand assets — upload logos here

Files in `public/` are served at the site root, so `public/assets/foo.png`
is available in the app at `/assets/foo.png`.

## Upload these two logo files (exact names matter)

Drop the official Goldsure logos into this `public/assets/` folder using
**exactly** these names:

| File name | Which logo | Used for |
|-----------|-----------|----------|
| `goldsure-logo-horizontal.png` | **Horizontal** (GS mark + "Goldsure" side by side) | PDF header + app sidebar/branding |
| `goldsure-logo-vertical.png`   | **Vertical** (GS mark above "Goldsure")           | Email signature |

### Format tips
- **PNG with a transparent background** is best — it renders everywhere
  (app, PDF, and email). SVG does **not** render in Gmail/Outlook and can't be
  embedded in the PDF, so PNG is required for those.
- Good sizes: horizontal approx 1000-2000px wide; vertical approx 800-1200px wide.
- If you also have the `.svg` versions, add them too
  (`goldsure-logo-horizontal.svg` / `goldsure-logo-vertical.svg`) — the app
  sidebar can use the crisp SVG, and everything else uses the PNG.

Once these are here, tell me and I'll wire them up:
vertical -> email signature, horizontal -> PDF + app branding.

Nothing breaks before you upload them — the app falls back to the existing
`goldsure-logo.png` and hides anything that is missing.

---

The current placeholder `goldsure-logo.png` (square GS + Goldsure lockup) stays
as the fallback until the horizontal/vertical files are added.

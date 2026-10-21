# Wedding Planner

Compare wedding venues item by item, track which dates each venue can do, and see the whole wedding budget, including the dress, suit, bracelets, hair & makeup and everything else.

**Live app:** https://lrdgrizzly.github.io/wedding-planner/

## What it does

- **Venues**: one card per venue. For every item on a shared checklist you mark **Included**, **Extra cost** (price, how it's charged, and service tax as a % or a fixed amount), **Not offered**, or **Not asked**. Blank prices stay blank; nothing is estimated.
- **Compare**: all venues side by side, with the known total for your guest count, missing prices flagged, "not offered" cells hatched, plus availability and contract terms.
- **Dates**: your candidate dates × venues. Available, on hold (with the hold's expiry date), taken or booked. Holds about to lapse are flagged on the Overview.
- **Budget**: total budget, your chosen venue and everything else, with service tax, status and amount paid.
- **Overview**: "Can we afford it?" — each venue + everything else against your budget.

Per-guest prices are multiplied by the guest count in Settings (65 by default).

## Data & sync

Everything is saved in the browser first, so it works offline. Optionally it syncs to a file called `Wedding Planner.json` in Google Drive, which you can share with your partner so you both edit the same planner from any device. See `src/lib/drive.ts` for how sync works, and Settings → Google Drive sync in the app for the one-time Google Cloud setup.

## Development

```bash
npm install
npm run dev
```

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml` (repo Settings → Pages → Source: **GitHub Actions**).

Built with React, Tailwind CSS and [motion](https://motion.dev), with animation components adapted from [motion-primitives](https://github.com/ibelick/motion-primitives) (MIT).

# GymComp

Gymnastics competition management — setup, live scoring, rankings, and results sharing. Live at [gymcomp.co.uk](https://gymcomp.co.uk).

## Stack

- **Frontend**: React 19 + Vite. No UI framework — global styles live in a CSS template literal (`src/lib/styles.js`).
- **Backend**: Supabase. Auth uses the official SDK (Google OAuth + magic link); data goes through a custom fetch-based REST client (`src/lib/supabase.js`). Score entry syncs over Supabase Realtime.
- **Hosting**: Netlify with GitHub auto-deploy. Netlify functions handle Stripe checkout/billing portal and Loops events.
- **Offline**: scores and competition data queue in localStorage and flush when back online.

## Features

- **Competition setup** — levels (UK Gymnastics list, NGA hierarchy, or custom), WAG/MAG apparatus with drag-to-order rotations, rounds and rotation groups, age ranges, participating clubs with shareable club codes, branding (logo + colour).
- **Scoring modes** — FIG (D/E/bonus/penalty with per-judge execution), NGA (Perfect 10 with courtesy score), and Simple (single final score per routine). Vault can score single, average-of-two, or best-of-two (FIG).
- **Gymnast management** — manual entry and CSV import (auto-adds unknown clubs, levels, and age ranges), bulk actions, withdraw/DNS handling.
- **Live scoring** — organiser score entry plus PIN-based judge (apparatus-locked) and scorekeeper sessions; coach query flags; mid-competition gymnast moves (round, level, age) with score-safety guards.
- **Results & rankings** — per-apparatus and overall views, level and level+age ranking buckets, standard or dense tie ranking.
- **Live sharing** — public results page and club-code-gated coach view (standalone pages in `public/`, polling Supabase), QR code posters.
- **Exports** — branded PDF and XLSX results, judge score sheets, competition agenda, attendance lists.
- **MC mode** — ceremony announcement runner, worst-to-first.
- **Subscriptions** — Stripe-backed plans gate starting a competition.

## Project structure

```
src/
  App.jsx                 root: state, auth, routing, sync
  lib/                    supabase client, scoring, storage, pdf/xlsx builders, styles
  components/
    auth/                 login + profile onboarding
    dashboard/            organiser event list, competition dashboard
    setup/                setup wizard, gymnast management
    competition/          score entry, results, exports, MC mode
    layout/               sidebar, mobile tab bar
    pages/                PIN modals, account, legal
    public/               club submission + review
    shared/               modals, pickers, error boundary
public/
  results.html            public live results (vanilla JS)
  coach.html              coach live view (vanilla JS)
  submit.html             club submission page (vanilla JS)
```

## Development

```bash
npm install
npm run dev        # local dev server
npx vite build     # production build
```

Deploys automatically to Netlify on push to `main`.

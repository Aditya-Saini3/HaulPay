# HaulPay

A cross-platform earnings and load tracker for truck drivers, owner-operators
and small carriers. It answers one question, in the biggest type on the screen:

> **After everything, what did I make on this load, this week, this truck?**

Mapping is OpenStreetMap end to end — MapLibre for rendering, Photon and
Nominatim for addresses, Valhalla for truck routing and mileage. No Google Maps,
no Apple Maps, no Mapbox.

---

## What it does

- **Loads** with any number of stops, drag to reorder, appointment windows and
  reference numbers. Money splits into a linehaul, accessorial line items and
  deductions that can be flat or a percentage of gross.
- **Miles** that tell the truth: loaded, deadhead, and *paid* miles kept
  separate, because the gap between what you ran and what you were paid on is a
  real number and the app shows it.
- **Every pay structure**: cents per mile, percentage of linehaul before or
  after fuel surcharge, hourly with daily or weekly overtime and guaranteed
  daily minimums, flat per load with per-stop pay, and hybrids — *hourly, or
  $0.55/mi, whichever is greater* — which is how local and drayage work actually
  pays.
- **Shifts** for local, drayage and yard drivers whose days do not map to
  discrete loads. Clock in, clock out, and never create a load if you don't want
  to.
- **Effective hourly rate** on every load for every driver regardless of how
  they're paid. A per-mile driver who sat six hours at a receiver made a
  specific, knowable amount per hour.
- **Cost per mile and breakeven** for people who own the truck, with annual
  bills like plates and your 2290 amortized across the year instead of wrecking
  one month. A load booked under breakeven is flagged while you're still typing
  it.
- **Expenses** with 35 prebuilt categories, custom ones that behave identically,
  recurring entries, receipt photos, and fuel entries that capture gallons,
  price, odometer and state for IFTA prep.
- **Reports**: P&L, cost per mile, expenses by category, fuel by state, hours
  and effective hourly, and per-truck P&L for carriers. CSV and PDF, shareable
  straight to a bookkeeper.
- **Fully offline.** Every screen reads from a local SQLite mirror. Writes queue
  and sync when a connection returns. A load entered in a dead zone in Nevada is
  indistinguishable from one entered on wifi.

**Explicitly not in scope:** live GPS tracking, ELD/HOS logging, geofencing,
background location, load boards, dispatch, or anything touching a truck's
telematics. The app never requests background location permission — it is
blocked in the Android manifest. Routes are drawn from addresses you type in.

---

## Requirements

- Node 20 or newer
- A **development build**. MapLibre GL Native is a native module with a config
  plugin, so this project cannot run in Expo Go.
  - iOS: macOS with Xcode 16+
  - Android: Android Studio with a recent SDK, or EAS Build

---

## Getting started

```bash
git clone <this repo> && cd HaulPay
npm install
cp .env.example .env        # works with everything blank — see below
```

### Run it

```bash
npx expo prebuild --clean   # generates ios/ and android/
npm run ios                 # or: npm run android
```

After the first native build, day-to-day work is just:

```bash
npm start                   # dev client, --clear if you changed .env
```

**It runs with an empty `.env`.** With nothing configured the app falls back to
the stub adapters and the local database: address search resolves against a
fixture list of freight hubs, mileage is a straight-line estimate the UI labels
as an estimate, and the map renders a plain background. Every screen is
clickable. Fill the env in when you want the real services.

---

## Wiring up the OSM services

Each of the three sits behind its own adapter (`src/adapters/{map,geocode,route}`),
so switching provider is an env change and one line in `src/adapters/index.ts` —
no screen imports a provider by name.

### Map tiles

**Do not point this at `tile.openstreetmap.org`.** Its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
forbids app traffic of this kind. Pick one:

| Provider | How | Cost |
| --- | --- | --- |
| [MapTiler](https://www.maptiler.com/) | Sign up, copy the style URL for a light and a dark style | Free tier, then per-request |
| [Stadia Maps](https://stadiamaps.com/) | Sign up, use `osm_bright` and `alidade_smooth_dark` | Free for non-commercial, then per-request |
| [Protomaps](https://protomaps.com/) | Download a `.pmtiles` extract, serve it from any static host | Free, self-hosted, zero per-request |

Set `EXPO_PUBLIC_MAP_STYLE_URL_LIGHT` and `_DARK` (and `_MAP_TILE_API_KEY` if
the provider needs one). The app ships light and dark styles and switches with
the theme.

The "© OpenStreetMap contributors" attribution is rendered by the map component
itself on every map view. That is a licence condition of the ODbL — do not
remove it.

### Geocoding

Photon handles type-ahead; Nominatim is a fallback for full-address lookups
Photon comes back empty on.

- **Development:** the public `photon.komoot.io` is fine. Nothing to set.
- **Production:** self-host
  [Photon](https://github.com/komoot/photon) (a JAR plus a downloaded index) or
  point `EXPO_PUBLIC_PHOTON_BASE_URL` at a paid OSM geocoder such as
  [LocationIQ](https://locationiq.com/) or
  [Geocode Earth](https://geocode.earth/).

Set `EXPO_PUBLIC_GEOCODER_USER_AGENT` to something that identifies your app and
gives a contact. Nominatim's
[usage policy](https://operations.osmfoundation.org/policies/nominatim/)
requires it, and a generic User-Agent will get you blocked.

The app enforces the policy on your behalf: input is debounced at 300ms, results
are cached locally, Nominatim requests go through a serial one-per-second queue,
and `NominatimAdapter.autocomplete` **throws on purpose** so it can never be
wired to keystrokes.

### Routing

Valhalla, using its `truck` costing model, which takes `height`, `width`,
`length`, `weight`, `axle_load` and `hazmat` — the same fields as the truck
profile in Settings.

- **Hosted:** [Stadia Maps](https://stadiamaps.com/) offers a Valhalla endpoint.
- **Self-hosted:**
  ```bash
  # A regional extract keeps the build to minutes rather than hours.
  wget https://download.geofabrik.de/north-america/us-midwest-latest.osm.pbf
  docker run -d --name valhalla -p 8002:8002 \
    -v $PWD:/custom_files \
    ghcr.io/gis-ops/docker-valhalla/valhalla:latest
  ```
  Then set `EXPO_PUBLIC_VALHALLA_BASE_URL=http://localhost:8002`.

All stops on a load go into **one** route request as ordered locations, rather
than chained pairwise calls.

**On the tradeoff, stated honestly in the UI too:** OSM truck-restriction
tagging (`maxheight`, `maxweight`, `hgv`) is good in some regions and sparse in
others. Valhalla truck routing is reliable for *mileage and shape*, and the app
labels every route a preview rather than navigation a driver can follow blind.
The mileage field always stays editable, because brokers pay on their own
numbers anyway.

---

## Supabase

```bash
npm i -g supabase
supabase link --project-ref <your-ref>
supabase db push          # applies supabase/migrations in order
```

Three migrations:

1. `..._initial_schema.sql` — twelve tables, money as integer cents
2. `..._rls_policies.sql` — RLS on every table, plus the private `documents`
   storage bucket and its policies
3. `..._seed_expense_categories.sql` — 16 top-level and 19 sub-categories

Then enable the auth providers you want (email, Apple, Google) in the Supabase
dashboard and add `haulpay://auth/callback` to the redirect allow-list.

### Verifying RLS

The policies are testable without a Supabase project:

```bash
PGURL=postgres://postgres@localhost:5432 ./supabase/tests/run.sh
```

That applies a shim for the `auth` and `storage` schemas Supabase provides,
runs the migrations against a scratch database, and asserts the access rules —
including that a driver cannot see another driver's loads, cannot rewrite their
own pay structure, and cannot insert rows under someone else's account.

---

## Testing

```bash
npm test              # the earnings engine and the adapters
npm run typecheck     # tsc --noEmit
npm run lint
```

The `src/earnings` module is deliberately isolated: **pure functions, no React,
no network, no storage, no clock.** It is the reason the app exists, so it is
tested on its own and imported by everything else. The suite covers every pay
structure and the edge cases that actually bite:

- a shift that clocks in at 21:00 and out at 05:30 the next morning
- a settlement week straddling two months (30 Aug – 5 Sep)
- the same 40 hours priced under daily versus weekly overtime
- a guaranteed daily minimum that must not manufacture overtime
- a TONU: a load with zero loaded miles that still made money
- a load whose paid miles are fewer than the miles actually run
- per diem paid once per calendar day, not once per load, and only for nights
  actually spent out

---

## How it's put together

```
app/                    Expo Router routes
  (auth)/               sign in, sign up, Apple, Google
  (onboarding)/         role selection, role-specific setup wizard
  (tabs)/               dashboard, loads, map, shifts, expenses, reports, settings
  loads/ shifts/ expenses/ settings/    editors and sub-screens

src/
  earnings/             THE CORE. Pure, tested, no imports out of this folder.
  adapters/
    map/                MapLibre styles + stub
    geocode/            Photon, Nominatim, cache, debounce + stub
    route/              Valhalla, polyline6 + stub
  db/                   SQLite mirror, models, mappers, repositories
  sync/                 push/pull engine, attachment uploads, triggers
  store/                Zustand: auth, profile, working data set
  ui/                   design system
  theme/                tokens, light and dark palettes
  features/             pay structure form, CSV/PDF export, sync badge

supabase/
  migrations/           schema, RLS, seeds
  tests/                RLS assertions runnable against plain Postgres
```

### Decisions worth knowing

**Money is integer cents, everywhere.** No float touches storage or a
calculation. Rounding is half-away-from-zero, which is what people expect when
they check the math against a rate confirmation.

**Instants carry their UTC offset.** A shift that starts at 23:30 belongs to
that day for the driver who worked it, even though it is already tomorrow in
UTC. Day keys are plain `YYYY-MM-DD` local dates with no zone, so grouping into
settlement weeks needs no timezone math at all.

**A guaranteed daily minimum is a floor on the day's *pay*, not on its hours.**
Show up, work two hours, go home on an eight-hour guarantee, and you're paid
eight hours straight time — but only two hours count toward the overtime
threshold. Overtime is owed on hours worked, not hours paid, so a guarantee can
never manufacture overtime.

**Overtime belongs to the workweek, not the report.** A range that shows two
weeks is priced as two separate overtime periods, and a week that straddles a
month boundary stays one.

**The dirty flag on a row is the whole outbox.** There is no separate queue to
drift out of step with the data. Deletes are tombstones, because a hard local
delete would just be re-pulled from the server.

**Fixed costs are amortized, never dumped.** A $550 Form 2290 is $45.83/month,
so July doesn't look like a disaster and every other month doesn't look
artificially cheap.

---

## Building for a device

```bash
npm i -g eas-cli
eas login
eas build --profile development --platform ios      # or android
```

Install the resulting dev client, then `npm start` and scan the QR code. Because
`EXPO_PUBLIC_*` values are inlined at build time, changing `.env` means
restarting with `npm start -- --clear`.

---

## Licence and attribution

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
available under the [ODbL](https://opendatacommons.org/licenses/odbl/). The
attribution shown on every map view in this app is a condition of that licence.

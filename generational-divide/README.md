# The Generational Divide

Local Vite multi-page dashboard at `/generational-divide/`. Run `npm run dev` or `npm run build` from the repository root. Homepage and clock entry points remain intact. No new dependencies or live API requests.

## Data provenance

Indicator `SL.UEM.1524.ZS`, World Bank WDI, ILO modelled estimates. Both sexes, ages 15–24, percentage of youth labour force. Snapshot retrieved 2026-10-31; API reports last updated 2026-10-08. Years 2000–2025. Attribution: World Bank / ILO, CC BY 4.0 (https://datacatalog.worldbank.org/public-licenses#cc-by).

Observation source: https://api.worldbank.org/v2/country/all/indicator/SL.UEM.1524.ZS?format=json&date=2000:2025&per_page=20000

Economy source: https://api.worldbank.org/v2/country?format=json&per_page=400

Definition: https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SL.UEM.1524.ZS

`data.json` retains unrounded annual values and explicit nulls, plus retrieval and release dates. Countries are World Bank economies whose region ID is not `NA`; these include territories and are not a list of sovereign states. Observations retain aggregate series, but only WLD is displayed as global context. No unweighted global averages. Filters and exports use exact selected-year values; missing values stay blank in CSV and carry a No data status. Country sorting puts missing values last. Trend uses a fixed 0–100 scale and no interpolation. No generation or adult comparison is inferred.

## Refresh

Re-fetch both API URLs; check page count and fetch all pages if needed. Rebuild the same JSON schema (country id/name/region, observations indexed by ISO3 and year), preserving nulls. Update retrieval date, lastUpdated, year range, source notes and tests as appropriate. Review revisions before committing. This is a pinned research snapshot, not an automatic feed.

## Checks

`node --test generational-divide/model.test.js` exercises missing data, zero rates, filtering, sorting, country coverage and source integrity. `npm run build` builds all three pages.

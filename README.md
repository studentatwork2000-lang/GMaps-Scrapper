# Maps Lead Checker

Maps Lead Checker is a lightweight local Chrome/Brave Manifest V3 extension for manually checking Google Maps business leads and exporting saved leads as CSV.

It uses plain HTML, CSS, and JavaScript. It does not use paid extension code, external APIs, a backend, build tools, or npm packages. Saved leads are stored locally with `chrome.storage.local`.

## What it extracts

When opened on a visible Google Maps business profile, the extension attempts to extract:

- `name`
- `brief_location` / address
- `email` when visibly present on the page
- `ph` / phone
- `ratings`
- `no_of_ratings`
- `website_url`
- `website_status`
- `gmaps_link`
- `notes`

Google Maps changes its DOM often, so extraction uses multiple visible-DOM strategies, including headings, buttons, links, text, `aria-label` attributes, and common visible labels such as Website, Phone, Address, Rating, and Reviews. It does not guess missing values.

## Website status logic

- No website URL: `NO WEBSITE`
- Website URL contains `instagram.com`, `facebook.com`, `linktr.ee`, `solo.to`, or `beacons.ai`: `SOCIAL ONLY`
- Website URL contains `ubereats`, `doordash`, `skipthedishes`, `grubhub`, `deliveroo`, or `just-eat`: `ORDERING PLATFORM ONLY`
- Website URL exists and is not social/order platform: `HAS WEBSITE`
- Unclear extraction or invalid URL: `UNCLEAR`

## CSV export columns

CSV exports are downloaded as `maps_leads.csv` with exactly these columns:

```csv
sl no,name,brief location,email,ph,ratings,no of ratings,website status,website url,gmaps link,notes
```

## How to load the extension in Chrome/Brave

1. Open `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load unpacked**.
4. Select this extension folder.

## How to use

1. Open a Google Maps business profile.
2. Click the Maps Lead Checker extension icon.
3. Click **Extract Current Business**.
4. Correct any extracted fields if needed.
5. Click **Save Lead**.
6. Click **Export CSV** to download all saved leads.

## Important limitations and boundaries

- This extension only reads information visibly present in the browser DOM.
- It does not bypass captchas, logins, paywalls, or Google restrictions.
- It does not scrape behind a login.
- It does not use external APIs or a backend.
- It is intended for manual lead verification, correction, saving, and CSV export.

# 🧗 Climb Log

A mobile-friendly climbing log for two (or more) climbers, built on **Google Sheets + Google Apps Script**. Log climbs with photos, browse your history, and compare stats head to head.

## Features
- **Log climbs**: date, indoor/outdoor, location, climb type (boulder, top rope, lead, auto belay, trad), grade (V-scale or YDS), route name, wall or hold colour, star rating, notes and photos.
- **Log for several climbers at once**: each person gets their own result (flash, onsight, send or project), attempts and falls.
- **History**: grouped by day, with thumbnails, filters, full-size photos, and edit/delete.
- **Stats**: head-to-head table, grade pyramid, hardest send per month, falls by grade, monthly activity and climb-type mix. Filter by climber, discipline, setting and time range.
- **Photos** are compressed on the phone and stored in a Google Drive folder.
- **Free**: everything runs on your own Google account.

## Files
| File | What it is |
|---|---|
| `Code.js` | Backend (Apps Script). Shows as `Code.gs` in the online editor |
| `Index.html` | The app page: UI, styles and charts (Chart.js) |
| `appsscript.json` | Apps Script manifest |

## Setup (your own copy)
1. Create a new Google Sheet and open **Extensions → Apps Script**.
2. Paste `Code.js` into `Code.gs`, and add an HTML file named **`Index`** (capital I) with the contents of `Index.html`.
3. Edit the climber names at the top of `Code.gs`:
   ```js
   const CLIMBERS = ['Climber 1', 'Climber 2'];
   ```
4. Save, pick **`setup`** from the function dropdown, and click **Run**. Approve permissions (Advanced → Go to … (unsafe) → Allow). This creates the **Climbs** tab and a **Climb Log Photos** Drive folder.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone with a Google account**
6. Open the web app URL on your phone and **Add to Home Screen**.

## Development workflow (clasp)
```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>        # Project Settings → Script ID
```
- `clasp push` uploads local changes to Apps Script.
- Test at **Deploy → Test deployments**, which always runs the latest pushed code.
- Update the live app without changing its URL:
  ```bash
  clasp list-deployments
  clasp create-deployment --deploymentId <WEB_APP_DEPLOYMENT_ID> --description "vX"
  ```
- `clasp pull` downloads any edits made in the browser editor.

`.clasp.json` is git-ignored because it points at a specific script. Run `clasp clone` or `clasp create` to make your own.

## Notes
- The **Climbs** tab is the database. Don't reorder its columns; add new ones at the end.
- Photos are shared as "anyone with the link can view" so thumbnails load in the app.
- Grade lists, climb types and colours can be customised at the top of the `<script>` in `Index.html`.

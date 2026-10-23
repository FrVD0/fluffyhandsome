# fluffyhandsome.com

The home of ATTACOMIX and Your Uncle Attaboy. A plain static site served by
GitHub Pages; there is no build step.

| Address   | What it is                                  |
|-----------|---------------------------------------------|
| `/`       | Homepage                                    |
| `/read/`  | The Fluffy Handsome Show reader             |
| `/books/` | The shelf (Lulu links)                      |
| `/about/` | How the work and the site are made          |

## Adding new pages (the weekly routine)

1. Drop the new artwork into `series/fluffyhand/`. The page number is the last
   number in the filename, e.g. `Fluffy_Hand_Some_Show_012.png` is page 12.
2. Run:

   ```bash
   npm run add-pages
   ```

   This makes a reading copy (`web/`) and a zoom copy (`full/`) of each new
   page and updates `pages.json`, the list the reader shows.
3. Commit and push. The reader picks up the new pages within a few minutes,
   and returning readers see "N new pages since your last visit."

The original artwork files are never changed and are not uploaded (they stay
on this Mac only, so keep your own backups). To rebuild every image, for
example after changing the quality settings in `scripts/add-pages.mjs`, run
`npm run add-pages -- --force`.

## Where things live

- `assets/css/fancy.css` is the shared design system (colors, type, buttons, header, footer).
- `assets/css/reader.css` and `assets/js/reader.js` are the reader.
- `series/<name>/series.json` marks a folder as a reader series; `pages.json` is generated.
- `scripts/refresh-playlist.mjs` refreshes the YouTube video list on the About page (`assets/js/youtube.js`).

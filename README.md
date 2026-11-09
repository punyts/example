# Northwind Ops

A small back-office app that shows what the StateUI builder libraries do. The whole UI is one JSON app document
(`src/document/`), mounted with `mountApp` from `@punyts/stateui-app` and rendered by the components of
`@punyts/stateui-components`. There is no React, no DI container and no extra framework: behaviour is written as `on`
entries in the document, and the few things that need code go through `onEmit` hooks and store listeners in
`src/bootstrap.ts`.

Next to the app runs an **agent console**: plain HTML outside the StateUI host whose buttons only write to the store.

## Run it

The example uses the packages hoisted into the root `node_modules` of the ai-minion repo; it has no install of its own.
Build the libraries first, then start the example:

```sh
# from the repo root
(cd libraries/stateui-app && npm run build)
(cd libraries/stateui-components && npm run build)

cd libraries/example
npm run dev        # Vite dev server: / is Northwind Ops, /desktop.html is the Lumen desktop
npm run typecheck  # tsc --noEmit
npm run validate   # validateDocument over the app document and the Lumen document; exits 1 on errors
npm run build      # typecheck + vite build into dist/
npm test           # Vitest browser mode (Chromium through Playwright)
npm run icons      # regenerate src/icons.json after adding an icon to the document
```

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page: the `#app` host and the agent console |
| `src/document/app.json` | The app node (`$.app`): the document title and the toasts |
| `src/document/main.json` | The root of the one screen, `main` (`$.screens.main`): header, menu, sections, lists, dialogs, `on` entries |
| `src/document/data.json` | The initial `$.data`: view flags, draft, stats, request slots, the archive's request, records and page |
| `src/document/logic.json` | The document's logic: the archive effect, its compute unit, its status table and the pager rule; the Ridgeline rules and its status table |
| `src/document/locale.de.json` | German text of the app node (the toasts) |
| `src/document/main.locale.de.json` | German text for everything the screen `main` writes itself |
| `src/document/index.ts` | Assembles the app document (locale, theme, data, the app node, the screen `main`, logic, locales) |
| `src/bootstrap.ts` | `startApp`: registration, mount, `onEmit` handlers, store bridges |
| `src/data.ts` | Seeded generators for 240 customers and 10,000 orders, plus stats |
| `src/seed.ts` | Seeded smaller data sets (products, categories, deliveries, support threads, chart figures) and `seedData`, which puts them into the document's data |
| `src/views.ts` | Pure helpers: deliveries in a date range, one page of a list, products of a category, the breadcrumb trail |
| `src/sections.ts` | `showSection`: shows one section and hides the others (the console, the breadcrumb handler and the tests use it) |
| `src/archive.ts` | The fake archive API behind the archive effect (`archive.fetch`, paged, aborts on a newer request) and the `money.format` compute function, passed to `mountApp` as `logicFunctions` |
| `src/ridgeline.ts` | The rules of Ridgeline as pure functions over a JSON game state, and `RIDGELINE_FUNCTIONS` (`ridgelineNew`, `ridgelinePick`, `ridgelineMove`), passed to `mountApp` as logic expression functions |
| `src/warehouse.ts` | The Warehouse files and the `readFile` and `load3d` hooks that serve them |
| `src/assets/` | The dock picture (PNG) and the pallet model (GLB) of the Warehouse section |
| `src/console.ts` | The agent console: store writes and a live JSON excerpt of the store |
| `src/main.ts` | Page entry: `startApp` plus `startConsole` |
| `src/icons.json` | Path data of the non-core icons the document uses (generated) |
| `scripts/validate.ts` | `npm run validate` |
| `scripts/extract-icons.ts` | `npm run icons` |
| `test/app.browser.test.ts` | Browser tests of the running app, the catalog coverage test and a smoke test per section in English and German |
| `test/views.browser.test.ts` | Tests of the seed data and the view helpers |
| `test/ridgeline.browser.test.ts` | Tests of the Ridgeline rules: start, steps, picking, flanking, the ways to win, the move limit |
| `desktop.html` | The page of the Lumen desktop: the `#desktop` host, the full height of the window |
| `src/desktop/desk.ts` | Lumen's pure functions: the window manager (`deskAct`), the file system (`fsAct`, `fsListing`, `fsPick`, saving notes and pictures, uploads), the viewer and the wallpaper paints; `DESK_FUNCTIONS` goes to `mountApp` as expression functions |
| `src/desktop/files.ts` | `openFileStore`: the file store in OPFS (a folder, `lumen` by default), with `transferFile`, `readFile`, `prune` and `desk.json`; it falls back to memory where OPFS is missing |
| `src/desktop/document.ts` | The Lumen document: the window component, the six windows, the wallpaper, the taskbar, the toasts and the rules |
| `src/desktop/bootstrap.ts` | `startDesktop`: mount, dark mode, the clock, the surface height, saving and removing unused files |
| `src/desktop/main.ts` | Entry of `desktop.html` |
| `scripts/validate-desktop.ts` | Part of `npm run validate`: validates the Lumen document |
| `test/desk.browser.test.ts` | Tests of the window manager, the file system and the wallpaper functions |
| `test/desktop.browser.test.ts` | Browser tests of the running desktop, each on its own OPFS folder |

## Feature table

| Feature | Where |
| --- | --- |
| The app node with the document title and a `toastRegion`; one screen whose root `panel` has a `region` layout (`collapseBelow: md`) placing the header (`n`), the `nav` (`w`, a menu button below 768 px with `collapseBelow: md`), the sections (`center`) and the footer (`s`) | `app.json`, `main.json` root |
| Nav switching sections through `$.data.view.hidden.*` and `<-hidden` links | `nav` and the section panels |
| `dashboardGrid` with `stat`, `card`, `alert`, `progress`, `badge`, `descriptionList`, `emptyState`, `avatar`, `skeleton`, `spinner`, card `loading` | Dashboard |
| `recordList` over 10,000 orders: windowed rows, `$row` links, `selected` bound to `$.data.selectedOrder`, `loading` during a fake refresh, empty state | Orders |
| Row template: a `card` with `text` and `badge`, an "Open" `button` and an overflow `menu` (Mark shipped / Cancel order) whose `on` entries use `$row.id`; the cancel goes through the confirm dialog | Orders list `row` |
| `searchBox` that scrolls the list with `scrollTo` (try 9000), toolbar with "back to top", refresh and new order | Orders toolbar |
| `drawer` with `tabs` (Summary / Items / History) and a footer `menu` (mark shipped, cancel) | Orders `detail` |
| `formDialog` with `textField` (required, length, pattern), `selectField`, `radioField`, `dateField`, `switchField`, `checkField`, `textareaField`; submit, reset and a toast | Orders `newOrder` |
| `confirmDialog` with a danger confirm that cancels the order and shows a toast | Orders `cancelDialog` |
| `menu`/`menuItem` (account menu, row menu, drawer menu), `tooltip`, `link`, `divider`, `icon`, `image` with a `data:` URL, `panel` | Header, order rows, drawer, Customers |
| A second `recordList` over a keyed map of customers | Customers |
| Locale switch en/de, with the component overlays and `locales.de` | Settings, account menu, console |
| Theme mode light/dark/contrast, motion, density, accent token override, node `theme` override | Settings |
| German text for the app's own content | `locale.de.json`, `main.locale.de.json` |

## Sections and the components they show

The app document places every component of the catalog (the test fixtures `orderEditor` and `probe` aside).
`test/app.browser.test.ts` walks `catalog.json` and fails when a component is missing from the document.

| Section (nav key) | Components |
| --- | --- |
| Dashboard (`dashboard`) | the ones listed in the feature table, plus `chart` (a bar chart of revenue by month and a donut of orders by status), `popover` (how the chart is computed), `list` (latest orders), `table` (top customers) and `tableRow` (the footnote under the table) |
| Orders (`orders`) | `breadcrumb` (Dashboard / Orders; the Dashboard crumb goes back), `stepper` in the drawer's History tab (a step sets the order's status), the components in the feature table |
| Archive (`archive`) | A `recordList` filled by logic, no code in the section: the effect `fetchArchive` asks the fake API for the page in `$.data.archive.request` (token, abort, cache of 10 pages), merges the records into `$.data.archive.records` by `id` and fills the page window `$.data.archive.page`; the compute unit `archiveTotal` formats each record's total with `money.format`, the table `archiveStatus` turns the effect's status into the `badge`, and a rule copies the `pagination`'s page into the request. Editing a record (`$.data.archive.records.<id>.total`) rewrites its row |
| Fulfilment (`fulfilment`) | `board` over the 10,000 orders (one column per status; a move writes the status), `segmented` for the card size |
| Deliveries (`deliveries`) | `calendar` of planned deliveries, `dateRangeField` filter, `list` of the deliveries in the range, `pagination`, `badge` |
| Customers (`customers`) | unchanged: `recordList`, `card`, `image`, `link` |
| Products (`products`) | `tabs` with `crudTable` (add, edit with `numberField` and `selectField`, delete with `confirmDialog` and `formDialog`), a stock `table` with `input`, `select`, `checkbox` and `switch` in its cells, and a `recordGrid` gallery |
| Catalog (`catalog`) | `breadcrumb` (the path to the category), `splitPane` with a `tree` of categories and a `masterDetail` of the products in the category |
| Warehouse (`warehouse`) | A `drawing` floor plan with every 2D shape (`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `drawText`, `drawGroup`, a `drawImage` of a stored file and a `drawRepeat` of the bins), a `scene3d` of the racks (`camera`, `light`, `mesh`, `group3d`, a `repeat3d` of the racks, a `label3d` and a `model` from a GLB file) and a `paintField` sketch pad |
| Ridgeline (`ridgeline`) | A two-player board game (below): a `scene3d` with a `repeat3d` of 25 tiles, ten `group3d` pieces built from `mesh` primitives that glide with `transition`, pulsing Beacon and selection rings (`animate`), `label3d` side names and coordinates; `stat` counters, a `button` and the rules in `markdown` |
| New order (`desk`) | `wizard` (with `stepper`, `tabs` and `form` steps): `comboboxField`, `radioField`, `dateField`, `selectField`, `numberField`, `sliderField`, `multiSelectField`, `switchField`, `fileField`, `descriptionList`, `checkField` |
| Support (`support`) | `chatView` (live, the customer's reply streams in), `messageList` (an earlier thread), `markdown` (a canned reply), `select`, `textarea`, `form` with `selectField` and `textareaField` (escalation), `divider` |
| Help (`help`) | `accordion` of `disclosure` entries, a stand-alone `disclosure` with `markdown`, `modal` (contact support) |
| Settings (`settings`) | `settingsPanel` with General, Notifications, Appearance and Theme overrides; `segmented` (language, theme mode, motion, density), `switch`, `checkbox` and `select` (notifications, accent colour), `toast` (a preview), `textField`, `card` with a node `theme` |

Every section has German text in `main.locale.de.json`; the data in the lists (customer names, product names, thread
messages, category labels) is data and stays as it is.

### Where code is needed

The document holds the behaviour that fits in `on` entries and links. `bootstrap.ts` adds bridges for the rest:

- **Settings.** `$.data.prefs.*` mirrors `$.locale`, `$.theme.active.mode`, `$.theme.active.motion`, the density of every
  section panel and the accent token, so the segmented controls, the account menu, the old buttons and the agent console
  all stay in step.
- **Deliveries.** The date range, the page and the page size rewrite `$.data.deliveries.shown`, `.rows` and `.total`
  (`views.ts`).
- **Catalog.** The tree's selected category rewrites the master list with copies of its products and the breadcrumb
  trail; an edit in the master list is written back to `$.data.products.all` by id.
- **Products.** `crudTable.save`, `.delete` and `.edit` events and the New product button update
  `$.data.products.all`; the wizard's product select reads `$.data.productOptions`.
- **Board and stepper.** The board's `move` event and the stepper's `select` event call the same status update as the
  row menu, so the dashboard figures, the charts and the drawer follow.
- **Support chat.** `chat.send` appends the agent's message and then writes the customer's reply into one record chunk by
  chunk.
- **New order wizard.** `wizard.done` creates the order from `$.data.wizard` and resets the steps.

### The file upload

There is no file host here, so `bootstrap.ts` passes `mountApp` a `transferFile` hook that stands in for one. It reports
progress in four steps, rejects a file over 2 MB with `too_large`, honours cancelling, and resolves with a local
reference (`local-<n>`, name, size, type). Nothing leaves the browser tab and no bytes are kept; the field shows the file
name, and the review step reads the name from `$.data.wizard.attachment`. The `fileField` in the wizard (`accept`: PDF and
images, 2 MB) shows the whole story: choose, progress, done toast, remove, and the errors.

### The Warehouse files and the 3D renderer

The Warehouse section shows two stored files: the dock picture on the floor plan and the pallet model in the 3D view.
Their references in `main.json` name them by id, as references to a file store would. `bootstrap.ts` passes `mountApp` a
`readFile` hook (`warehouse.ts`) that serves the two files shipped in `src/assets/` by those ids, and a `load3d` hook that
imports `@punyts/stateui-3d` (three.js) as its own chunk the first time a `scene3d` asks for it, so the rest of the app
never loads it.

### Ridgeline, the board game

Ridgeline is an original two-player game on a 5 × 5 board, played in the 3D scene of its section: press a piece,
then a green tile.

- Amber and Teal each have a Warden and four Scouts on their home row (Amber row 1, Teal row 5), the Warden on column c,
  its side's Beacon. Amber moves first.
- A turn moves one piece one step to an empty tile. Scouts step straight (forward, back or sideways) and may not enter
  either Beacon; Wardens step in any of the eight directions.
- Flanking: after your move, an enemy Scout next to the piece you moved, with one of your pieces right behind it on the
  same line, is captured and goes to its tray. Stepping between two enemies is safe; Wardens are never captured.
- You win when your Warden stands on the enemy Beacon, when the enemy has no Scouts left, or when it has no move. After
  60 moves the side with more Scouts wins; equal Scouts is a draw.

How it is built: the whole game state (pieces with their scene positions, tile colours, the selection ring, the counts)
is one JSON value at `$.data.game.board`. A press on a piece writes its id to `$.data.game.input.pick`, a press on a
tile writes the tile id to `$.data.game.input.to`, and the New game button writes `true` to `$.data.game.input.reset`.
Three rules in `logic.json` (`ridgelinePick`, `ridgelineMove`, `ridgelineNew`) each set the board to the result of an
expression function from `src/ridgeline.ts` and clear their input, so the same press works again. The table
`ridgelineStatus` turns the winner, the turn and the reason into the hidden flags of the localized status lines. The
scene links each piece's `position` and each tile's `material` to the state; the pieces glide with `transition`.

## The agent console

The console stands in for an agent or an MCP tool. It has no access to the components: every button is one store write,
and the app follows the data.

| Button | Write |
| --- | --- |
| Add an order | push a new order onto `$.data.orders` |
| Mark one shipped | `apply` a shipped status to the selected (or first open) order |
| Switch to German / English | `$.locale = 'de' / 'en'` |
| Toggle dark mode | `$.theme.active.mode = 'dark' / 'light'` |
| Show a toast | `$.data.requests.toast = 'agent'` |
| Jump to #9000 | show the Orders section, then `$.data.requests.jumpTo = '9000'` |

Most writes need nothing else: links and the theme step react on their own. Three need code, so `bootstrap.ts`
listens to them ("bridges") and turns them into calls:

- `$.locale` calls `switchTo` of the locale step handle;
- `$.data.requests.toast` runs the `show` command of the `toastRegion`, then clears the request;
- `$.data.requests.jumpTo` runs `scrollTo` on the orders `recordList`, selects the order, then clears the request.

The same request slots serve the app itself: the search box emits `orders.jump`, and the handler writes
`$.data.requests.jumpTo`.

## Lumen, the desktop

`desktop.html` is a second app in the example: **Lumen**, a desktop in the browser with its own look. It has a wallpaper
with icons, windows you can stack, snap, maximize and minimize, a taskbar with a launcher, task buttons and a clock, and
six apps:

- **Files**: a folder tree and a listing. You can make folders and notes, rename and delete items, upload files and open
  them.
- **Notes**: Markdown with a live preview.
- **Paint**: a `paintField`. A drawing is saved as a PNG in Pictures.
- **Viewer**: shows a picture.
- **Ridgeline**: the board game, in a window.
- **Settings**: the wallpaper (dawn, dusk or meadow), dark windows, and where the files are kept.

The file system is kept in the browser's private file system (OPFS) and nothing goes to `localStorage`. File bytes go
through `transferFile` and `readFile` into a folder (`lumen` by default). The items, the next id and the preferences are
kept in `desk.json`, so files, notes and settings are still there after a reload.

The document (`src/desktop/document.ts`) is built in TypeScript because the six windows share one shape: a library
`window` with all five frame buttons. Each of its events writes a command, such as `"open files"`, `"focus files"`
(`activate`) or `"snap notes left"`, to one input. A rule then sets the desk state to `deskAct(state, command)`. Each
window links its `hidden`, `active` and `maximized` flags and its whole `placement` (`"<-placement"`, with `z` for
the stacking order) to that state, and each task button takes its look from it. A window dragged by its title bar or
resized by its edge writes its own placement in pixels through that link and raises `move` or `resize`; the command
`"place notes"` reads the placement back into the window's free geometry, so a snapped window that is dragged is free. The file system works the same way with `fsAct`. Each rule's function is a pure function in `desk.ts`, and `desk.browser.test.ts` tests them without a browser
page.

### Where Lumen needs code

- **Opening a file.** The listing's `activate` event emits `fs.open`, and the handler writes the item id to
  `$.data.input.open`. An `on` value is taken as it is written (a `{{ }}` in it is not evaluated), so the Open button
  writes `selected`, and the rule turns that into the selected id with `fsPick`.
- **Dark windows, the clock, the height.** The switch sets `$.theme.active.mode`, a timer writes the clock, and the
  surface gets its height after mount. Inside a window the content fills it by `grow`, so the lists of Files and the
  editor of Notes grow when a window is snapped or maximized.
- **Saving and unused files.** `desk.json` is written a moment after the items or preferences change. Then
  `files.prune` removes the stored files that nothing uses: no item, no unsaved Paint picture and no upload in progress.
  This covers deleted pictures and uploads and old Paint drawings. It also runs once at start. A file stored in the last
  30 seconds is kept, because its reference may not be in the data yet.

Not built yet: the camera and microphone (stage 3). The plans are `docs/design/stateui-desktop-stage-1.md` and
`stateui-desktop-stage-2.md` in the root repo.

## Notes

- **Row height.** `recordList` rows have a fixed height (`rowHeight`), so the row card uses `padding: none` to keep
  its buttons inside a 36 px row.
- **List height.** `recordList` sizes to its host and the document has no property for a height, so `bootstrap.ts`
  sets `block-size` on the two lists after mount.
- **Record views and tables.** Everything that draws through a record view (the lists, the tables, the `tree`, the
  `recordGrid`, the `chatView` and the `messageList`) takes its height from its host, so `bootstrap.ts` sets `block-size`
  on them after mount (`SIZES`). The `board` takes its height from the `board.height` token set in a node `theme`.
- **Mount cost.** Every section renders at mount, hidden or not, so the first render of the whole app takes a few
  seconds in a browser (the board and the dashboard charts are the largest parts); the browser tests allow 60 s per test.
- **tableRow.** A `table` builds its own `tableRow`s. Placed on its own, a `tableRow` takes no `<-value` link in its cells
  and keeps no `$row` links in the nodes of its `content`, so it can only show fixed content. The dashboard uses it for the
  footnote under the top customers table.
- **Large data.** A document's data is limited to 512 KiB, so the 10,000 orders are written by a mount step before
  the first render; the customers fit and go into the document's data.

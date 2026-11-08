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
npm run dev        # Vite dev server
npm run typecheck  # tsc --noEmit
npm run validate   # validateDocument over the app document; exits 1 on errors
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
| `src/document/data.json` | The initial `$.data`: view flags, draft, stats, request slots |
| `src/document/locale.de.json` | German text of the app node (the toasts) |
| `src/document/main.locale.de.json` | German text for everything the screen `main` writes itself |
| `src/document/index.ts` | Assembles the app document (locale, theme, data, the app node, the screen `main`, locales) |
| `src/bootstrap.ts` | `startApp`: registration, mount, `onEmit` handlers, store bridges |
| `src/data.ts` | Seeded generators for 240 customers and 10,000 orders, plus stats |
| `src/seed.ts` | Seeded smaller data sets (products, categories, deliveries, support threads, chart figures) and `seedData`, which puts them into the document's data |
| `src/views.ts` | Pure helpers: deliveries in a date range, one page of a list, products of a category, the breadcrumb trail |
| `src/sections.ts` | `showSection`: shows one section and hides the others (the console, the breadcrumb handler and the tests use it) |
| `src/console.ts` | The agent console: store writes and a live JSON excerpt of the store |
| `src/main.ts` | Page entry: `startApp` plus `startConsole` |
| `src/icons.json` | Path data of the non-core icons the document uses (generated) |
| `scripts/validate.ts` | `npm run validate` |
| `scripts/extract-icons.ts` | `npm run icons` |
| `test/app.browser.test.ts` | Browser tests of the running app, the catalog coverage test and a smoke test per section in English and German |
| `test/views.browser.test.ts` | Tests of the seed data and the view helpers |

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
| Fulfilment (`fulfilment`) | `board` over the 10,000 orders (one column per status; a move writes the status), `segmented` for the card size |
| Deliveries (`deliveries`) | `calendar` of planned deliveries, `dateRangeField` filter, `list` of the deliveries in the range, `pagination`, `badge` |
| Customers (`customers`) | unchanged: `recordList`, `card`, `image`, `link` |
| Products (`products`) | `tabs` with `crudTable` (add, edit with `numberField` and `selectField`, delete with `confirmDialog` and `formDialog`), a stock `table` with `input`, `select`, `checkbox` and `switch` in its cells, and a `recordGrid` gallery |
| Catalog (`catalog`) | `breadcrumb` (the path to the category), `splitPane` with a `tree` of categories and a `masterDetail` of the products in the category |
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

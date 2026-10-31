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
| `src/document/app.json` | The node tree (`$.app`): sections, lists, dialogs, `on` entries |
| `src/document/data.json` | The initial `$.data`: view flags, draft, stats, request slots |
| `src/document/locale.de.json` | German text for everything the app document writes itself |
| `src/document/index.ts` | Assembles the app document (locale, theme, data, app, locales) |
| `src/bootstrap.ts` | `startApp`: registration, mount, `onEmit` handlers, store bridges |
| `src/data.ts` | Seeded generators for 240 customers and 10,000 orders, plus stats |
| `src/console.ts` | The agent console: store writes and a live JSON excerpt of the store |
| `src/main.ts` | Page entry: `startApp` plus `startConsole` |
| `src/icons.json` | Path data of the non-core icons the document uses (generated) |
| `scripts/validate.ts` | `npm run validate` |
| `scripts/extract-icons.ts` | `npm run icons` |
| `test/app.browser.test.ts` | Browser tests of the running app |

## Feature table

| Feature | Where |
| --- | --- |
| `page` with header, `nav`, footer and a `toastRegion` in the toasts slot | `app.json` root |
| Nav switching sections through `$.data.view.hidden.*` and `<-hidden` links | `nav` and the four section panels |
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
| German text for the app's own content | `locale.de.json` |

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
- **Large data.** A document's data is limited to 512 KiB, so the 10,000 orders are written by a mount step before
  the first render; the customers fit and go into the document's data.

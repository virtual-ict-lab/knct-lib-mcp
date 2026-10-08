# Repository guide for agents

## Scope and entry points

This is a Bun + TypeScript client for the Kagawa Kosen library WebOPAC, with a one-shot CLI and an Ink/React TUI. Despite the repository name, an MCP server and Skills are **not implemented**. The reusable search boundary is already separated from terminal interaction; do not assume MCP infrastructure exists.

`README.md` contains Japanese user documentation, complete usage examples, and keyboard controls. `src/search.ts` is the authoritative search-options contract; `src/cli.tsx` contains the CLI flag mapping and help text. User-facing messages and labels are Japanese.

No pre-existing agent/Cursor/Copilot instruction files or CI workflows were found when this guide was created.

## Commands

Run from the repository root. Bun 1.4.2 is the version documented in the README and verified in the development environment. Dependencies are locked in `bun.lock`.

```sh
bun install
bun run typecheck             # tsc --noEmit; includes both src and tests
bun test                      # full offline suite
bun test tests/search.test.ts # focused form/validation tests
bun test tests/pagination.test.ts
bun test tests/tui.test.tsx
bun run search -- --help      # offline CLI smoke check
bun run start                # interactive TUI; requires stdin AND stdout TTY
bun run start -- --interactive --title Rust
bun run search -- Rust --campus takuma
bun run search -- Rust --limit 20 --page 2 --json --no-holdings
bun run search -- --options examples/search.json --json
bun run search -- --list countries
```

`start` and `search` invoke the same entry point. With no arguments it opens the TUI; with arguments it normally performs a one-shot search unless `--interactive` is specified. A bare `--json` is not a search condition. Explicit search arguments are necessary in non-TTY automation. Search commands contact the real OPAC; tests and `--help` do not.

There are no build, lint, formatter, or deployment scripts in `package.json`. TypeScript is strict, uses ESM/Bundler resolution and React JSX, and emits no files. Validate changes with `bun run typecheck` and `bun test` rather than inventing a build pipeline.

## Architecture and change boundaries

| File | Responsibility |
| --- | --- |
| `src/search.ts` | Shared types, choice catalogs, validation, mode inference, and `URLSearchParams` generation. No HTTP or terminal rendering. |
| `src/opac.ts` | `OpacClient`, injected HTTP transport, search-session state, HTML parsers, pagination, and holdings enrichment. Re-exports search types and `buildSearchForm`. |
| `src/cli.tsx` | Parses flags/JSON files into shared options, selects CLI versus TUI, formats output, restores terminal state, and sets failure exit status. |
| `src/tui.tsx` | Form and condition state, simple/detail tabs, selector picker, input handling, result/query snapshots, and bounded screen layout. |
| `src/result-lines.ts` | Shared CLI/TUI result rendering into lines; hyperlinks, wrapping, numbering, holdings errors, and clamped viewport slicing. |
| `src/holdings-table.ts` | Width-aware holdings tables, including narrow-terminal vertical layout. |
| `src/mouse.ts` | Mouse-mode escape sequences and SGR report parsing. |
| `src/data/` | Bundled OPAC country/language/location choices, imported by validation and the TUI. |
| `tests/fixtures/` | Reduced OPAC HTML used by parser and transport tests. |

Control flow: CLI flags or a JSON options file become `SearchOptions`; the TUI also produces this same contract. `OpacClient.search` calls `buildSearchForm` before networking, establishes or reuses an OPAC session, parses bibliography results, attaches pagination, and optionally enriches each book with holdings. Both terminal modes use `resultLines`; JSON mode serializes the structured result directly.

When adding a search option, trace all relevant boundaries: the shared interface/validation/form mapping, CLI specifications and flag mapping/help, TUI fields and simple/detail request construction, tests, and README examples. A type addition alone does not expose an option end-to-end.

## Search/form invariants

- `words` is a required string even for a detail-only request; use `words: ""` for searches based on other fields or filters.
- Mode is inferred from detailed options unless explicitly supplied. Explicit `simple` mode rejects detailed conditions. Simple-mode TUI submission deliberately constructs a restricted request instead of spreading saved detail-tab state.
- Explicit `conditions` replaces the shorthand `words`/`title`/`author`/`publisher` condition list, rather than appending to it. At most four rows are accepted. Blank rows are removed before encoding; each later active row carries its operator relative to the previous active row. The first active row's operator is ignored. Boolean precedence is left to the OPAC.
- Campus IDs are `75` for Takamatsu and `76` for Takuma. `both` sends two repeated `holar` values, not a combined scalar. Material types likewise use repeated `gcattp` parameters; country/language codes use literal `+` joins encoded through `URLSearchParams`. Preserve these distinct encodings.
- Catalog codes are OPAC-specific: Japan's country code is `ja`, while Japanese's language code is `jpn`. Locations have `75/` or `76/` prefixes and must match the selected campus. Do not substitute generic ISO country codes.
- Page sizes are limited to 10/20/50/100; pages must be positive safe integers. The page is transport state, not part of the base form serialization.
- The form includes empty hidden/facet fields and protocol flags as well as visible search conditions. Keep the observed OPAC field names and defaults; these are not a generic query API.

## HTTP/session and parsing gotchas

- A fresh search GETs `cattab.do`, extracts cookies via `Headers.getSetCookie()`, and POSTs the encoded form to `ctlsrh.do`. Requests have individual 30-second timeouts. Do not persist copied session cookies in source or fixtures.
- `OpacClient` retains one search session keyed by the serialized base form. Page 1 always initializes a new search; later pages reuse matching cookies, the result form's `formkeyno`, and total count. Keep a client instance alive across TUI page changes.
- A standalone request for page 2+ first establishes the initial search session and then fetches the requested page. Pagination uses a 1-based `startpos` and `_RESULT_SET_NOTBIB`. The parser verifies the returned first result number, so a stale session returning page 1 is an error rather than a successful page change.
- Total count is not the length of the current page. Empty results have `pagination.start` and `end` equal to zero and at least one total page.
- Search HTML may contain several `hitcnt` inputs; the parser uses the last numeric value. A genuine no-hit page may instead contain `OP-1001-I`. Unrecognized HTML and positive counts without records must throw, not masquerade as zero results.
- A single hit can return a bibliographic detail page directly. Its ID comes from `opnurlform`'s `rfr_dat`, not the list-row `bibid` field. Desktop/mobile duplicate summaries must not create duplicate books.
- Holdings are parsed from the desktop horizontal table and matched by Japanese header text, not fixed column offsets. Return-date/reservation columns must not leak into comments. Mobile duplicate markup is ignored.
- Holdings retrieval requests batches of 100 and follows `stposHol` until the reported total is reached. Empty continuation pages and repeated material IDs on later pages are errors. After fetching, holdings are filtered to the requested Kagawa campus names, even when OPAC includes other libraries.
- Holdings enrichment defaults on and uses two workers to bound traffic. A per-book failure adds `holdingsError` and retains bibliography results. `holdings: false` skips detail requests; distinguish omitted holdings, an empty array, and retrieval failure.
- Blank OPAC status is unknown, **not** evidence that a copy is available. Preserve blanks in structured data; terminal tables display them as `—` and include a warning.

## TUI and terminal invariants

- Editable form state and the last successful search request are separate. Page navigation uses the latter even if the user has edited the form. A new search starts at page 1; a successful search/page change resets result scroll. A failed request leaves displayed results intact.
- A ref-based pending guard prevents overlapping searches in addition to the visible busy state. Avoid weakening it when changing asynchronous handlers.
- Switching tabs preserves inputs and result scroll. Changing campus clears the selected location. Picker multiselect state uses `+`-joined values internally, while shared options hold arrays.
- `Tui` accepts an injected `client` with a `search` method and an explicit `terminalSize` for tests. The default client is retained in a ref.
- Rendering reserves one terminal row, computes separate form/results viewports, and clips output. Mouse hit regions are calculated from `formRows`; changing header/layout rows requires updating pager and result-region coordinates too.
- Ink may remove the leading ESC from SGR mouse input. `parseMouseReport` accepts either form; handlers consume recognized non-wheel reports as well, so clicking/releasing must not insert escape text into a search field.
- Use display-width-aware/ANSI-aware helpers already present (`string-width`, `wrap-ansi`, `slice-ansi`, `terminal-link`) rather than string length or raw slicing for terminal layout. Text editing uses `Array.from` for Unicode code points.
- The CLI owns alternate-screen and mouse-mode enable/disable, with idempotent restoration on normal exit and errors. Keep terminal lifecycle management separate from TUI component rendering.

## Tests and local conventions

Tests use `bun:test`. They do not depend on a live OPAC or saved real credentials.

- `tests/search.test.ts` and `tests/opac.test.ts`: form encoding/validation, fixture parsing, zero-result/error distinction, and direct-detail single-hit results.
- `tests/pagination.test.ts`: injected `OpacClient` transport returning synthetic `Response` objects; asserts cookies, form/session fields, page boundaries, holdings loading, stale-session detection, and numbering.
- `tests/holdings.test.ts`: HTML fixture and synthetic table cases; checks separate copies, blank status, parser failures, and `stringWidth` bounds at multiple terminal widths.
- `tests/mouse.test.ts`: SGR wheel, click, release, and ignored-report behavior.
- `tests/tui.test.tsx`: `ink-testing-library`, injected search results, explicit 80x24 dimensions, stdin escape sequences, and frame assertions. Tests wait 40 ms between input/render steps and always `unmount()` plus `cleanup()` in `finally`.

Load fixtures with `Bun.file(new URL("./fixtures/...", import.meta.url)).text()` as existing tests do. The README identifies the search fixture as extracted user-provided HTML with scripts/session values removed; keep new fixtures sanitized as well.

Observed source style is two-space indentation, double quotes, semicolons, camelCase functions/properties, and PascalCase interfaces/components. Imports of local TypeScript modules are extensionless; types use `import type` or inline `type` imports. Keep pure mapping/parsing/rendering helpers separately testable rather than moving their logic into the CLI entry point.

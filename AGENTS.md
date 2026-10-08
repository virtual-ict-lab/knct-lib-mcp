# Repository guide for agents

## Scope and entry points

This is a Bun + TypeScript client for the Kagawa Kosen library WebOPAC, with a one-shot CLI. The root `SKILL.md` provides the installable `knct-library-search` agent Skill. An MCP server is **not implemented**; do not assume MCP infrastructure exists.

`README.md` contains English user documentation, usage examples, and local Skill installation instructions. `src/search.ts` is the authoritative search-options contract; `src/cli.ts` contains the CLI flag mapping and help text.

## Working language

Use English for documentation, development guidance, code comments, identifiers, test descriptions, application-owned messages/labels, and new commit/PR descriptions. Catalog display labels are English; preserve their OPAC codes unchanged. Japanese remains necessary for upstream HTML/header/campus matching, captured fixtures, source bibliographic/holdings data, and Unicode query/rendering test samples. Do not translate these protocol strings or source records. Keep `Accept-Language: ja` in OPAC requests because the parsers expect Japanese HTML.

No pre-existing agent/Cursor/Copilot instruction files or CI workflows were found when this guide was created.

## Commands

Run from the repository root. Bun 1.4.2 is the version documented in the README and verified in the development environment. Dependencies are locked in `bun.lock`.

```sh
bun install
bun run typecheck             # tsc --noEmit; includes both src and tests
bun test                      # full offline suite
bun test tests/search.test.ts # focused form/validation tests
bun test tests/pagination.test.ts
bun test tests/cli.test.ts
bun run search -- --help      # offline CLI smoke check
bun run start                # prints help without networking
bun run start -- --title Rust
bun run search -- Rust --campus takuma
bun run search -- Rust --limit 20 --page 2 --json --no-holdings
bun run search -- --options examples/search.json --json
bun run search -- --list countries
```

`start` and `search` invoke the same one-shot entry point. No arguments prints help; `--interactive` is not supported. A bare `--json` is not a search condition. No TTY is required. Search commands contact the real OPAC; tests, `--help`, and catalog lists do not.

There are no build, lint, formatter, or deployment scripts in `package.json`. TypeScript is strict, uses ESM/Bundler resolution, and emits no files. Validate changes with `bun run typecheck` and `bun test` rather than inventing a build pipeline.

## CLI command installation

`package.json` maps the `klib` binary to `src/cli.ts`, which must retain its executable permission and `#!/usr/bin/env bun` shebang. `bun install --global /absolute/path/to/knct-lib-mcp` installs the local package's shell command; Bun's global bin directory must be on `PATH`. Plain repository `bun install` prepares dependencies only. The package is private, not registry-published, and requires Bun at runtime. Test global installation using an isolated `BUN_INSTALL` directory instead of changing the user's global tools. Skill users normally run the absolute bundled entry point without global installation.

## Skill packaging

The root `SKILL.md` uses `name` and `description` YAML frontmatter for discovery by `bunx skills add`. Keep its relative links and bundled runtime paths valid. Installing from a local checkout copies the skill directory, including the CLI source, data, package manifest, lockfile, and examples; agents must resolve paths from their installed `SKILL.md`, not rely on the original checkout or target project's working directory. Dependencies belong in the installed skill directory.

Preview discovery with `bunx skills add . --list`. Verify installation in a disposable target project with `bunx skills add /absolute/path/to/knct-lib-mcp --skill knct-library-search --agent codex --copy --yes`, then run the installed CLI's `--help` and `--list languages`. Do not create agent installation folders in this source repository just to test packaging, and do not require a live search for offline verification.

## Architecture and change boundaries

| File | Responsibility |
| --- | --- |
| `SKILL.md` | Discoverable agent Skill instructions for safely using the bundled CLI. |
| `src/search.ts` | Shared types, choice catalogs, validation, mode inference, and `URLSearchParams` generation. No HTTP or terminal rendering. |
| `src/opac.ts` | `OpacClient`, injected HTTP transport, search-session state, HTML parsers, pagination, and holdings enrichment. Re-exports search types and `buildSearchForm`. |
| `src/cli.ts` | Parses flags/JSON files into shared options, formats one-shot output, and sets failure exit status. |
| `src/result-lines.ts` | CLI result rendering into lines; hyperlinks, wrapping, numbering, and holdings errors. |
| `src/holdings-table.ts` | Width-aware holdings tables, including narrow-terminal vertical layout. |
| `src/data/` | Bundled OPAC country/language/location choices, used by validation and CLI catalog output. |
| `tests/fixtures/` | Reduced OPAC HTML used by parser and transport tests. |

Control flow: CLI flags or a JSON options file become `SearchOptions`. `OpacClient.search` calls `buildSearchForm` before networking, establishes or reuses an OPAC session, parses bibliography results, attaches pagination, and optionally enriches each book with holdings. Text output uses `resultLines`; JSON mode serializes the structured result directly.

When adding a search option, trace the shared interface/validation/form mapping, CLI specifications and flag mapping/help, tests, and README examples. A type addition alone does not expose an option end-to-end.

## Search/form invariants

- `words` is a required string even for a detail-only request; use `words: ""` for searches based on other fields or filters.
- Mode is inferred from detailed options unless explicitly supplied. Explicit `simple` mode rejects detailed conditions.
- Explicit `conditions` replaces the shorthand `words`/`title`/`author`/`publisher` condition list, rather than appending to it. At most four rows are accepted. Blank rows are removed before encoding; each later active row carries its operator relative to the previous active row. The first active row's operator is ignored. Boolean precedence is left to the OPAC.
- Campus IDs are `75` for Takamatsu and `76` for Takuma. `both` sends two repeated `holar` values, not a combined scalar. Material types likewise use repeated `gcattp` parameters; country/language codes use literal `+` joins encoded through `URLSearchParams`. Preserve these distinct encodings.
- Catalog codes are OPAC-specific: Japan's country code is `ja`, while Japanese's language code is `jpn`. Locations have `75/` or `76/` prefixes and must match the selected campus. Do not substitute generic ISO country codes.
- Page sizes are limited to 10/20/50/100; pages must be positive safe integers. The page is transport state, not part of the base form serialization.
- The form includes empty hidden/facet fields and protocol flags as well as visible search conditions. Keep the observed OPAC field names and defaults; these are not a generic query API.

## HTTP/session and parsing gotchas

- A fresh search GETs `cattab.do`, extracts cookies via `Headers.getSetCookie()`, and POSTs the encoded form to `ctlsrh.do`. Requests have individual 30-second timeouts. Do not persist copied session cookies in source or fixtures.
- `OpacClient` retains one search session keyed by the serialized base form. Page 1 always initializes a new search; later pages reuse matching cookies, the result form's `formkeyno`, and total count.
- A standalone request for page 2+ first establishes the initial search session and then fetches the requested page. Pagination uses a 1-based `startpos` and `_RESULT_SET_NOTBIB`. The parser verifies the returned first result number, so a stale session returning page 1 is an error rather than a successful page change.
- Total count is not the length of the current page. Empty results have `pagination.start` and `end` equal to zero and at least one total page.
- Search HTML may contain several `hitcnt` inputs; the parser uses the last numeric value. A genuine no-hit page may instead contain `OP-1001-I`. Unrecognized HTML and positive counts without records must throw, not masquerade as zero results.
- A single hit can return a bibliographic detail page directly. Its ID comes from `opnurlform`'s `rfr_dat`, not the list-row `bibid` field. Desktop/mobile duplicate summaries must not create duplicate books.
- Holdings are parsed from the desktop horizontal table and matched by Japanese header text, not fixed column offsets. Return-date/reservation columns must not leak into comments. Mobile duplicate markup is ignored.
- Holdings retrieval requests batches of 100 and follows `stposHol` until the reported total is reached. Empty continuation pages and repeated material IDs on later pages are errors. After fetching, holdings are filtered to the requested Kagawa campus names, even when OPAC includes other libraries.
- Holdings enrichment defaults on and uses two workers to bound traffic. A per-book failure adds `holdingsError` and retains bibliography results. `holdings: false` skips detail requests; distinguish omitted holdings, an empty array, and retrieval failure.
- Blank OPAC status is unknown, **not** evidence that a copy is available. Preserve blanks in structured data; terminal tables display them as `—` and include a warning.

## Terminal output

Use display-width-aware/ANSI-aware helpers already present (`string-width`, `wrap-ansi`, `terminal-link`) rather than string length or raw slicing for terminal layout. Text output uses stdout width when available and defaults to 100 columns for pipes. Holdings tables switch to a vertical layout on narrow terminals. There is no alternate-screen, mouse, picker, or interactive input lifecycle.

## Tests and local conventions

Tests use `bun:test`. They do not depend on a live OPAC or saved real credentials.

- `tests/cli.test.ts`: non-TTY Bun subprocesses; checks no-argument/help output, JSON catalogs, removed interactive mode, validation errors, and failure exit codes.

- `tests/search.test.ts` and `tests/opac.test.ts`: form encoding/validation, fixture parsing, zero-result/error distinction, and direct-detail single-hit results.
- `tests/pagination.test.ts`: injected `OpacClient` transport returning synthetic `Response` objects; asserts cookies, form/session fields, page boundaries, holdings loading, stale-session detection, and numbering.
- `tests/holdings.test.ts`: HTML fixture and synthetic table cases; checks separate copies, blank status, parser failures, and `stringWidth` bounds at multiple terminal widths.

Load fixtures with `Bun.file(new URL("./fixtures/...", import.meta.url)).text()` as existing tests do. The README identifies the search fixture as extracted user-provided HTML with scripts/session values removed; keep new fixtures sanitized as well.

Observed source style is two-space indentation, double quotes, semicolons, camelCase functions/properties, and PascalCase interfaces. Imports of local TypeScript modules are extensionless; types use `import type` or inline `type` imports. Keep pure mapping/parsing/rendering helpers separately testable rather than moving their logic into the CLI entry point.

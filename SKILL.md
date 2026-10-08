---
name: knct-library-search
description: Search the Kagawa National College of Technology library catalog for books and other materials, retrieve campus-specific holdings and call numbers, and answer bibliographic or availability questions using the bundled Bun CLI.
---

# Kagawa Kosen library search

Use this skill to search the Kagawa Kosen WebOPAC, identify a specific edition, find copies at Takamatsu or Takuma, and report library locations, call numbers, and recorded statuses. This is a read-only catalog client, not a reservation, renewal, or account-management tool. No MCP server is required.

## Locate and prepare the bundled CLI

Resolve the directory containing **this installed SKILL.md**, not the user's current working directory. It contains `package.json`, `bun.lock`, `src/cli.ts`, and `src/data/`. Set `SKILL_DIR` to that absolute directory. Do not assume the original repository checkout still exists or hard-code an agent-specific installation path.

Bun is required (the project was tested with Bun 1.4.2). If dependencies are missing, install them in the skill directory:

```sh
bun install --cwd "$SKILL_DIR" --frozen-lockfile
bun "$SKILL_DIR/src/cli.ts" --help
```

Use the bundled entry point with its absolute path from any working directory. Do not install dependencies into the user's current project. If Bun is unavailable, explain that prerequisite instead of substituting Node.js: the CLI uses Bun APIs.

The package also exposes the `klib` command. If the user wants a globally available shell command, they can run `bun install --global "$SKILL_DIR"` and then `klib Rust --campus both --json`, with Bun's global bin directory on `PATH`. Plain `bun install` only prepares dependencies; Skill installation does not register a global command. Do not install globally or change the user's shell configuration unless requested. Prefer the bundled absolute-path entry point for agent work so another installed `klib` cannot shadow this Skill's client.

## Search workflow

1. Translate the user's request into a small, targeted query. Preserve original Japanese titles, author names, and identifiers. Do not silently translate catalog search terms.
2. Choose `both` campuses unless the user requests `takamatsu` or `takuma`.
3. Request `--json` to get structured output. Use a small page size, normally 10. For broad discovery, `--no-holdings` avoids detail-page requests; omit it when the question needs copies, location, call number, or status.
4. Inspect `total`, `books`, and `pagination`. Refine the query when needed rather than fetching every page indiscriminately.
5. For a promising bibliographic record, query its ID to retrieve holdings. Cite its returned `url` in the answer.
6. Distinguish an actual zero-result response from a failed command. Check the exit code and stderr before interpreting stdout.

```sh
bun "$SKILL_DIR/src/cli.ts" Rust --campus both --no-holdings --json
bun "$SKILL_DIR/src/cli.ts" --title Rust --author Klabnik --json
bun "$SKILL_DIR/src/cli.ts" --isbn 9784873118550 --json
bun "$SKILL_DIR/src/cli.ts" --bib-id BB02965611 --campus takamatsu --json
bun "$SKILL_DIR/src/cli.ts" Rust --limit 10 --page 2 --no-holdings --json
```

Use a returned bibliographic ID for follow-up searches; the ID above is only an example. Each invocation can retrieve a later page independently because the client establishes the necessary OPAC session itself.

## Detailed conditions and codes

Shorthand `--title`, `--author`, and `--publisher` conditions are joined with AND. For OR/NOT or repeated fields, use up to four `--condition` objects:

```sh
bun "$SKILL_DIR/src/cli.ts" \
  --condition '{"field":"title","value":"Rust"}' \
  --condition '{"field":"title","value":"Effective","operator":"NOT"}' \
  --material-type bk --language jpn --no-holdings --json
```

Fields are `words`, `title`, `auth`, `pub`, `sh` (subject), and `tag`. Operators are AND, OR, or NOT and join a row to the preceding nonblank row. The first operator is ignored. Explicit conditions replace shorthand conditions, including positional keywords; include a `words` row if keywords must participate. OPAC controls Boolean precedence.

Detailed options infer detailed mode automatically. Do not specify `--mode simple` with detailed filters. `--limit` must be 10, 20, 50, or 100; `--page` must be a positive integer within the returned page range.

Discover valid codes instead of guessing:

```sh
bun "$SKILL_DIR/src/cli.ts" --list countries
bun "$SKILL_DIR/src/cli.ts" --list languages
bun "$SKILL_DIR/src/cli.ts" --list locations
```

Country, language, and material-type flags are repeatable. Japan's country code is `ja`; Japanese's language code is `jpn`. Material types are `bk` (books), `sr` (journals), and `av` (AV materials). Locations beginning with `75/` belong to Takamatsu; `76/` belongs to Takuma. These are OPAC codes, not interchangeable ISO identifiers.

For complex requests, use `--options` with a JSON file. See [the bundled example](examples/search.json) and [SearchOptions](src/search.ts). JSON uses camelCase property names such as `materialTypes`, `yearTo`, and `bibId`; include `words: ""` for detail-only queries. Explicit CLI options override the corresponding file properties. Use an absolute options-file path when invoking from another directory.

## Interpret and report results accurately

- `total` is the complete match count, not the current page's record count. Report when only a subset was examined.
- Each book has `id`, `title`, `bibliography`, and `url`. `pagination` contains `page`, `pageSize`, `totalPages`, `start`, and `end`.
- When holdings are requested, a book has `holdings` on success or `holdingsError` on retrieval failure. Omitted holdings under `--no-holdings` means not fetched, not no copies.
- Each holding has `volume`, `library`, `location`, `callNumber`, `materialId`, `status`, and `comment`. Retain separate copies and volumes; do not conflate campus holdings.
- **A blank status is unknown, not proof of availability.** An empty holdings array means no matching campus holdings were returned, not necessarily that the title is absent from all libraries.
- If `holdingsError` is present, retain bibliographic facts but explicitly state that holdings could not be confirmed. A successful search exit code does not guarantee every holdings lookup succeeded.
- Preserve OPAC-supplied titles, names, locations, comments, and statuses. Summarize in the user's language without fabricating or overwriting the source values.
- Cite returned detail URLs, report the requested campus scope, and qualify availability as the status reported by the OPAC at lookup time. Do not promise a copy is currently borrowable from a missing or ambiguous status.

## Failures and network boundaries

Searches require network access to the library OPAC. Each HTTP request has a 30-second timeout; a search with holdings may take longer overall. Invalid inputs, out-of-range pages, stale sessions, and unrecognized HTML produce exit code 1 and a stderr message. Do not interpret an error as zero matches or invent results when the service is unavailable.

Do not persist session cookies, request credentials, or bypass the OPAC. Avoid bulk crawling and parallel CLI invocations: the client already bounds holdings traffic to two workers. Catalog lists and `--help` work offline. No arguments prints help; there is no TUI or `--interactive` option.

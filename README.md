# knct-lib-mcp

Search the Kagawa Kosen library catalog with the `klib` CLI or an agent Skill. Requires Bun (tested with 1.4.2). An MCP server is not implemented.

## Installation

Install `klib` from the local checkout:

```sh
bun install --global /Users/mothue/Desktop/projects/knct-lib-mcp
```

Install the Skill from the project where your agent works:

```sh
bunx skills add /Users/mothue/Desktop/projects/knct-lib-mcp --skill knct-library-search
```

Replace the checkout path if needed. If `klib` is not found, add Bun's global bin directory to `PATH`. The Skill can run its bundled CLI directly and install dependencies when needed; it does not require a global `klib` installation.

## Usage

```sh
klib Rust --campus both
klib --title Rust --author Klabnik
klib --isbn 9784873118550 --json
klib Rust --limit 20 --page 2 --json
klib --list languages
klib --help
```

- Campuses: `both` (default), `takamatsu`, or `takuma`.
- Page sizes: 10 (default), 20, 50, or 100.
- Holdings are fetched by default; `--no-holdings` skips them. A blank status does not indicate availability.
- Use `--json` for agents and scripts. Search failures return exit code 1; individual holdings failures appear as `holdingsError`.

See [SKILL.md](SKILL.md) for detailed search guidance and [examples/search.json](examples/search.json) for JSON options (`klib --options PATH --json`).

## Development setup

Install Bun, then open a local checkout of this repository. Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run search -- --help
bun run search -- Rust --campus both --json
bun run typecheck
bun test
```

No global `klib` or Skill installation is needed for development. `bun run search -- ...` runs the current source directly. Searches require network access to the OPAC; tests and `--help` run offline once dependencies are installed. There is no separate build step.

See [AGENTS.md](AGENTS.md) for architecture, conventions, and OPAC-specific gotchas.

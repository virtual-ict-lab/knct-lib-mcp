import wrapAnsi from "wrap-ansi";
import terminalLink from "terminal-link";
import type { SearchResult } from "./opac";
import { formatHoldings } from "./holdings-table";
export function resultLines(
  result: SearchResult,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const [i, b] of result.books.entries()) {
    lines.push(
      ...wrapAnsi(
        `${(result.pagination?.start ?? 1) + i}. ${terminalLink(b.title, b.url, { fallback: false })}`,
        width,
        { hard: true },
      ).split("\n"),
    );
    lines.push(...wrapAnsi(b.bibliography, width, { hard: true }).split("\n"));
    lines.push(
      ...wrapAnsi(`${b.id} · ${b.url}`, width, { hard: true }).split("\n"),
    );
    if (b.holdingsError)
      lines.push(
        ...wrapAnsi(`Holdings retrieval failed: ${b.holdingsError}`, width, {
          hard: true,
        }).split("\n"),
      );
    else if (b.holdings)
      lines.push(...formatHoldings(b.holdings, width).split("\n"));
    lines.push("");
  }
  if (!result.books.length) lines.push("No matching records found.");
  if (result.books.some((b) => b.holdings?.some((h) => !h.status)))
    lines.push(
      ...wrapAnsi(
        "— denotes a blank OPAC field. A blank status does not indicate availability.",
        width,
        { hard: true },
      ).split("\n"),
    );
  return lines;
}

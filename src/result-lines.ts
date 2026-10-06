import wrapAnsi from "wrap-ansi";
import terminalLink from "terminal-link";
import type { SearchResult } from "./opac";
import { formatHoldings } from "./holdings-table";
export function resultLines(
  result: SearchResult | undefined,
  width: number,
): string[] {
  if (!result) return ["検索条件を入力してEnterで検索してください。"];
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
        ...wrapAnsi(`所蔵情報取得失敗: ${b.holdingsError}`, width, {
          hard: true,
        }).split("\n"),
      );
    else if (b.holdings)
      lines.push(...formatHoldings(b.holdings, width).split("\n"));
    lines.push("");
  }
  if (!result.books.length) lines.push("該当する資料はありません。");
  if (result.books.some((b) => b.holdings?.some((h) => !h.status)))
    lines.push(
      ...wrapAnsi(
        "— はOPACの空欄です。状態の空欄から貸出可否は判断していません。",
        width,
        { hard: true },
      ).split("\n"),
    );
  return lines;
}
export function viewport(
  lines: string[],
  offset: number,
  height: number,
): { offset: number; lines: string[] } {
  const start = Math.max(
    0,
    Math.min(offset, Math.max(0, lines.length - height)),
  );
  return { offset: start, lines: lines.slice(start, start + height) };
}

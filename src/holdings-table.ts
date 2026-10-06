import Table from "cli-table3";
import stringWidth from "string-width";
import type { Holding } from "./opac";

const columns = [
  ["volume", "巻号"],
  ["library", "所蔵館"],
  ["location", "配置場所"],
  ["callNumber", "請求記号"],
  ["materialId", "資料ID"],
  ["status", "状態"],
  ["comment", "コメント"],
] as const;
export function formatHoldings(holdings: Holding[], width = 100): string {
  if (!holdings.length) return "所蔵情報はありません。";
  const minimums = [4, 6, 8, 8, 7, 4, 8];
  if (width < minimums.reduce((a, b) => a + b, 0) + 22) {
    return holdings
      .map((h, i) => {
        const t = new Table({
          colWidths: [12, Math.max(12, width - 19)],
          wordWrap: true,
          style: { head: [], border: [] },
        });
        for (const [key, label] of columns) t.push([label, h[key] || "—"]);
        return `資料 ${i + 1}\n${t.toString()}`;
      })
      .join("\n");
  }
  const maxima = [12, 14, 24, 20, 12, 14, 30];
  const widths = columns.map(([key, label], i) =>
    Math.min(
      maxima[i]!,
      Math.max(
        minimums[i]!,
        stringWidth(label),
        ...holdings.map((h) => stringWidth(h[key] || "—")),
      ),
    ),
  );
  while (widths.reduce((a, b) => a + b, 0) + 22 > width) {
    let index = 0;
    for (let i = 1; i < widths.length; i++)
      if (widths[i]! - minimums[i]! > widths[index]! - minimums[index]!)
        index = i;
    widths[index]!--;
  }
  const t = new Table({
    head: columns.map(([, label]) => label),
    colWidths: widths.map((w) => w + 2),
    wordWrap: true,
    style: { head: [], border: [] },
  });
  for (const h of holdings) t.push(columns.map(([key]) => h[key] || "—"));
  return t.toString();
}

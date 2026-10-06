import { expect, test } from "bun:test";
import { parseHoldings } from "../src/opac";
import { formatHoldings } from "../src/holdings-table";
import stringWidth from "string-width";

test("actual OPAC rows: extracts seven columns, avoids mobile duplicate, preserves blank status", async () => {
  const { total, holdings } = parseHoldings(
    await Bun.file(new URL("./fixtures/holdings.html", import.meta.url)).text(),
  );
  expect(total).toBe(1);
  expect(holdings).toHaveLength(1);
  expect(holdings[0]).toEqual({
    volume: "",
    library: "香川(高松)",
    location: "(高松)01 (閲覧室)",
    callNumber: "007.64||F33",
    materialId: "1084112",
    status: "",
    comment: "",
  });
});
const labels = [
  "No.",
  "巻号",
  "所蔵館",
  "配置場所",
  "請求記号",
  "資料ID",
  "状態",
  "コメント",
  "返却予定日",
  "予約",
];
const row = (id: string, vol: string) =>
  `<tr>${["1", vol, "香川(詫間)", "図書館", "007.64||R", id, "貸出中", "長いコメントです。".repeat(8), "2026/10/10", "0"].map((v) => `<td>${v}</td>`).join("")}</tr>`;
test("keeps each copy and volume separately, comments do not absorb return dates", () => {
  const html = `<div class="opac_ttl_middle"><h3>所蔵一覧<span class="subttl">全2件</span></h3></div><div class="opac_booksyozou_area syozou_yoko"><table><tr>${labels.map((l) => `<th>${l}</th>`).join("")}</tr>${row("001", "上")}${row("002", "下")}</table></div>`;
  const { holdings } = parseHoldings(html);
  expect(holdings).toHaveLength(2);
  expect(holdings[1]?.volume).toBe("下");
  expect(holdings[0]?.comment).not.toContain("2026/10/10");
  for (const width of [60, 80, 120]) {
    const table = formatHoldings(holdings, width);
    expect(table).toContain("001");
    expect(table).toContain("002");
    for (const line of table.split("\n"))
      expect(stringWidth(line)).toBeLessThanOrEqual(width);
  }
});
test("does not mistake a failed detail request for no holdings", () =>
  expect(() => parseHoldings("<html>ログイン</html>")).toThrow());

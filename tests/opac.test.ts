import { describe, expect, test } from "bun:test";
import { buildSearchForm, parseSearchResult } from "../src/opac";

describe("OPAC form", () => {
  test("keeps both repeated campus values and encodes Japanese", () => {
    const p = buildSearchForm({ words: "日本語 & Rust" });
    expect(p.getAll("holar")).toEqual(["75", "76"]);
    expect(new URLSearchParams(p.toString()).get("words")).toBe(
      "日本語 & Rust",
    );
    expect(p.get("search_mode")).toBe("simple");
  });
  test("advanced search uses actual form field names", () => {
    const p = buildSearchForm({
      words: "",
      title: "Rust",
      author: "中田",
      campus: "takuma",
      isbn: "9784000000000",
    });
    expect(p.getAll("holar")).toEqual(["76"]);
    expect(p.get("srhclm1")).toBe("title");
    expect(p.get("valclm1")).toBe("Rust");
    expect(p.get("srhclm2")).toBe("auth");
    expect(p.get("optclm1")).toBe("AND");
    expect(p.get("isbn_issn")).toBe("9784000000000");
    expect(p.get("fromDsp")).toBe("catsrd");
  });
  test("rejects empty query and unsupported page sizes", () => {
    expect(() => buildSearchForm({ words: " " })).toThrow();
    expect(() => buildSearchForm({ words: "Rust", limit: 1 })).toThrow();
  });
});
describe("HTML parser", () => {
  test("extracts six records from user-provided result, removes highlights", async () => {
    const r = parseSearchResult(
      await Bun.file(new URL("./fixtures/rust.html", import.meta.url)).text(),
    );
    expect(r.total).toBe(6);
    expect(r.books).toHaveLength(6);
    expect(r.books[0]?.id).toBe("BB02965611");
    expect(r.books[0]?.title).toStartWith("Async Rust");
    expect(r.books[0]?.bibliography).toContain("2025");
    expect(r.books[0]?.url).toContain("pkey=BB02965611");
    expect(r.books[0]?.title).not.toContain("<b");
  });
  test("recognizes actual OPAC no-result code", () =>
    expect(
      parseSearchResult(
        '<p id="opac_description_area"><strong>OP-1001-I</strong><span id="description">指定された条件に該当する資料がありませんでした。</span></p>',
      ).total,
    ).toBe(0));
  test("accepts explicit zero results", () =>
    expect(parseSearchResult('<input name="hitcnt" value="0">').total).toBe(0));
  test("does not mistake login/error pages for no results", () => {
    expect(() =>
      parseSearchResult("<html>ログインしてください</html>"),
    ).toThrow();
    expect(() =>
      parseSearchResult('<input name="hitcnt" value="2">'),
    ).toThrow();
  });
});

test("accepts a single hit redirected directly to detail, without mobile duplication", () => {
  const html =
    '<title>WebOPAC Local書誌詳細</title><div class="opac_book_summary_area"><h3 class="opac_book_title">単一書誌</h3><div class="opac_book_bibliograph">著者. -- 出版者, 2026. &lt;BB1&gt;</div></div><div class="opac_book_summary_area"><h3 class="opac_book_title">単一書誌</h3></div><form name="opnurlform"><input name="rfr_dat" value="BB1"></form>';
  const r = parseSearchResult(html);
  expect(r.total).toBe(1);
  expect(r.books).toHaveLength(1);
  expect(r.books[0]?.bibliography).toBe("著者. -- 出版者, 2026.");
});

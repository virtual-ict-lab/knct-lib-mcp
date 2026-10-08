import { load } from "cheerio";

export const BASE = "https://libopac-c.kosen-k.go.jp";
import { buildSearchForm, type SearchOptions, type Campus } from "./search";
export { buildSearchForm } from "./search";
export type { SearchOptions, Campus } from "./search";
export interface Holding {
  volume: string;
  library: string;
  location: string;
  callNumber: string;
  materialId: string;
  status: string;
  comment: string;
}
export interface Book {
  id: string;
  title: string;
  bibliography: string;
  url: string;
  holdings?: Holding[];
  holdingsError?: string;
}
export interface SearchResult {
  total: number;
  books: Book[];
  searchUrl: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    start: number;
    end: number;
  };
}
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseSearchResult(
  html: string,
  searchUrl = `${BASE}/webopac41/cattab.do`,
): SearchResult {
  const $ = load(html);
  const books: Book[] = [];
  $(
    "#opac_list_form0 .opac_list > tbody > tr, #opac_list_form0 .opac_list > tr",
  ).each((_, row) => {
    const r = $(row);
    const id = r.find('input[name="bibid"]').attr("value");
    const title = clean(r.find(".opac_book_title a").first().text());
    if (id && title)
      books.push({
        id,
        title,
        bibliography: clean(r.find(".opac_book_bibliograph").text()),
        url: `${BASE}/webopac41/catdbl.do?${new URLSearchParams({ pkey: id, initFlg: "_RESULT_SET_NOTBIB" })}`,
      });
  });
  // WebOPAC redirects a single hit directly to the bibliographic detail page.
  if (!books.length && $("title").text().includes("Local書誌詳細")) {
    const summary = $(".opac_book_summary_area").first();
    const id = $('form[name="opnurlform"] input[name="rfr_dat"]').attr("value");
    const title = clean(summary.find(".opac_book_title").text());
    if (id && title)
      return {
        total: 1,
        books: [
          {
            id,
            title,
            bibliography: clean(
              summary.find(".opac_book_bibliograph").text(),
            ).replace(/\s*<[^>]+>$/, ""),
            url: `${BASE}/webopac41/catdbl.do?${new URLSearchParams({ pkey: id, initFlg: "_RESULT_SET_NOTBIB" })}`,
          },
        ],
        searchUrl,
      };
  }
  const counts = $('input[name="hitcnt"]')
    .map((_, el) => $(el).attr("value") ?? "")
    .get()
    .filter((v) => /^\d+$/.test(v));
  const noResults = $("#opac_description_area strong")
    .text()
    .includes("OP-1001-I");
  const total = counts.length
    ? Number(counts.at(-1))
    : noResults
      ? 0
      : undefined;
  if (total === undefined || (total > 0 && books.length === 0))
    throw new Error(
      "Unrecognized search results. The OPAC may have returned an error, the session may have expired, or the HTML may have changed",
    );
  return { total, books, searchUrl };
}

export function parseHoldings(html: string): {
  total: number;
  holdings: Holding[];
} {
  const $ = load(html);
  const table = $(".opac_booksyozou_area.syozou_yoko table").first();
  const headings = table
    .find("tr")
    .first()
    .children("th")
    .map((_, el) => clean($(el).text()))
    .get();
  const fields = {
    volume: "巻号",
    library: "所蔵館",
    location: "配置場所",
    callNumber: "請求記号",
    materialId: "資料ID",
    status: "状態",
    comment: "コメント",
  } as const;
  const section = $(".opac_ttl_middle")
    .filter((_, el) => $(el).find("h3").text().includes("所蔵一覧"))
    .first();
  const match = section
    .find(".subttl")
    .text()
    .match(/全\s*([\d,]+)\s*件/);
  if (
    !table.length ||
    Object.values(fields).some((label) => !headings.includes(label))
  ) {
    if (match && Number(match[1]!.replaceAll(",", "")) === 0)
      return { total: 0, holdings: [] };
    throw new Error("Unrecognized holdings list (OPAC error or HTML change)");
  }
  const holdings: Holding[] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (!cells.length) return;
    if (cells.length < headings.length)
      throw new Error("The holdings list is missing columns");
    const h = {} as Holding;
    for (const [key, label] of Object.entries(fields))
      h[key as keyof Holding] = clean(cells.eq(headings.indexOf(label)).text());
    holdings.push(h);
  });
  if (!match) throw new Error("Unrecognized holdings total");
  return { total: Number(match[1]!.replaceAll(",", "")), holdings };
}

export class OpacClient {
  constructor(
    private readonly request: (
      url: string,
      init?: RequestInit,
    ) => Promise<Response> = fetch,
  ) {}
  private session?: {
    key: string;
    headers: Record<string, string>;
    formKey: string;
    total: number;
  };
  async getHoldings(
    id: string,
    campus: Campus = "both",
    headers: Record<string, string> = {},
  ): Promise<Holding[]> {
    const rows: Holding[] = [];
    let start = 1;
    let total = Infinity;
    while (rows.length < total) {
      const p = new URLSearchParams({
        pkey: id,
        initFlg: "_RESULT_SET_NOTBIB",
        listcntHol: "100",
        stposHol: String(start),
        hollist_holar:
          campus === "both"
            ? "CAMPUS:75+76"
            : campus === "takamatsu"
              ? "75"
              : "76",
      });
      const response = await this.request(`${BASE}/webopac41/catdbl.do?${p}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Holdings: HTTP ${response.status}`);
      const page = parseHoldings(await response.text());
      total = page.total;
      if (total > rows.length && !page.holdings.length)
        throw new Error("Could not retrieve the remaining holdings");
      if (
        start > 1 &&
        page.holdings.some(
          (h) =>
            h.materialId && rows.some((r) => r.materialId === h.materialId),
        )
      )
        throw new Error("Could not verify holdings pagination");
      rows.push(...page.holdings);
      start += page.holdings.length;
    }
    // Only requested Kagawa campuses; never claim an empty OPAC status is available.
    return rows.filter((h) =>
      campus === "takamatsu"
        ? h.library.includes("香川(高松)")
        : campus === "takuma"
          ? h.library.includes("香川(詫間)")
          : /香川\((高松|詫間)\)/.test(h.library),
    );
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const form = buildSearchForm(options);
    const page = options.page ?? 1;
    const pageSize = options.limit ?? 10;
    const key = form.toString();
    let result: SearchResult;
    let headers: Record<string, string>;
    if (page === 1 || this.session?.key !== key) {
      headers = {
        "User-Agent": "knct-lib-cli/0.1",
        "Accept-Language": "ja",
        Accept: "text/html",
      };
      const top = await this.request(`${BASE}/webopac41/cattab.do`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!top.ok) throw new Error(`OPAC home page: HTTP ${top.status}`);
      const cookies = top.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      await top.text();
      if (cookies) headers.Cookie = cookies;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers.Origin = BASE;
      headers.Referer = `${BASE}/webopac41/cattab.do`;
      const response = await this.request(`${BASE}/webopac41/ctlsrh.do`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`OPAC search: HTTP ${response.status}`);
      const html = await response.text();
      result = parseSearchResult(html);
      const $ = load(html);
      const formKey = $('#fhtform input[name="formkeyno"]').attr("value") ?? "";
      this.session = { key, headers, formKey, total: result.total };
    } else {
      headers = this.session.headers;
      // The target page is fetched below using the original result session.
      result = {
        total: this.session.total,
        books: [],
        searchUrl: `${BASE}/webopac41/cattab.do`,
      };
    }
    const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
    if (page > totalPages)
      throw new Error(`Page must be in the range 1-${totalPages}`);
    const start = (page - 1) * pageSize + 1;
    if (page > 1) {
      if (!this.session!.formKey)
        throw new Error("Could not obtain a search session for pagination");
      form.set("initFlg", "_RESULT_SET_NOTBIB");
      form.set("formkeyno", this.session!.formKey);
      form.set("hitcnt", String(result.total));
      form.set("startpos", String(start));
      const response = await this.request(`${BASE}/webopac41/ctlsrh.do`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(`OPAC page retrieval: HTTP ${response.status}`);
      const html = await response.text();
      result = parseSearchResult(html);
      const actualStart = Number(
        load(html)("#opac_list_form0 .opac_list_no_area")
          .first()
          .text()
          .match(/^\s*(\d+)/)?.[1],
      );
      if (actualStart !== start)
        throw new Error(
          "Could not retrieve the requested page. The search session may have expired",
        );
    }
    result.pagination = {
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      start: result.total ? start : 0,
      end: result.total ? start + result.books.length - 1 : 0,
    };
    if (options.holdings !== false) {
      // Two workers bound OPAC traffic; retain books when an individual detail fails.
      let next = 0;
      const worker = async () => {
        while (next < result.books.length) {
          const book = result.books[next++]!;
          try {
            book.holdings = await this.getHoldings(
              book.id,
              options.campus ?? "both",
              headers,
            );
          } catch (e) {
            book.holdingsError = e instanceof Error ? e.message : String(e);
          }
        }
      };
      await Promise.all([worker(), worker()]);
    }
    return result;
  }
}

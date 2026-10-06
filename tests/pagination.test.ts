import { expect, test } from "bun:test";
import { OpacClient, buildSearchForm } from "../src/opac";
import { resultLines } from "../src/result-lines";
function list(start: number, count: number, total = 11) {
  return `<form id="opac_list_form0"><table class="opac_list">${Array.from({ length: count }, (_, i) => `<tr><th class="opac_list_no_area">${start + i}<input name="bibid" value="BB${start + i}"></th><td><h3 class="opac_book_title"><a>本 ${start + i}</a></h3><div class="opac_book_bibliograph">出版情報</div></td></tr>`).join("")}</table></form><form id="fhtform"><input name="formkeyno" value="fixture-session"><input name="hitcnt" value="${total}"></form>`;
}
test("bootstraps a standalone second page, keeps search session and conditions, and loads holdings", async () => {
  const posts: URLSearchParams[] = [];
  let detailCalls = 0;
  const holdings = await Bun.file(
    new URL("./fixtures/holdings.html", import.meta.url),
  ).text();
  const client = new OpacClient(async (url, init) => {
    if (url.includes("cattab.do"))
      return new Response("", {
        headers: { "Set-Cookie": "JSESSIONID=fixture; Path=/" },
      });
    if (url.includes("catdbl.do")) {
      detailCalls++;
      return new Response(holdings);
    }
    const p = new URLSearchParams(String(init?.body));
    posts.push(p);
    expect(new Headers(init?.headers).get("Cookie")).toBe("JSESSIONID=fixture");
    return new Response(
      list(
        p.get("startpos") === "11" ? 11 : 1,
        p.get("startpos") === "11" ? 1 : 10,
      ),
    );
  });
  const options = {
    words: "",
    limit: 10,
    conditions: [
      { field: "title" as const, value: "Rust" },
      { field: "title" as const, value: "Effective", operator: "NOT" as const },
    ],
  };
  const page2 = await client.search({ ...options, page: 2 });
  expect(posts).toHaveLength(2);
  expect(posts[1]?.get("initFlg")).toBe("_RESULT_SET_NOTBIB");
  expect(posts[1]?.get("formkeyno")).toBe("fixture-session");
  expect(posts[1]?.get("startpos")).toBe("11");
  expect(posts[1]?.get("optclm1")).toBe("NOT");
  expect(posts[1]?.getAll("holar")).toEqual(["75", "76"]);
  expect(page2.pagination).toEqual({
    page: 2,
    pageSize: 10,
    totalPages: 2,
    start: 11,
    end: 11,
  });
  expect(detailCalls).toBe(1);
  expect(page2.books[0]?.holdings?.[0]?.materialId).toBe("1084112");
  expect(resultLines(page2, 80)[0]).toStartWith("11.");
  const first = await client.search({ ...options, page: 1, holdings: false });
  expect(first.books[0]?.id).toBe("BB1");
  await expect(client.search({ ...options, page: 3 })).rejects.toThrow("1〜2");
});
test("rejects a stale session returning page one for a page two request", async () => {
  const client = new OpacClient(async () => new Response(list(1, 10)));
  await expect(
    client.search({ words: "Rust", page: 2, holdings: false }),
  ).rejects.toThrow("指定ページを取得できません");
});
test("validates page numbers", () => {
  for (const page of [0, -1, 1.5, NaN])
    expect(() => buildSearchForm({ words: "Rust", page })).toThrow(
      "ページ番号",
    );
});

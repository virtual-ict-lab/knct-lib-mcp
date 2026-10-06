import React from "react";
import { render } from "ink";
import { parseArgs } from "node:util";
import { OpacClient, type SearchOptions } from "./opac";
import { countries, languages, locations } from "./search";
import { Tui } from "./tui";
import { ENABLE_MOUSE, DISABLE_MOUSE } from "./mouse";
import { resultLines } from "./result-lines";
const help = `香川高専図書館検索
bun run start                         対話TUI
bun run search -- Rust                通常検索
bun run search -- --title Rust --author 中田

--mode simple|detail   --interactive   --json   --no-holdings
--campus both|takamatsu|takuma   --limit 10|20|50|100   --page ページ番号
--title 書名 --author 著者 --publisher 出版者
--condition '{"field":"title","value":"Rust","operator":"AND"}'（最大4回）
  field: words/title/auth/pub/sh/tag · operator: AND/OR/NOT（前の条件との結合）
--material-type bk|sr|av（複数可） --location 75/10001 --available-only
--isbn ISBN --year 開始年 --year-to 終了年 --ncid NCID --bib-id 書誌ID
--registration-number 登録番号 --material-id 資料ID --call-number 請求記号
--code-type LCCN|NBN|NDLCN|NDLPN|FID|OTHN --code コード
--country ja（複数可） --language jpn（複数可） --classification 分類
--sort 'syear,sauth/DESC,DESC'  --options 検索条件JSONファイル
--list countries|languages|locations    選択コード一覧をJSONで表示

TUI: Tab 通常/詳細切替 · ↑↓ 項目移動 · ←→ 選択 · Enter 選択一覧/検索
選択一覧: 入力で絞込 · ↑↓ 移動 · Space 複数選択 · Enter 決定
ページ: [前へ]/[次へ]をクリック · Ctrl+P/Ctrl+Nでも移動
結果: マウスホイール・トラックパッドでスクロール · Ctrl+G 入力/結果切替 · Ctrl+R 検索 · Esc 終了
`;
let restoreScreen: () => void = () => {};
try {
  const stringNames = [
    "mode",
    "campus",
    "limit",
    "page",
    "title",
    "author",
    "publisher",
    "isbn",
    "year",
    "year-to",
    "ncid",
    "bib-id",
    "registration-number",
    "material-id",
    "call-number",
    "location",
    "code-type",
    "code",
    "classification",
    "sort",
    "options",
    "list",
  ];
  const specs: Record<
    string,
    { type: "string" | "boolean"; multiple?: boolean; short?: string }
  > = {};
  for (const name of stringNames) specs[name] = { type: "string" };
  for (const name of ["condition", "material-type", "country", "language"])
    specs[name] = { type: "string", multiple: true };
  for (const name of ["json", "interactive", "no-holdings", "available-only"])
    specs[name] = { type: "boolean" };
  specs.help = { type: "boolean", short: "h" };
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: specs,
  });
  if (values.help) console.log(help);
  else if (values.list) {
    const catalog = { countries, languages, locations }[String(values.list)];
    if (!catalog) throw new Error("--listはcountries/languages/locationsです");
    console.log(JSON.stringify(catalog, null, 2));
  } else {
    let options: SearchOptions = { words: "", campus: "both", limit: 10 };
    if (values.options) {
      const data = await Bun.file(String(values.options)).json();
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("検索条件JSONはオブジェクトにしてください");
      options = { ...options, ...data };
    }
    if (positionals.length) options.words = positionals.join(" ");
    const map: Record<string, keyof SearchOptions> = {
      mode: "mode",
      campus: "campus",
      title: "title",
      author: "author",
      publisher: "publisher",
      isbn: "isbn",
      year: "year",
      "year-to": "yearTo",
      ncid: "ncid",
      "bib-id": "bibId",
      "registration-number": "registrationNumber",
      "material-id": "materialId",
      "call-number": "callNumber",
      location: "location",
      "code-type": "codeType",
      code: "code",
      classification: "classification",
      sort: "sort",
    };
    for (const [flag, key] of Object.entries(map))
      if (values[flag] !== undefined)
        Object.assign(options, { [key]: values[flag] });
    if (values.limit !== undefined) options.limit = Number(values.limit);
    if (values.page !== undefined) options.page = Number(values.page);
    if (values.condition)
      options.conditions = (values.condition as string[]).map((c) =>
        JSON.parse(c),
      );
    if (values["material-type"])
      options.materialTypes = values[
        "material-type"
      ] as SearchOptions["materialTypes"];
    if (values.country) options.countries = values.country as string[];
    if (values.language) options.languages = values.language as string[];
    if (values["available-only"]) options.availableOnly = true;
    if (values["no-holdings"]) options.holdings = false;
    const interactive = Boolean(
      values.interactive || (process.argv.length === 2 && !values.json),
    );
    if (interactive) {
      if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new Error(
          "対話TUIにはTTYが必要です。検索条件を指定するか--jsonを使ってください",
        );
      process.stdout.write("\u001b[?1049h" + ENABLE_MOUSE);
      let restored = false;
      restoreScreen = () => {
        if (!restored) {
          restored = true;
          process.stdout.write(DISABLE_MOUSE + "\u001b[?1049l\u001b[?25h");
        }
      };
      process.once("exit", restoreScreen);
      await render(<Tui options={options} />).waitUntilExit();
      restoreScreen();
    } else {
      const result = await new OpacClient().search(options);
      if (values.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(
          `${result.total}件中 ${result.pagination?.start ?? 0}〜${result.pagination?.end ?? 0}件（${result.pagination?.page}/${result.pagination?.totalPages}頁）\n${resultLines(result, process.stdout.columns || 100).join("\n")}`,
        );
      }
    }
  }
} catch (e) {
  restoreScreen();
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}

#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { OpacClient, type SearchOptions } from "./opac";
import { countries, languages, locations } from "./search";
import { resultLines } from "./result-lines";
const help = `Kagawa Kosen Library Search
klib Rust                            Simple search
klib Rust --campus both --json
klib --title Rust --author Klabnik

--mode simple|detail   --json   --no-holdings
--campus both|takamatsu|takuma   --limit 10|20|50|100   --page NUMBER
--title TITLE --author AUTHOR --publisher PUBLISHER
--condition '{"field":"title","value":"Rust","operator":"AND"}' (up to 4)
  field: words/title/auth/pub/sh/tag; operator: AND/OR/NOT (previous active row)
--material-type bk|sr|av (repeatable) --location 75/10001 --available-only
--isbn ISBN --year START --year-to END --ncid NCID --bib-id ID
--registration-number NUMBER --material-id ID --call-number NUMBER
--code-type LCCN|NBN|NDLCN|NDLPN|FID|OTHN --code VALUE
--country ja (repeatable) --language jpn (repeatable) --classification VALUE
--sort 'syear,sauth/DESC,DESC'  --options SEARCH_OPTIONS_JSON_FILE
--list countries|languages|locations    Print available codes as JSON

`;
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
  for (const name of ["json", "no-holdings", "available-only"])
    specs[name] = { type: "boolean" };
  specs.help = { type: "boolean", short: "h" };
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: specs,
  });
  if (values.help || process.argv.length === 2) console.log(help);
  else if (values.list) {
    const catalog = { countries, languages, locations }[String(values.list)];
    if (!catalog) throw new Error("--list must be countries, languages, or locations");
    console.log(JSON.stringify(catalog, null, 2));
  } else {
    let options: SearchOptions = { words: "", campus: "both", limit: 10 };
    if (values.options) {
      const data = await Bun.file(String(values.options)).json();
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Search options JSON must be an object");
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
    const result = await new OpacClient().search(options);
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `${result.total} records, showing ${result.pagination?.start ?? 0}-${result.pagination?.end ?? 0} (page ${result.pagination?.page}/${result.pagination?.totalPages})\n${resultLines(result, process.stdout.columns || 100).join("\n")}`,
      );
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}

import countries from "./data/countries.json";
import languages from "./data/languages.json";
import locations from "./data/locations.json";
export { countries, languages, locations };
export type Campus = "both" | "takamatsu" | "takuma";
export type SearchMode = "simple" | "detail";
export type SearchField = "words" | "title" | "auth" | "pub" | "sh" | "tag";
export type Operator = "AND" | "OR" | "NOT";
export interface Condition {
  field: SearchField;
  value: string;
  operator?: Operator;
}
export const fieldChoices = [
  { value: "words", label: "Keywords" },
  { value: "title", label: "Title" },
  { value: "auth", label: "Author" },
  { value: "pub", label: "Publisher" },
  { value: "sh", label: "Subject" },
  { value: "tag", label: "Tag" },
];
export const sortChoices = [
  { value: "", label: "OPAC default" },
  ...[
    ["stitle,sauth/ASC,ASC", "Title ascending"],
    ["stitle,sauth/DESC,DESC", "Title descending"],
    ["sauth,stitle/ASC,ASC", "Author ascending"],
    ["sauth,stitle/DESC,DESC", "Author descending"],
    ["syear,sauth/ASC,ASC", "Year ascending"],
    ["syear,sauth/DESC,DESC", "Year descending"],
    ["id/ASC", "Registration ascending"],
    ["id/DESC", "Registration descending"],
    ["relevance/DESC", "Relevance"],
    ["scircle,sauth/DESC,DESC", "Usage"],
  ].map(([value, label]) => ({ value: value!, label: label! })),
];
export const codeChoices = [
  "",
  "LCCN",
  "NBN",
  "NDLCN",
  "NDLPN",
  "FID",
  "OTHN",
].map((value) => ({ value, label: value || "Unspecified" }));
export interface SearchOptions {
  words: string;
  mode?: SearchMode;
  campus?: Campus;
  limit?: number;
  page?: number;
  title?: string;
  author?: string;
  publisher?: string;
  conditions?: Condition[];
  materialTypes?: ("bk" | "sr" | "av")[];
  location?: string;
  availableOnly?: boolean;
  isbn?: string;
  year?: string;
  yearTo?: string;
  ncid?: string;
  bibId?: string;
  registrationNumber?: string;
  materialId?: string;
  callNumber?: string;
  codeType?: string;
  code?: string;
  countries?: string[];
  languages?: string[];
  classification?: string;
  sort?: string;
  holdings?: boolean;
}
export function legacyConditions(o: SearchOptions): Condition[] {
  return [
    ["words", o.words],
    ["title", o.title],
    ["auth", o.author],
    ["pub", o.publisher],
  ]
    .filter(([, v]) => v?.trim())
    .map(([field, value]) => ({
      field: field as SearchField,
      value: value!,
      operator: "AND",
    }));
}
export function isDetailed(o: SearchOptions): boolean {
  return !!(
    o.conditions ||
    o.title ||
    o.author ||
    o.publisher ||
    o.isbn ||
    o.year ||
    o.yearTo ||
    o.ncid ||
    o.bibId ||
    o.registrationNumber ||
    o.materialId ||
    o.callNumber ||
    o.code ||
    o.codeType ||
    o.classification ||
    o.location ||
    o.availableOnly ||
    o.materialTypes?.length ||
    o.countries?.length ||
    o.languages?.length
  );
}
export function buildSearchForm(o: SearchOptions): URLSearchParams {
  const strings = [
    "words",
    "title",
    "author",
    "publisher",
    "isbn",
    "year",
    "yearTo",
    "ncid",
    "bibId",
    "registrationNumber",
    "materialId",
    "callNumber",
    "codeType",
    "code",
    "classification",
    "location",
    "sort",
  ] as const;
  for (const key of strings)
    if (o[key] !== undefined && typeof o[key] !== "string")
      throw new Error(`${key} must be a string`);
  if (typeof o.words !== "string")
    throw new Error("words must be a string");
  for (const key of [
    "conditions",
    "materialTypes",
    "countries",
    "languages",
  ] as const)
    if (o[key] !== undefined && !Array.isArray(o[key]))
      throw new Error(`${key} must be an array`);
  for (const key of ["availableOnly", "holdings"] as const)
    if (o[key] !== undefined && typeof o[key] !== "boolean")
      throw new Error(`${key} must be a boolean`);
  if (!["both", "takamatsu", "takuma"].includes(o.campus ?? "both"))
    throw new Error("Invalid campus");
  if (o.page !== undefined && (!Number.isSafeInteger(o.page) || o.page < 1))
    throw new Error("Page must be a positive safe integer");
  if (![10, 20, 50, 100].includes(o.limit ?? 10))
    throw new Error("Page size must be 10, 20, 50, or 100");
  if (o.mode && !["simple", "detail"].includes(o.mode))
    throw new Error("Search mode must be simple or detail");
  const detail = o.mode ? o.mode === "detail" : isDetailed(o);
  if (!detail && isDetailed(o))
    throw new Error(
      "Simple search does not support detailed conditions. Use --mode detail",
    );
  const conditions = o.conditions ?? legacyConditions(o);
  if (conditions.length > 4) throw new Error("At most four search conditions are allowed");
  for (const c of conditions) {
    if (!c || typeof c !== "object" || typeof c.value !== "string")
      throw new Error("Each condition must be an object with field/value/operator");
    if (!fieldChoices.some((f) => f.value === c.field))
      throw new Error("Invalid search field");
    if (c.operator && !["AND", "OR", "NOT"].includes(c.operator))
      throw new Error("Operator must be AND, OR, or NOT");
  }
  for (const y of [o.year, o.yearTo])
    if (y && !/^\d{4}$/.test(y))
      throw new Error("Publication years must have four digits");
  if (o.year && o.yearTo && o.year > o.yearTo)
    throw new Error("Start year must not be later than end year");
  if (o.sort && !sortChoices.some((s) => s.value === o.sort))
    throw new Error("Invalid sort order");
  if (o.codeType && !codeChoices.some((c) => c.value === o.codeType))
    throw new Error("Invalid code type");
  if (o.code && !o.codeType) throw new Error("Select a code type");
  for (const t of o.materialTypes ?? [])
    if (!["bk", "sr", "av"].includes(t))
      throw new Error("Material types must be bk, sr, or av");
  for (const [values, catalog, label] of [
    [o.countries, countries, "Country"],
    [o.languages, languages, "Language"],
  ] as const)
    for (const value of values ?? [])
      if (!catalog.some((c) => c.value === value))
        throw new Error(`Invalid ${label.toLowerCase()} code: ${value}`);
  if (
    o.location &&
    (!locations.some((l) => l.value === o.location) ||
      (o.campus === "takamatsu" && !o.location.startsWith("75/")) ||
      (o.campus === "takuma" && !o.location.startsWith("76/")))
  )
    throw new Error("Location must match the selected campus");
  if (
    !(detail
      ? conditions.some((c) => c.value.trim()) ||
        [
          o.isbn,
          o.year,
          o.yearTo,
          o.ncid,
          o.bibId,
          o.registrationNumber,
          o.materialId,
          o.callNumber,
          o.code,
          o.classification,
          o.location,
        ].some(Boolean) ||
        o.availableOnly ||
        o.materialTypes?.length ||
        o.countries?.length ||
        o.languages?.length
      : o.words.trim())
  )
    throw new Error("Enter search criteria");
  const p = new URLSearchParams();
  for (const name of "formkeyno sortkey sorttype startpos hitcnt searchsql combsearch searchhis akey fct_gcattp fct_auth fct_pub fct_year fct_cls fct_sh fct_lang fct_holar fct_campus fct_tag fct_range_year fct_stamp fct_user1 fct_user2 fct_user3 fct_user4 fct_user5 fct_holstat fct_target_name".split(
    " ",
  ))
    p.set(name, "");
  for (const id of o.campus === "takamatsu"
    ? ["75"]
    : o.campus === "takuma"
      ? ["76"]
      : ["75", "76"])
    p.append("holar", id);
  p.set("listcnt", String(o.limit ?? 10));
  p.set("sortkey", o.sort ?? "");
  p.set("fromDsp", detail ? "catsrd" : "catsre");
  p.set("searchDsp", detail ? "catsrd" : "catsre");
  p.set("initFlg", "_RESULT_SET");
  p.set("tab_num", "0");
  p.set("search_mode", detail ? "detail" : "simple");
  p.set("all_area", "false");
  if (!detail) p.set("words", o.words.trim());
  else {
    const active = conditions.filter((c) => c.value.trim());
    for (let i = 0; i < 4; i++) {
      const c = active[i];
      p.set(`srhclm${i + 1}`, c?.field ?? "words");
      p.set(`valclm${i + 1}`, c?.value.trim() ?? "");
      if (i > 0) p.set(`optclm${i}`, c?.operator ?? "AND");
    }
    for (const [name, value] of Object.entries({
      isbn_issn: o.isbn,
      year: o.year,
      year2: o.yearTo,
      ncid: o.ncid,
      bibid: o.bibId,
      rgtn: o.registrationNumber,
      lenid: o.materialId,
      cln: o.callNumber,
      code_type: o.codeType,
      code: o.code,
      cntry: o.countries?.join("+"),
      lang: o.languages?.join("+"),
      cls: o.classification,
      hollc: o.location,
    }))
      p.set(name, value ?? "");
    if (o.availableOnly) p.set("holstat", "ZZ");
    if (!o.materialTypes?.length) p.set("gcattp_flag", "all");
    else for (const t of [...new Set(o.materialTypes)]) p.append("gcattp", t);
  }
  return p;
}

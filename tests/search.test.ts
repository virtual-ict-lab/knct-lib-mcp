import { expect, test } from "bun:test";
import {
  buildSearchForm,
  countries,
  languages,
  locations,
} from "../src/search";
test("four rows preserve AND/OR/NOT and repeated field selections", () => {
  const p = buildSearchForm({
    words: "",
    conditions: [
      { field: "title", value: "Rust" },
      { field: "title", value: "TypeScript", operator: "OR" },
      { field: "auth", value: "中田", operator: "AND" },
      { field: "sh", value: "ゲーム", operator: "NOT" },
    ],
  });
  expect(p.get("srhclm2")).toBe("title");
  expect(p.get("optclm1")).toBe("OR");
  expect(p.get("optclm2")).toBe("AND");
  expect(p.get("optclm3")).toBe("NOT");
  expect(p.get("valclm4")).toBe("ゲーム");
});
test("all advanced options map to actual OPAC field names; multiple codes use plus", () => {
  const p = buildSearchForm({
    words: "",
    materialTypes: ["bk", "av"],
    campus: "takamatsu",
    location: "75/10001",
    availableOnly: true,
    isbn: "123",
    year: "2000",
    yearTo: "2026",
    ncid: "NC1",
    bibId: "BB1",
    registrationNumber: "R1",
    materialId: "M1",
    callNumber: "007.64",
    codeType: "LCCN",
    code: "C1",
    countries: ["ja", "us"],
    languages: ["jpn", "eng"],
    classification: "007",
    sort: "stitle,sauth/ASC,ASC",
    limit: 50,
  });
  expect(p.getAll("gcattp")).toEqual(["bk", "av"]);
  expect(p.has("gcattp_flag")).toBe(false);
  for (const [key, value] of Object.entries({
    hollc: "75/10001",
    holstat: "ZZ",
    isbn_issn: "123",
    year: "2000",
    year2: "2026",
    ncid: "NC1",
    bibid: "BB1",
    rgtn: "R1",
    lenid: "M1",
    cln: "007.64",
    code_type: "LCCN",
    code: "C1",
    cntry: "ja+us",
    lang: "jpn+eng",
    cls: "007",
    sortkey: "stitle,sauth/ASC,ASC",
    listcnt: "50",
  }))
    expect(p.get(key)).toBe(value);
  expect(new URLSearchParams(p.toString()).get("cntry")).toBe("ja+us");
});
test("filter-only searches and blank intermediate rows are handled", () => {
  expect(
    buildSearchForm({ words: "", languages: ["jpn"] }).get("search_mode"),
  ).toBe("detail");
  const p = buildSearchForm({
    words: "",
    conditions: [
      { field: "title", value: "Rust" },
      { field: "auth", value: "" },
      { field: "title", value: "Effective", operator: "NOT" },
    ],
  });
  expect(p.get("optclm1")).toBe("NOT");
  expect(p.get("valclm2")).toBe("Effective");
});
test("rejects inconsistent campuses, invalid codes, too many rows and incompatible simple search", () => {
  for (const options of [
    { words: "Rust", campus: "takuma" as const, location: "75/10001" },
    { words: "Rust", languages: ["invalid"] },
    { words: "Rust", year: "2026", yearTo: "2000" },
    { words: "Rust", mode: "simple" as const, title: "Rust" },
    {
      words: "",
      conditions: Array.from({ length: 5 }, () => ({
        field: "title" as const,
        value: "Rust",
      })),
    },
  ])
    expect(() => buildSearchForm(options)).toThrow();
  expect(countries.some((c) => c.value === "ja")).toBe(true);
  expect(languages.some((c) => c.value === "jpn")).toBe(true);
  expect(locations.every((l) => /^(75|76)\//.test(l.value))).toBe(true);
});
test("catalog labels are English while OPAC codes remain unchanged", () => {
  for (const catalog of [countries, languages, locations]) {
    for (const choice of catalog) {
      expect(choice.label).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      expect(choice.label.trim().length).toBeGreaterThan(0);
    }
  }
  expect(countries.find((c) => c.value === "ja")?.label).toBe("Japan");
  expect(languages.find((c) => c.value === "jpn")?.label).toBe("Japanese");
  expect(locations.find((c) => c.value === "75/10001")?.label).toContain("Reading room");
});

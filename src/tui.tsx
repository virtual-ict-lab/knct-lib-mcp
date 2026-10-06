import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import sliceAnsi from "slice-ansi";
import { OpacClient, type SearchResult } from "./opac";
import {
  countries,
  languages,
  locations,
  fieldChoices,
  sortChoices,
  codeChoices,
  legacyConditions,
  isDetailed,
  type SearchOptions,
  type Condition,
  type SearchMode,
} from "./search";
import { parseMouseReport } from "./mouse";
import { resultLines, viewport } from "./result-lines";
interface Choice {
  value: string;
  label: string;
}
interface Field {
  id: string;
  label: string;
  value: string;
  text?: boolean;
  choices?: Choice[];
  multi?: boolean;
  set: (value: string) => void;
}
const campusChoices = [
  { value: "both", label: "高松・詫間" },
  { value: "takamatsu", label: "高松" },
  { value: "takuma", label: "詫間" },
];
const typeChoices = [
  { value: "bk", label: "図書" },
  { value: "sr", label: "雑誌" },
  { value: "av", label: "AV資料" },
];
const opChoices = [
  { value: "AND", label: "かつ (AND)" },
  { value: "OR", label: "または (OR)" },
  { value: "NOT", label: "含まない (NOT)" },
];
function useSize() {
  const [size, setSize] = useState({
    width: process.stdout.columns || 100,
    height: process.stdout.rows || 30,
  });
  useEffect(() => {
    const resize = () =>
      setSize({
        width: process.stdout.columns || 100,
        height: process.stdout.rows || 30,
      });
    process.stdout.on("resize", resize);
    return () => {
      process.stdout.off("resize", resize);
    };
  }, []);
  return size;
}
function Picker({
  field,
  height,
  width,
  onClose,
}: {
  field: Field;
  height: number;
  width: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(
    new Set(field.value.split("+").filter(Boolean)),
  );
  const choices = useMemo(
    () =>
      field.choices!.filter((c) =>
        `${c.value} ${c.label}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [field.choices, query],
  );
  const rows = Math.max(1, height - 5);
  const visible = viewport(
    choices.map(
      (c) => `${selected.has(c.value) ? "[✓]" : "[ ]"} ${c.value} ${c.label}`,
    ),
    Math.max(0, index - rows + 1),
    rows,
  );
  useInput((input, key) => {
    const mouse = parseMouseReport(input);
    if (mouse) {
      if (mouse.wheel)
        setIndex((i) =>
          Math.max(0, Math.min(choices.length - 1, i + mouse.wheel * 3)),
        );
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((i) => Math.min(choices.length - 1, i + 1));
      return;
    }
    if (key.pageUp || key.pageDown) {
      setIndex((i) =>
        Math.max(
          0,
          Math.min(choices.length - 1, i + (key.pageUp ? -rows : rows)),
        ),
      );
      return;
    }
    if (key.return) {
      const c = choices[index];
      if (field.multi) field.set([...selected].join("+"));
      else if (c) field.set(c.value);
      onClose();
      return;
    }
    if (input === " " && field.multi) {
      const c = choices[index];
      if (c)
        setSelected((s) => {
          const next = new Set(s);
          next.has(c.value) ? next.delete(c.value) : next.add(c.value);
          return next;
        });
      return;
    }
    if (key.ctrl && input === "u") {
      setSelected(new Set());
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => Array.from(q).slice(0, -1).join(""));
      setIndex(0);
      return;
    }
    if (
      !key.ctrl &&
      !key.meta &&
      !key.tab &&
      input &&
      !/[\x00-\x1f\x7f]/.test(input)
    ) {
      setQuery((q) => q + input);
      setIndex(0);
    }
  });
  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text bold color="cyan">
        {field.label}を選択 {field.multi ? "（複数選択）" : ""}
      </Text>
      <Text wrap="truncate">絞り込み › {query || "コード・名前を入力"}</Text>
      <Text dimColor>
        {choices.length}候補 / {selected.size}件選択
      </Text>
      <Box flexDirection="column" height={rows} overflow="hidden">
        {visible.lines.map((line, i) => (
          <Text
            key={i}
            wrap="truncate"
            color={visible.offset + i === index ? "cyan" : undefined}
          >
            {visible.offset + i === index ? "› " : "  "}
            {line}
          </Text>
        ))}
      </Box>
      <Text dimColor wrap="truncate">
        ↑↓: 移動 / {field.multi ? "Space: 選択 / Ctrl+U: 全解除 / " : ""}Enter:
        決定 / Esc: 戻る
      </Text>
    </Box>
  );
}
export function Tui({
  options,
  client,
  terminalSize,
}: {
  options: SearchOptions;
  client?: Pick<OpacClient, "search">;
  terminalSize?: { width: number; height: number };
}) {
  const { exit } = useApp();
  const measured = useSize();
  const size = terminalSize ?? measured;
  const height = Math.max(10, size.height - 1);
  const width = Math.max(20, size.width);
  const [mode, setMode] = useState<SearchMode>(
    options.mode ?? (isDetailed(options) ? "detail" : "simple"),
  );
  const [form, setForm] = useState(options);
  const [conditions, setConditions] = useState<Condition[]>(() => {
    const defaults: Condition[] = [
      { field: "words", value: options.words, operator: "AND" },
      { field: "title", value: options.title ?? "", operator: "AND" },
      { field: "auth", value: options.author ?? "", operator: "AND" },
      { field: "pub", value: options.publisher ?? "", operator: "AND" },
    ];
    return defaults.map((c, i) => options.conditions?.[i] ?? c);
  });
  const [focus, setFocus] = useState(0);
  const [cursor, setCursor] = useState(Array.from(options.words).length);
  const [pane, setPane] = useState<"form" | "results">("form");
  const [picker, setPicker] = useState<Field>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult>();
  const [scroll, setScroll] = useState(0);
  const defaultClient = useRef(new OpacClient());
  const pending = useRef(false);
  const [lastRequest, setLastRequest] = useState<SearchOptions>();
  const set = (key: keyof SearchOptions, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const fields: Field[] = [];
  const text = (key: keyof SearchOptions, label: string) =>
    fields.push({
      id: key,
      label,
      value: String(form[key] ?? ""),
      text: true,
      set: (v) => {
        set(key, v);
        if (key === "words")
          setConditions((cs) =>
            cs.map((c, i) =>
              i === 0 && c.field === "words" ? { ...c, value: v } : c,
            ),
          );
      },
    });
  const choice = (
    key: keyof SearchOptions,
    label: string,
    choices: Choice[],
    multi = false,
  ) =>
    fields.push({
      id: key,
      label,
      value: Array.isArray(form[key])
        ? (form[key] as string[]).join("+")
        : String(form[key] ?? ""),
      choices,
      multi,
      set: (v) => {
        set(key, multi ? v.split("+").filter(Boolean) : v);
        if (key === "campus" && v !== form.campus) set("location", "");
      },
    });
  if (mode === "simple") text("words", "キーワード");
  else {
    choice("materialTypes", "資料種別", typeChoices, true);
    choice("campus", "所蔵館", campusChoices);
    choice("location", "配置場所", [
      { value: "", label: "全て" },
      ...locations.filter((l) =>
        form.campus === "takamatsu"
          ? l.value.startsWith("75/")
          : form.campus === "takuma"
            ? l.value.startsWith("76/")
            : true,
      ),
    ]);
    fields.push({
      id: "availableOnly",
      label: "館内資料のみ",
      value: form.availableOnly ? "true" : "false",
      choices: [
        { value: "false", label: "指定なし" },
        { value: "true", label: "館内にある資料のみ" },
      ],
      set: (v) => set("availableOnly", v === "true"),
    });
    conditions.forEach((c, i) => {
      const update = (key: keyof Condition, value: string) =>
        setConditions((cs) =>
          cs.map((old, j) => (j === i ? { ...old, [key]: value } : old)),
        );
      if (i > 0)
        fields.push({
          id: `op${i}`,
          label: `条件${i + 1} 結合`,
          value: c.operator ?? "AND",
          choices: opChoices,
          set: (v) => update("operator", v),
        });
      fields.push({
        id: `field${i}`,
        label: `条件${i + 1} 項目`,
        value: c.field,
        choices: fieldChoices,
        set: (v) => update("field", v),
      });
      fields.push({
        id: `value${i}`,
        label: `条件${i + 1} 値`,
        value: c.value,
        text: true,
        set: (v) => update("value", v),
      });
    });
    text("year", "出版年（開始）");
    text("yearTo", "出版年（終了）");
    text("isbn", "ISBN/ISSN");
    text("ncid", "NCID");
    text("bibId", "書誌ID");
    text("registrationNumber", "登録番号");
    text("materialId", "資料ID");
    text("callNumber", "請求記号");
    choice("codeType", "コード種別", codeChoices);
    text("code", "コード");
    choice("countries", "出版国コード", countries, true);
    choice("languages", "言語コード", languages, true);
    text("classification", "分類");
  }
  if (mode === "simple") choice("campus", "所蔵館", campusChoices);
  choice("sort", "表示順", sortChoices);
  fields.push({
    id: "limit",
    label: "表示件数",
    value: String(form.limit ?? 10),
    choices: [10, 20, 50, 100].map((n) => ({
      value: String(n),
      label: `${n}件`,
    })),
    set: (v) => set("limit", Number(v)),
  });
  const current = fields[Math.min(focus, fields.length - 1)]!;
  const formRows =
    mode === "simple"
      ? Math.min(4, height - 7)
      : Math.max(2, Math.min(14, Math.floor((height - 7) / 2)));
  const resultRows = Math.max(1, height - formRows - 7);
  const formStart = Math.max(
    0,
    Math.min(focus - Math.floor(formRows / 2), fields.length - formRows),
  );
  const lines = useMemo(() => resultLines(result, width), [result, width]);
  const visible = viewport(lines, scroll, resultRows);
  const page = result?.pagination?.page ?? lastRequest?.page ?? 1;
  const pageCount =
    result?.pagination?.totalPages ??
    Math.max(1, Math.ceil((result?.total ?? 0) / (lastRequest?.limit ?? 10)));
  function changePage(target: number) {
    if (
      lastRequest &&
      !pending.current &&
      target >= 1 &&
      target <= pageCount &&
      target !== page
    )
      void search(target, lastRequest);
  }
  async function search(targetPage = 1, snapshot?: SearchOptions) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const request: SearchOptions =
        snapshot ??
        (mode === "simple"
          ? {
              words: form.words,
              mode,
              campus: form.campus,
              limit: form.limit,
              sort: form.sort,
              holdings: form.holdings,
            }
          : { ...form, mode, conditions });
      const pagedRequest = { ...request, page: targetPage };
      const r = await (client ?? defaultClient.current).search(pagedRequest);
      setLastRequest(pagedRequest);
      setResult(r);
      setScroll(0);
      process.exitCode = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useInput(
    (input, key) => {
      const mouse = parseMouseReport(input);
      if (mouse) {
        const pagerRow = formRows + 6;
        if (mouse.leftClick && mouse.y === pagerRow) {
          if (mouse.x >= 1 && mouse.x <= 6) changePage(page - 1);
          if (mouse.x >= 9 && mouse.x <= 14) changePage(page + 1);
        }
        const resultsTop = formRows + 7;
        if (
          mouse.wheel &&
          mouse.y >= resultsTop &&
          mouse.y < resultsTop + resultRows &&
          mouse.x >= 1 &&
          mouse.x <= width
        ) {
          setScroll((previous) =>
            Math.max(
              0,
              Math.min(
                previous + mouse.wheel * 3,
                Math.max(0, lines.length - resultRows),
              ),
            ),
          );
        }
        return;
      }
      if (key.escape) {
        exit();
        return;
      }
      if (key.tab) {
        const nextMode = mode === "simple" ? "detail" : "simple";
        setMode(nextMode);
        setFocus(0);
        setCursor(nextMode === "simple" ? Array.from(form.words).length : 0);
        setPane("form");
        return;
      }
      if (key.ctrl && input === "g") {
        setPane((p) => (p === "form" ? "results" : "form"));
        return;
      }
      if (key.pageUp || key.pageDown) {
        setScroll(visible.offset + (key.pageUp ? -resultRows : resultRows));
        return;
      }
      if (key.ctrl && (input === "n" || input === "p")) {
        changePage(page + (input === "n" ? 1 : -1));
        return;
      }
      if (key.ctrl && input === "r") {
        void search();
        return;
      }
      if (pane === "results") {
        if (key.upArrow || key.downArrow)
          setScroll(visible.offset + (key.upArrow ? -1 : 1));
        if (key.home) setScroll(0);
        if (key.end) setScroll(lines.length);
        return;
      }
      if (key.upArrow || key.downArrow) {
        const next =
          (focus + (key.upArrow ? fields.length - 1 : 1)) % fields.length;
        setFocus(next);
        setCursor(Array.from(fields[next]!.value).length);
        return;
      }
      if (current.choices) {
        if (key.return || input === " ") {
          setPicker(current);
          return;
        }
        if ((key.leftArrow || key.rightArrow) && !current.multi) {
          const i = current.choices.findIndex((c) => c.value === current.value);
          const next =
            (i + (key.leftArrow ? current.choices.length - 1 : 1)) %
            current.choices.length;
          current.set(current.choices[next]!.value);
          if (current.id === "campus") set("location", "");
        }
        return;
      }
      if (key.return) {
        void search();
        return;
      }
      const chars = Array.from(current.value);
      const at = Math.min(cursor, chars.length);
      if (key.leftArrow) {
        setCursor(Math.max(0, at - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor(Math.min(chars.length, at + 1));
        return;
      }
      if (key.home) {
        setCursor(0);
        return;
      }
      if (key.end) {
        setCursor(chars.length);
        return;
      }
      if (key.ctrl && input === "u") {
        current.set("");
        setCursor(0);
        return;
      }
      if (key.backspace || key.delete) {
        if (at > 0) {
          chars.splice(at - 1, 1);
          current.set(chars.join(""));
          setCursor(at - 1);
        }
        return;
      }
      if (!key.ctrl && !key.meta && input && !/[\x00-\x1f\x7f]/.test(input)) {
        chars.splice(at, 0, ...Array.from(input));
        current.set(chars.join(""));
        setCursor(at + Array.from(input).length);
      }
    },
    { isActive: !picker },
  );
  if (picker)
    return (
      <Picker
        field={picker}
        height={height}
        width={width}
        onClose={() => {
          setPicker(undefined);
        }}
      />
    );
  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text bold color="cyan" wrap="truncate">
        香川高専図書館
      </Text>
      <Text wrap="truncate">
        <Text inverse={mode === "simple"}> 通常検索 </Text>{" "}
        <Text inverse={mode === "detail"}> 詳細検索 </Text>
        <Text dimColor> Tabで切替</Text>
      </Text>
      <Text dimColor wrap="truncate">
        ↑↓ 項目 / ←→ 選択 / Enter 選択一覧・検索 / Ctrl+R 検索
      </Text>
      <Box flexDirection="column" height={formRows} overflow="hidden">
        {fields.slice(formStart, formStart + formRows).map((f, i) => {
          const selected = pane === "form" && formStart + i === focus;
          const label = f.multi
            ? f.value
              ? f.value
                  .split("+")
                  .map((v) => f.choices?.find((c) => c.value === v)?.label ?? v)
                  .join("・")
              : f.id === "materialTypes"
                ? "全て"
                : "指定なし"
            : (f.choices?.find((c) => c.value === f.value)?.label ?? f.value);
          const chars = Array.from(f.value);
          const at = Math.min(cursor, chars.length);
          return (
            <Box key={f.id} height={1} overflow="hidden">
              <Box width={Math.min(20, Math.floor(width / 2))}>
                <Text wrap="truncate" color={selected ? "cyan" : undefined}>
                  {selected ? "› " : "  "}
                  {f.label}
                </Text>
              </Box>
              <Box flexGrow={1} overflow="hidden">
                <Text wrap="truncate">
                  {f.text && selected ? (
                    <>
                      {chars.slice(0, at).join("")}
                      <Text inverse>{chars[at] || " "}</Text>
                      {chars.slice(at + 1).join("")}
                    </>
                  ) : (
                    label || "—"
                  )}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Text dimColor wrap="truncate">
        項目 {focus + 1}/{fields.length} · 入力↑↓ /
        結果はホイール・トラックパッド / Ctrl+Gで結果へ
      </Text>
      <Text color={pane === "results" ? "cyan" : "green"} wrap="truncate">
        {busy
          ? "検索・所蔵情報を取得中…"
          : result
            ? `${result.total}件中${result.books.length}件 · 結果 ${visible.offset + 1}〜${visible.offset + visible.lines.length}/${lines.length}行`
            : "検索結果"}
      </Text>
      <Text wrap="truncate">
        <Text dimColor={!result || page <= 1 || busy}>[前へ]</Text>
        {"  "}
        <Text dimColor={!result || page >= pageCount || busy}>[次へ]</Text>
        {"  "}
        {page}/{pageCount}頁 · クリック / Ctrl+P・Ctrl+N
      </Text>
      <Box flexDirection="column" height={resultRows} overflow="hidden">
        {visible.lines.map((line, i) => (
          <Text key={i} wrap="truncate">
            {sliceAnsi(line, 0, width)}
          </Text>
        ))}
      </Box>
      <Text color={error ? "red" : undefined} dimColor={!error} wrap="truncate">
        {error || "Esc 終了 / Ctrl+G 入力・結果切替 / Ctrl+U 入力を消去"}
      </Text>
    </Box>
  );
}

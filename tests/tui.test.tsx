import React from "react";
import { expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Tui } from "../src/tui";
import type { SearchOptions, SearchResult } from "../src/opac";
const tick = () => new Promise((r) => setTimeout(r, 40));
const result: SearchResult = {
  total: 20,
  searchUrl: "",
  books: Array.from({ length: 20 }, (_, i) => ({
    id: `BB${i}`,
    title: `長い検索結果 ${i}`,
    bibliography: "著者・出版情報",
    url: `https://example.com/${i}`,
    holdings: [
      {
        volume: "上",
        library: "香川(高松)",
        location: "閲覧室",
        callNumber: "007.64",
        materialId: `${i}`,
        status: "",
        comment: "",
      },
    ],
  })),
};
test("bounded viewport retains result scroll position while editing and moves form with arrows", async () => {
  const app = render(
    <Tui
      options={{ words: "Rust" }}
      client={{ search: async () => result }}
      terminalSize={{ width: 80, height: 24 }}
    />,
  );
  try {
    await tick();
    app.stdin.write("\r");
    await tick();
    app.stdin.write("\u001b[6~");
    await tick();
    const before = app.lastFrame()!.match(/結果 (\d+)〜/);
    expect(Number(before?.[1])).toBeGreaterThan(1);
    app.stdin.write("X");
    await tick();
    expect(app.lastFrame()!.match(/結果 (\d+)〜/)?.[1]).toBe(before?.[1]);
    expect(app.lastFrame()!.split("\n").length).toBeLessThanOrEqual(23);
    app.stdin.write("\u001b[B");
    await tick();
    expect(app.lastFrame()).toContain("› 所蔵館");
    app.stdin.write("\t");
    await tick();
    expect(app.lastFrame()).toContain("› 資料種別");
    expect(app.lastFrame()!.match(/結果 (\d+)〜/)?.[1]).toBe(before?.[1]);
  } finally {
    app.unmount();
    app.cleanup();
  }
});
test("selector applies material type and condition NOT through TUI to shared search options", async () => {
  let request: SearchOptions | undefined;
  const app = render(
    <Tui
      options={{ words: "Rust", mode: "detail" }}
      client={{
        search: async (o) => {
          request = o;
          return result;
        },
      }}
      terminalSize={{ width: 80, height: 24 }}
    />,
  );
  try {
    await tick();
    app.stdin.write("\r");
    await tick();
    expect(app.lastFrame()).toContain("資料種別を選択");
    app.stdin.write(" ");
    await tick();
    app.stdin.write("\r");
    await tick();
    for (let i = 0; i < 6; i++) {
      app.stdin.write("\u001b[B");
      await tick();
    }
    expect(app.lastFrame()).toContain("› 条件2 結合");
    app.stdin.write("\u001b[D");
    await tick();
    app.stdin.write("\u0012");
    await tick();
    expect(request?.materialTypes).toEqual(["bk"]);
    expect(request?.conditions?.[1]?.operator).toBe("NOT");
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test("wheel scrolls results only, keeps search header and input focus fixed, and consumes other mouse reports", async () => {
  const app = render(
    <Tui
      options={{ words: "Rust" }}
      client={{ search: async () => result }}
      terminalSize={{ width: 80, height: 24 }}
    />,
  );
  try {
    await tick();
    app.stdin.write("\r");
    await tick();
    const header = app.lastFrame()!.split("\n").slice(0, 8).join("\n");
    app.stdin.write("\u001b[<65;30;15M");
    await tick();
    expect(app.lastFrame()!.match(/結果 (\d+)〜/)?.[1]).toBe("4");
    expect(app.lastFrame()!.split("\n").slice(0, 8).join("\n")).toBe(header);
    app.stdin.write("\u001b[<65;30;4M");
    await tick();
    expect(app.lastFrame()!.match(/結果 (\d+)〜/)?.[1]).toBe("4");
    app.stdin.write("\u001b[<64;30;15M");
    await tick();
    expect(app.lastFrame()!.match(/結果 (\d+)〜/)?.[1]).toBe("1");
    app.stdin.write("\u001b[<0;30;15M");
    await tick();
    app.stdin.write("\u001b[<0;30;15m");
    await tick();
    app.stdin.write("X");
    await tick();
    expect(app.lastFrame()).toContain("RustX");
    expect(app.lastFrame()).not.toContain("[<");
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test("clickable pages retain the original query while the form is edited and reset scrolling", async () => {
  const requests: SearchOptions[] = [];
  const app = render(
    <Tui
      options={{ words: "Rust" }}
      terminalSize={{ width: 80, height: 24 }}
      client={{
        search: async (options) => {
          requests.push(options);
          const page = options.page ?? 1;
          return {
            ...result,
            total: 21,
            books: result.books.slice(0, page === 3 ? 1 : 10),
            pagination: {
              page,
              pageSize: 10,
              totalPages: 3,
              start: (page - 1) * 10 + 1,
              end: Math.min(21, page * 10),
            },
          };
        },
      }}
    />,
  );
  try {
    await tick();
    app.stdin.write("\r");
    await tick();
    app.stdin.write("X");
    await tick();
    app.stdin.write("\u001b[<65;30;15M");
    await tick();
    app.stdin.write("\u001b[<0;10;10M");
    await tick();
    expect(requests[1]?.page).toBe(2);
    expect(requests[1]?.words).toBe("Rust");
    expect(app.lastFrame()).toContain("RustX");
    expect(app.lastFrame()).toContain("2/3頁");
    expect(app.lastFrame()).toContain("結果 1〜");
    app.stdin.write("\u000e");
    await tick();
    expect(app.lastFrame()).toContain("3/3頁");
    app.stdin.write("\u000e");
    await tick();
    expect(requests).toHaveLength(3);
    app.stdin.write("\u0010");
    await tick();
    expect(app.lastFrame()).toContain("2/3頁");
    app.stdin.write("\r");
    await tick();
    expect(requests.at(-1)?.words).toBe("RustX");
    expect(requests.at(-1)?.page).toBe(1);
  } finally {
    app.unmount();
    app.cleanup();
  }
});

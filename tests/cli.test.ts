import { expect, test } from "bun:test";

async function runCli(...args: string[]) {
  const process = Bun.spawn(
    [Bun.which("bun")!, new URL("../src/cli.ts", import.meta.url).pathname, ...args],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("package exposes the Bun CLI as klib", async () => {
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(manifest.bin.klib).toBe("src/cli.ts");
  const entry = await Bun.file(new URL("../src/cli.ts", import.meta.url)).text();
  expect(entry).toStartWith("#!/usr/bin/env bun\n");
  const result = await runCli("--help");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("klib Rust --campus both --json");
});

test("no arguments and help print CLI usage without requiring a TTY", async () => {
  for (const args of [[], ["--help"], ["-h"]]) {
    const result = await runCli(...args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kagawa Kosen Library Search");
    expect(result.stdout).not.toContain("--interactive");
    expect(result.stdout).not.toContain("\u001b[?1049");
  }
});

test("catalogs remain available as JSON in a non-TTY process", async () => {
  for (const name of ["countries", "languages", "locations"]) {
    const result = await runCli("--list", name);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const catalog = JSON.parse(result.stdout);
    expect(catalog.length).toBeGreaterThan(0);
    expect(typeof catalog[0].value).toBe("string");
    expect(typeof catalog[0].label).toBe("string");
  }
});

test("removed interactive mode and invalid searches fail without screen output", async () => {
  for (const [args, message] of [
    [["--interactive"], "interactive"],
    [["--json"], "Enter search criteria"],
    [["Rust", "--page", "0"], "Page must be a positive safe integer"],
    [["--list", "invalid"], "--list must be"],
    [["--mode", "simple", "--title", "Rust"], "Simple search does not support"],
  ] as const) {
    const result = await runCli(...args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
  }
});

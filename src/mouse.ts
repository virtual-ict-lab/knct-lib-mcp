// SGR mouse reports (DECSET 1006). Ink removes the leading ESC in useInput.
export const ENABLE_MOUSE = "\u001b[?1000h\u001b[?1006h";
export const DISABLE_MOUSE = "\u001b[?1000l\u001b[?1006l";
export interface MouseReport {
  x: number;
  y: number;
  wheel: -1 | 0 | 1;
  leftClick?: true;
}
export function parseMouseReport(input: string): MouseReport | undefined {
  const match = input.match(/^(?:\u001b)?\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return undefined;
  const button = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const direction = button & 3;
  const wheel =
    match[4] === "M" && button & 64 && direction < 2
      ? direction === 0
        ? -1
        : 1
      : 0;
  return {
    x,
    y,
    wheel,
    ...(match[4] === "M" && (button & ~28) === 0
      ? { leftClick: true as const }
      : {}),
  };
}

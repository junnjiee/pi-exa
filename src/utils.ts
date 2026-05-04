import { keyHint, Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";

const PREVIEW_LINES = 15;

export function renderTruncatedResult(
  result: { content: Array<{ type: string; text?: string }> },
  { expanded }: { expanded: boolean },
  theme: Theme,
): Component {
  const text = result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");

  if (expanded) return new Text(text, 0, 0);

  const lines = text.split("\n");
  if (lines.length <= PREVIEW_LINES) return new Text(text, 0, 0);

  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const hint = `... ${lines.length - PREVIEW_LINES} more lines, (${keyHint("app.tools.expand", "to expand")})`;
  return new Text(`${preview}\n${theme.fg("muted", hint)}`, 0, 0);
}

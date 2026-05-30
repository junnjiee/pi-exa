import { keyHint, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Text } from "@earendil-works/pi-tui";

export function abortPromise(signal?: AbortSignal): Promise<never> {
  if (!signal) return new Promise(() => {});
  if (signal.aborted) return Promise.reject(new Error("Request was cancelled"));

  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error("Request was cancelled")),
      { once: true },
    );
  });
}

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
  const lineWord = lines.length === 1 ? "line" : "lines";
  const hint = `(${lines.length} ${lineWord}, ${keyHint("app.tools.expand", "to expand")})`;
  return new Text(theme.fg("muted", hint), 0, 0);
}

export function renderCall(
  toolName: string,
): (args: unknown, theme: Theme) => Component {
  return (args, theme) => {
    const { query, urls } = (args ?? {}) as { query?: string; urls?: string[] };
    const display = query ? `"${query}"` : urls ? `\n${urls.join("\n")}` : "";
    return new Text(
      theme.fg("toolTitle", theme.bold(`${toolName} `)) +
        theme.fg("muted", display),
      0,
      0,
    );
  };
}

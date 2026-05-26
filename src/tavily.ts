import { tavily } from "@tavily/core";

type TavilyClient = ReturnType<typeof tavily>;

let tavilyClient: TavilyClient | undefined;

export function resetTavily() {
  tavilyClient = undefined;
}

// singleton for Tavily API interface
export function getTavily(apiKey: string | undefined) {
  if (!apiKey) {
    throw new Error("Missing Tavily API key");
  }

  if (!tavilyClient) {
    tavilyClient = tavily({ apiKey });
  }

  return tavilyClient;
}

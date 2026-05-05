import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { getExa } from "./exa";
import { closeExaMcp, getExaMcp, getExaMcpTools } from "./exa_mcp";
import { deepSearch, DeepSearchParams } from "./exa_deep_search";
import { abortPromise, renderTruncatedResult } from "./utils";

const EXA_PROVIDER = "exa";

export function getExaApiKey(): string | undefined {
  const authStorage = AuthStorage.create();
  const cred = authStorage.get(EXA_PROVIDER);
  if (cred?.type === "api_key" && cred.key) {
    return cred.key;
  }
  return process.env.EXA_API_KEY;
}

export default async function (pi: ExtensionAPI) {
  const authStorage = AuthStorage.create();
  const exaApiKey = getExaApiKey();

  pi.on("session_start", async () => {
    if (pi.getFlag("exa-advanced")) {
      return;
    }
    const activeTools = pi.getActiveTools();
    pi.setActiveTools(
      activeTools.filter((name) => name !== "web_search_advanced_exa"),
    );
  });

  pi.registerCommand("exa-login", {
    description: "Set your Exa API key",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(
          "Set the EXA_API_KEY env var or run exa-login in the UI",
          "info",
        );
        return;
      }
      const key = await ctx.ui.input("Exa API Key", "Enter your Exa API key");
      if (key) {
        authStorage.set(EXA_PROVIDER, { type: "api_key", key });
        ctx.ui.notify("Exa API key saved, /reload to take effect.", "info");
      }
    },
  });

  pi.registerCommand("exa-logout", {
    description: "Remove your Exa API key",
    handler: async (_args, ctx) => {
      authStorage.remove(EXA_PROVIDER);
      ctx.ui.notify("Exa API key removed. /reload to take effect", "info");
    },
  });

  pi.registerFlag("exa-advanced", {
    description:
      "Enables the advanced Exa web search tool for more granular controls (~1200 extra tokens)",
    type: "boolean",
    default: false,
  });

  pi.registerTool({
    name: "deep_search_exa",
    label: "deep_search_exa",
    description:
      "Perform deep web search using Exa. Supports deep-lite (fast), deep (balanced), and deep-reasoning (thorough) search modes.",
    promptSnippet: "Deep web search for thorough research queries",
    promptGuidelines: [
      "Use deep_search_exa for comprehensive multi-step research, complex queries that require breakdown and reasoning, or when the user instructs you to. This tool is not for simple web searches. Recommend user that you should run web_search_exa if API key doesn't exist",
    ],
    parameters: DeepSearchParams,

    renderResult: renderTruncatedResult,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Performing Exa Deep Search: ${params.query}`,
          },
        ],
        details: {},
      });

      // NOTE: abort will free up the deepSearch() call from blocking Pi,
      // but the request will still run to completion, just ignored
      try {
        const result = await Promise.race([
          deepSearch(getExa(exaApiKey), {
            query: params.query,
            numResults: params.numResults,
            type: params.type,
            category: params.category,
          }),
          abortPromise(signal),
        ]);

        const text = JSON.stringify(result, null, 2);
        return {
          content: [{ type: "text" as const, text }],
          details: {},
        };
      } catch (err) {
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Request was cancelled" }],
            details: {},
          };
        }
        throw err;
      }
    },
  });

  // load Exa MCP tools
  const tools = await getExaMcpTools(exaApiKey);

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "",
      parameters: Type.Unsafe(tool.inputSchema),

      renderResult: renderTruncatedResult,

      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        try {
          const mcpClient = await getExaMcp(exaApiKey);
          const result = await mcpClient.callTool(
            { name: tool.name, arguments: params as Record<string, unknown> },
            undefined,
            { signal },
          );

          const content = result.content as Array<{
            type: string;
            text?: string;
          }>;
          const text = content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          if (result.isError) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: text || "Tool call failed",
                },
              ],
              details: { isError: true },
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: text || "No results",
              },
            ],
            details: {},
          };
        } catch (err) {
          if (signal?.aborted) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Request was cancelled",
                },
              ],
              details: {},
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            details: { isError: true },
          };
        }
      },
    });
  }

  pi.on("session_shutdown", async () => {
    await closeExaMcp();
  });
}

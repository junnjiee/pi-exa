import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { getExa, resetExa } from "./exa";
import { closeExaMcp, getExaMcp, getExaMcpTools } from "./exa_mcp";
import { deepSearch, DeepSearchParams } from "./exa_deep_search";
import { abortPromise, renderTruncatedResult } from "./utils";
import { getPiExaConfig, setPiExaConfig } from "./config";

const EXA_PROVIDER = "exa";

export async function getExaApiKey(mcp = false) {
  if (mcp) {
    const config = await getPiExaConfig();
    if (!config.mcpUseApiKey) {
      return;
    }
  }
  const authStorage = AuthStorage.create();
  const cred = authStorage.get(EXA_PROVIDER);
  if (cred?.type === "api_key" && cred.key) {
    return cred.key;
  }
  return process.env.EXA_API_KEY;
}

export default async function (pi: ExtensionAPI) {
  const authStorage = AuthStorage.create();
  let mcpToolsLoaded = false;

  pi.on("session_start", async (_event, ctx) => {
    if (!mcpToolsLoaded) {
      ctx.ui.notify(
        "Exa MCP tools were not registered as the MCP server was unavailable. /reload to try again.",
        "warning",
      );
    }

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
        resetExa();
        await closeExaMcp();
        ctx.ui.notify("Exa API key saved.", "info");
      }
    },
  });

  pi.registerCommand("exa-logout", {
    description: "Remove your Exa API key",
    handler: async (_args, ctx) => {
      authStorage.remove(EXA_PROVIDER);
      resetExa();
      await closeExaMcp();
      ctx.ui.notify(
        process.env.EXA_API_KEY
          ? "Stored Exa API key removed. EXA_API_KEY env var is still set and will be used."
          : "Exa API key removed.",
        "info",
      );
    },
  });

  pi.registerCommand("exa-mcp-use-api-key", {
    description: "Enable/disable using your Exa API key for the Exa MCP server",
    handler: async (args, ctx) => {
      const value = args.trim().toLowerCase();

      if (!value) {
        const config = await getPiExaConfig();
        ctx.ui.notify(
          `API key for Exa MCP Server is currently ${config.mcpUseApiKey ? "enabled" : "disabled"}. Use /exa-mcp-use-api-key on|off to toggle.`,
          "info",
        );
        return;
      }

      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /exa-mcp-use-api-key on|off", "info");
        return;
      }

      const enabled = value === "on";
      await setPiExaConfig({ mcpUseApiKey: enabled });
      await closeExaMcp();

      ctx.ui.notify(
        `${enabled ? "Enabled" : "Disabled"} using API key for Exa MCP server`,
        "info",
      );
    },
  });

  pi.registerFlag("exa-advanced", {
    description:
      "Enables the advanced Exa web search tool for more granular controls (~1200 extra tokens)",
    type: "boolean",
    default: false,
  });

  pi.registerTool({
    name: "enable_web_search_advanced_exa",
    label: "enable_web_search_advanced_exa",
    description:
      "Enable the advanced Exa web search tool when you need filters to change your search mode, or get narrowed results",
    promptSnippet: "Enables Exa web search with all advanced filters",
    promptGuidelines: [
      "Use enable_web_search_advanced_exa if the user's query has multiple search constraints. This includes, but not limited to: category, domains/website inclusions or exclusions, published date ranges, location constraints. If you can use 2 or more filters, call enable_web_search_advanced_exa. Prefer advanced search when correctness depends on narrowing results with specific filters rather than finding general information.",
    ],
    parameters: Type.Object({
      reason: Type.String({
        description: "Why advanced Exa search is needed",
      }),
    }),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const advancedTool = pi
        .getAllTools()
        .find((tool) => tool.name === "web_search_advanced_exa");

      if (!advancedTool) {
        return {
          content: [
            {
              type: "text" as const,
              text: "web_search_advanced_exa is not available. Use web_search_exa instead.",
            },
          ],
          details: { available: false },
        };
      }

      const activeTools = pi.getActiveTools();
      if (!activeTools.includes("web_search_advanced_exa")) {
        pi.setActiveTools([...activeTools, "web_search_advanced_exa"]);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: "web_search_advanced_exa is now enabled. Continue your loop and call web_search_advanced_exa with the necessary filters.",
          },
        ],
        details: { available: true },
      };
    },
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
          deepSearch(getExa(await getExaApiKey()), {
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
  const tools = await getExaMcpTools(await getExaApiKey(true));
  mcpToolsLoaded = tools.length > 0;

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "",
      parameters: Type.Unsafe(tool.inputSchema),

      renderResult: renderTruncatedResult,

      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        try {
          const mcpClient = await getExaMcp(await getExaApiKey(true));
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

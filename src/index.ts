import {
  AuthStorage,
  type ExtensionAPI,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getExa, resetExa } from "./exa";
import { closeExaMcp, getExaMcp, getExaMcpTools } from "./exa_mcp";
import { deepSearch, DeepSearchParams } from "./exa_deep_search";
import { abortPromise, renderCall, renderTruncatedResult } from "./utils";
import { getPiExaConfig, setPiExaConfig } from "./config";
import { getTavily, resetTavily } from "./tavily";

const EXA_PROVIDER = "exa";
const TAVILY_PROVIDER = "tavily";

export default async function (pi: ExtensionAPI) {
  const authStorage = AuthStorage.create();
  let mcpToolsLoaded = false;

  async function getTavilyApiKey() {
    const cred = authStorage.get(TAVILY_PROVIDER);
    if (cred?.type === "api_key" && cred.key) {
      return cred.key;
    }
    return process.env.TAVILY_API_KEY;
  }

  async function updateTavilyToolAvailability() {
    const config = await getPiExaConfig();
    const shouldEnable =
      Boolean(await getTavilyApiKey()) && config.tavilyEnabled !== false;

    if (shouldEnable) {
      pi.setActiveTools([
        ...new Set([...pi.getActiveTools(), "web_search_tavily"]),
      ]);
      return;
    }

    pi.setActiveTools(
      pi.getActiveTools().filter((name) => name !== "web_search_tavily"),
    );
  }

  async function getExaApiKey(mcp = false) {
    if (mcp) {
      const config = await getPiExaConfig();
      if (!config.mcpUseApiKey) {
        return;
      }
    }
    const cred = authStorage.get(EXA_PROVIDER);
    if (cred?.type === "api_key" && cred.key) {
      return cred.key;
    }
    return process.env.EXA_API_KEY;
  }

  async function updateDeepSearchToolAvailability() {
    const config = await getPiExaConfig();
    const shouldEnable =
      Boolean(await getExaApiKey()) && config.deepSearchEnabled !== false;

    if (shouldEnable) {
      pi.setActiveTools([
        ...new Set([...pi.getActiveTools(), "deep_search_exa"]),
      ]);
      return;
    }

    pi.setActiveTools(
      pi.getActiveTools().filter((name) => name !== "deep_search_exa"),
    );
  }

  function deepSearchEnabled() {
    return pi.getActiveTools().includes("deep_search_exa");
  }

  async function updateDeepSearchStatus(ctx: { ui: ExtensionUIContext }) {
    ctx.ui.setStatus(
      "pi-exa",
      deepSearchEnabled()
        ? ctx.ui.theme.fg("muted", "exa deep search: on")
        : undefined,
    );
  }

  async function updateAdvancedSearchToolAvailability() {
    const config = await getPiExaConfig();

    if (config.advancedSearchEnabled === true) {
      const advancedTool = pi
        .getAllTools()
        .find((tool) => tool.name === "web_search_advanced_exa");

      if (advancedTool) {
        pi.setActiveTools([
          ...new Set([...pi.getActiveTools(), "web_search_advanced_exa"]),
        ]);
      }
      return;
    }

    pi.setActiveTools(
      pi.getActiveTools().filter((name) => name !== "web_search_advanced_exa"),
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    await updateDeepSearchToolAvailability();
    await updateAdvancedSearchToolAvailability();
    await updateTavilyToolAvailability();
    await updateDeepSearchStatus(ctx);
    if (!mcpToolsLoaded) {
      ctx.ui.notify(
        "Exa MCP tools were not registered as the MCP server was unavailable. /reload to try again.",
        "warning",
      );
    }
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
        await updateDeepSearchToolAvailability();
        await updateDeepSearchStatus(ctx);
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
      await updateDeepSearchToolAvailability();
      await updateDeepSearchStatus(ctx);
      ctx.ui.notify(
        process.env.EXA_API_KEY
          ? "Stored Exa API key removed. EXA_API_KEY env var is still set and will be used."
          : "Exa API key removed.",
        "info",
      );
    },
  });

  pi.registerCommand("exa-status", {
    description: "Show Exa extension status",
    handler: async (_args, ctx) => {
      const storedCred = authStorage.get(EXA_PROVIDER);
      const hasStoredKey =
        storedCred?.type === "api_key" && Boolean(storedCred.key);
      const hasEnvKey = Boolean(process.env.EXA_API_KEY);

      const config = await getPiExaConfig();

      const activeTools = pi.getActiveTools();
      const advancedSearchEnabled = activeTools.includes(
        "web_search_advanced_exa",
      );
      const deepSearchEnabled = activeTools.includes("deep_search_exa");

      ctx.ui.setStatus("pi-exa", "Checking Exa MCP...");
      const mcpHealthy = await (async () => {
        try {
          const client = await getExaMcp(await getExaApiKey(true));
          await client.listTools();
          return true;
        } catch {
          return false;
        } finally {
          await updateDeepSearchStatus(ctx);
        }
      })();

      const lines = [
        "pi-exa status:",
        "",
        "API Key Management",
        `- Stored API key: ${hasStoredKey ? "found" : "not found"}`,
        `- EXA_API_KEY env var: ${hasEnvKey ? "found" : "not found"}`,
        `- MCP uses API key: ${config.mcpUseApiKey ? "yes" : "no"}`,
        "",
        "Exa MCP",
        `- MCP tools registered: ${mcpToolsLoaded ? "yes" : "no"}`,
        `- MCP live check: ${mcpHealthy ? "success" : "failed"}`,
        "",
        "Tool Management",
        `- deep_search_exa: ${deepSearchEnabled ? "enabled" : "disabled"}`,
        `- web_search_advanced_exa: ${advancedSearchEnabled ? "enabled" : "disabled"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("exa-deep-search", {
    description: "Enable/disable the Exa deep search tool",
    handler: async (args, ctx) => {
      const value = args.trim().toLowerCase();

      if (!value) {
        const hasApiKey = Boolean(await getExaApiKey());
        const isEnabled = pi.getActiveTools().includes("deep_search_exa");
        ctx.ui.notify(
          hasApiKey
            ? `Exa deep search is currently ${isEnabled ? "enabled" : "disabled"}. Use /exa-deep-search on|off to toggle.`
            : "deep_search_exa requires an Exa API key. Set EXA_API_KEY or run /exa-login.",
          hasApiKey ? "info" : "warning",
        );
        return;
      }

      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /exa-deep-search on|off", "info");
        return;
      }

      const enabled = value === "on";
      const hasApiKey = Boolean(await getExaApiKey());
      await setPiExaConfig({ deepSearchEnabled: enabled });
      await updateDeepSearchToolAvailability();

      if (enabled && !hasApiKey) {
        ctx.ui.notify(
          "deep_search_exa requires an Exa API key. Set EXA_API_KEY or run /exa-login.",
          "warning",
        );
        return;
      }

      await updateDeepSearchStatus(ctx);
      ctx.ui.notify(
        `${enabled ? "Enabled" : "Disabled"} deep_search_exa. The agent will ${enabled ? "see" : "stop seeing"} it on the next turn.`,
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

  pi.registerCommand("exa-advanced-search", {
    description: "Enable/disable the advanced Exa web search tool",
    handler: async (args, ctx) => {
      const value = args.trim().toLowerCase();
      const activeTools = pi.getActiveTools();
      const isEnabled = activeTools.includes("web_search_advanced_exa");

      if (!value) {
        ctx.ui.notify(
          `Advanced Exa web search is currently ${isEnabled ? "enabled" : "disabled"}. Use /exa-advanced-search on|off to toggle.`,
          "info",
        );
        return;
      }

      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /exa-advanced-search on|off", "info");
        return;
      }

      const enabled = value === "on";
      if (enabled) {
        await setPiExaConfig({ advancedSearchEnabled: true });

        const advancedTool = pi
          .getAllTools()
          .find((tool) => tool.name === "web_search_advanced_exa");

        if (!advancedTool) {
          ctx.ui.notify(
            "web_search_advanced_exa is not available. /reload to try registering Exa MCP tools again.",
            "warning",
          );
          return;
        }

        pi.setActiveTools([
          ...new Set([...activeTools, "web_search_advanced_exa"]),
        ]);
        ctx.ui.notify(
          "Enabled web_search_advanced_exa. The agent will see it on the next turn.",
          "info",
        );
        return;
      }

      await setPiExaConfig({ advancedSearchEnabled: false });
      pi.setActiveTools(
        activeTools.filter((name) => name !== "web_search_advanced_exa"),
      );
      ctx.ui.notify(
        "Disabled web_search_advanced_exa. The agent will stop seeing it on the next turn.",
        "info",
      );
    },
  });

  pi.registerCommand("tavily-login", {
    description: "Set your Tavily API key",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(
          "Set the TAVILY_API_KEY env var or run tavily-login in the UI",
          "info",
        );
        return;
      }
      const key = await ctx.ui.input(
        "Tavily API Key",
        "Enter your Tavily API key",
      );
      if (key) {
        authStorage.set(TAVILY_PROVIDER, { type: "api_key", key });
        resetTavily();
        await updateTavilyToolAvailability();
        ctx.ui.notify("Tavily API key saved.", "info");
      }
    },
  });

  pi.registerCommand("tavily-logout", {
    description: "Remove your Tavily API key",
    handler: async (_args, ctx) => {
      authStorage.remove(TAVILY_PROVIDER);
      resetTavily();
      await updateTavilyToolAvailability();
      ctx.ui.notify(
        process.env.TAVILY_API_KEY
          ? "Stored Tavily API key removed. TAVILY_API_KEY env var is still set and will be used."
          : "Tavily API key removed.",
        "info",
      );
    },
  });

  pi.registerCommand("tavily-search", {
    description: "Enable/disable the Tavily web search tool",
    handler: async (args, ctx) => {
      const value = args.trim().toLowerCase();

      if (!value) {
        const hasApiKey = Boolean(await getTavilyApiKey());
        const isEnabled = pi.getActiveTools().includes("web_search_tavily");
        ctx.ui.notify(
          hasApiKey
            ? `Tavily web search is currently ${isEnabled ? "enabled" : "disabled"}. Use /tavily-search on|off to toggle.`
            : "web_search_tavily requires a Tavily API key. Set TAVILY_API_KEY or run /tavily-login.",
          hasApiKey ? "info" : "warning",
        );
        return;
      }

      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /tavily-search on|off", "info");
        return;
      }

      const enabled = value === "on";
      const hasApiKey = Boolean(await getTavilyApiKey());
      await setPiExaConfig({ tavilyEnabled: enabled });
      await updateTavilyToolAvailability();

      if (enabled && !hasApiKey) {
        ctx.ui.notify(
          "web_search_tavily requires a Tavily API key. Set TAVILY_API_KEY or run /tavily-login.",
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        `${enabled ? "Enabled" : "Disabled"} web_search_tavily. The agent will ${enabled ? "see" : "stop seeing"} it on the next turn.`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "web_search_tavily",
    label: "web_search_tavily",
    description:
      "Search the web using Tavily. Returns relevant web results with titles, URLs, and content snippets.",
    promptSnippet: "Web search powered by Tavily",
    promptGuidelines: [
      "Use web_search_tavily for general web searches when you need current information from the internet.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query (max 400 chars)" }),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (1-20, default 5)",
        }),
      ),
      searchDepth: Type.Optional(
        Type.Union([Type.Literal("basic"), Type.Literal("advanced")], {
          description:
            'Search depth: "basic" (fast) or "advanced" (thorough, 2 credits)',
        }),
      ),
      topic: Type.Optional(
        Type.Union(
          [
            Type.Literal("general"),
            Type.Literal("news"),
            Type.Literal("finance"),
          ],
          { description: 'Search topic category (default "general")' },
        ),
      ),
    }),

    renderResult: renderTruncatedResult,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      try {
        const client = getTavily(await getTavilyApiKey());
        const result = await Promise.race([
          client.search(params.query, {
            maxResults: params.maxResults ?? 5,
            searchDepth: params.searchDepth ?? "basic",
            topic: params.topic ?? "general",
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

  pi.registerTool({
    name: "deep_search_exa",
    label: "deep_search_exa",
    description:
      "Deep web search for complex questions that require in-depth research, reasoning or multi-source synthesis with citations. Best for nuanced or complex queries that cannot be resolved with a simple web search. You are strongly encouraged to create additional queries for query variations if the query has adjacent names, terminology or angles. Additional queries also help with better coverage. Main and additional queries are ran in parallel.",
    promptSnippet:
      "Agentic web search for complex research, parallel search, and multi-source synthesis",
    promptGuidelines: [
      "Use deep_search_exa for research that needs reasoning and multi-source synthesis, or for search queries that goes beyond a factual look up.",
    ],
    parameters: DeepSearchParams,

    renderCall: renderCall("deep_search_exa"),
    renderResult: renderTruncatedResult,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      // NOTE: abort will free up the deepSearch() call from blocking Pi,
      // but the request will still run to completion, just ignored
      try {
        const result = await Promise.race([
          deepSearch(getExa(await getExaApiKey()), {
            query: params.query,
            numResults: params.numResults,
            type: params.type,
            category: params.category,
            additionalQueries: params.additionalQueries,
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

  const mcpPromptMetadata: Record<
    string,
    { promptSnippet: string; promptGuidelines: string[] }
  > = {
    web_search_exa: {
      promptSnippet:
        "Search the web for current information and return clean result content",
      promptGuidelines: [
        "Use web_search_exa for simple web searches, current information, news, facts, people, companies, or answering questions about any topic.",
      ],
    },
    web_fetch_exa: {
      promptSnippet:
        "Fetch full clean markdown content from known webpage URLs",
      promptGuidelines: [
        "Use web_fetch_exa to read full clean markdown content from known webpage URLs.",
      ],
    },
  };

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "",
      ...mcpPromptMetadata[tool.name],
      parameters: Type.Unsafe(tool.inputSchema),

      renderCall: renderCall(tool.name),
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

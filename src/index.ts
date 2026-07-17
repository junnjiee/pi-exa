import * as piAgent from "@earendil-works/pi-coding-agent";
import {
  type ExtensionAPI,
  type ExtensionUIContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getExa, resetExa } from "./exa";
import { closeExaMcp, getExaMcp, getExaMcpTools } from "./exa_mcp";
import { deepSearch, DeepSearchParams } from "./exa_deep_search";
import { abortPromise, renderCall, renderTruncatedResult } from "./utils";
import { getPiExaConfig, setPiExaConfig } from "./config";

const EXA_PROVIDER = "exa";
const AUTH_PATH = join(getAgentDir(), "auth.json");

type StoredCredential = {
  type: string;
  key?: string;
};

const piAgentRuntime = piAgent as unknown as {
  readStoredCredential?: (
    provider: string,
    authPath?: string,
  ) => StoredCredential | undefined;
};

function readExaCredential() {
  return piAgentRuntime.readStoredCredential?.(EXA_PROVIDER, AUTH_PATH);
}

function writeExaCredential(key: string) {
  const data = existsSync(AUTH_PATH)
    ? JSON.parse(readFileSync(AUTH_PATH, "utf-8"))
    : {};
  data[EXA_PROVIDER] = { type: "api_key" as const, key };
  writeFileSync(AUTH_PATH, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
}

function removeExaCredential() {
  if (!existsSync(AUTH_PATH)) return;
  const data = JSON.parse(readFileSync(AUTH_PATH, "utf-8"));
  delete data[EXA_PROVIDER];
  writeFileSync(AUTH_PATH, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
}

export default async function (pi: ExtensionAPI) {
  if (!piAgentRuntime.readStoredCredential) {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.notify("pi-exa requires pi 0.80.8 or newer.", "error");
    });
    return;
  }

  let mcpToolsLoaded = false;
  const registeredExaToolNames: string[] = [];

  async function getExaApiKey(mcp = false) {
    if (mcp) {
      const config = await getPiExaConfig();
      if (!config.mcpUseApiKey) {
        return;
      }
    }
    const cred = readExaCredential();
    if (cred?.type === "api_key" && cred.key) {
      return cred.key;
    }
    return process.env.EXA_API_KEY;
  }

  async function syncToolAvailability() {
    const config = await getPiExaConfig();
    const enabled = config.enabled !== false;

    if (!enabled) {
      pi.setActiveTools(
        pi
          .getActiveTools()
          .filter((name) => !registeredExaToolNames.includes(name)),
      );
      return;
    }

    const hasApiKey = Boolean(await getExaApiKey());

    const activeTools = pi.getActiveTools();
    const next = new Set(activeTools);

    if (
      hasApiKey &&
      config.deepSearchEnabled !== false &&
      registeredExaToolNames.includes("deep_search_exa")
    ) {
      next.add("deep_search_exa");
    } else {
      next.delete("deep_search_exa");
    }

    if (
      config.advancedSearchEnabled === true &&
      registeredExaToolNames.includes("web_search_advanced_exa")
    ) {
      next.add("web_search_advanced_exa");
    } else {
      next.delete("web_search_advanced_exa");
    }

    for (const name of ["web_search_exa", "web_fetch_exa"]) {
      if (registeredExaToolNames.includes(name)) {
        next.add(name);
      } else {
        next.delete(name);
      }
    }

    pi.setActiveTools([...next]);
  }

  async function updateDeepSearchStatus(ctx: { ui: ExtensionUIContext }) {
    const activeTools = pi.getActiveTools();
    const deepSearchActive = activeTools.includes("deep_search_exa");
    const config = await getPiExaConfig();
    const enabled = config.enabled !== false;

    if (!enabled) {
      ctx.ui.setStatus(
        "pi-exa",
        ctx.ui.theme.fg("warning", "pi-exa: disabled"),
      );
      return;
    }

    ctx.ui.setStatus(
      "pi-exa",
      deepSearchActive
        ? ctx.ui.theme.fg("muted", "exa deep search: on")
        : undefined,
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    await syncToolAvailability();
    await updateDeepSearchStatus(ctx);
    if (!mcpToolsLoaded) {
      ctx.ui.notify(
        "Exa MCP tools were not registered as the MCP server was unavailable. /reload to try again.",
        "warning",
      );
    }
  });

  pi.registerCommand("exa-enable", {
    description: "Enable the pi-exa extension and its tools",
    handler: async (_args, ctx) => {
      const config = await getPiExaConfig();
      if (config.enabled !== false) {
        ctx.ui.notify("pi-exa is already enabled.", "info");
        return;
      }

      await setPiExaConfig({ enabled: true });
      await syncToolAvailability();
      await updateDeepSearchStatus(ctx);
      ctx.ui.notify(
        "pi-exa enabled. The agent will see Exa tools on the next turn.",
        "info",
      );
    },
  });

  pi.registerCommand("exa-disable", {
    description: "Disable the pi-exa extension and hide all its tools",
    handler: async (_args, ctx) => {
      const config = await getPiExaConfig();
      if (config.enabled === false) {
        ctx.ui.notify("pi-exa is already disabled.", "info");
        return;
      }

      await setPiExaConfig({ enabled: false });
      await syncToolAvailability();
      await updateDeepSearchStatus(ctx);
      ctx.ui.notify(
        "pi-exa disabled. All Exa tools are hidden from the agent.",
        "info",
      );
    },
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
        writeExaCredential(key);
        resetExa();
        await closeExaMcp();
        await syncToolAvailability();
        await updateDeepSearchStatus(ctx);
        ctx.ui.notify("Exa API key saved.", "info");
      }
    },
  });

  pi.registerCommand("exa-logout", {
    description: "Remove your Exa API key",
    handler: async (_args, ctx) => {
      removeExaCredential();
      resetExa();
      await closeExaMcp();
      await syncToolAvailability();
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
      const storedCred = readExaCredential();
      const hasStoredKey =
        storedCred?.type === "api_key" && Boolean(storedCred.key);
      const hasEnvKey = Boolean(process.env.EXA_API_KEY);

      const config = await getPiExaConfig();
      const enabled = config.enabled !== false;

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
        `Extension: ${enabled ? "enabled" : "disabled"}`,
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
      const config = await getPiExaConfig();
      if (config.enabled === false) {
        ctx.ui.notify("pi-exa is disabled. Run /exa-enable first.", "warning");
        return;
      }

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
      await syncToolAvailability();

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
      const config = await getPiExaConfig();
      if (config.enabled === false) {
        ctx.ui.notify("pi-exa is disabled. Run /exa-enable first.", "warning");
        return;
      }

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

        await syncToolAvailability();
        ctx.ui.notify(
          "Enabled web_search_advanced_exa. The agent will see it on the next turn.",
          "info",
        );
        return;
      }

      await setPiExaConfig({ advancedSearchEnabled: false });
      await syncToolAvailability();
      ctx.ui.notify(
        "Disabled web_search_advanced_exa. The agent will stop seeing it on the next turn.",
        "info",
      );
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
  registeredExaToolNames.push("deep_search_exa");

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
    registeredExaToolNames.push(tool.name);

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

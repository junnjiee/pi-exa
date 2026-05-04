import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import Exa from "exa-js";
import { connectToExaMcp } from "./exa_mcp_client";
import { deepSearch, DeepSearchParams } from "./exa_deep_search";
import { renderTruncatedResult } from "./utils";

export default async function (pi: ExtensionAPI) {
  pi.registerFlag("exa-advanced", {
    description:
      "Enables the advanced Exa web search tool for more granular controls (~1200 extra tokens)",
    type: "boolean",
    default: false,
  });

  const exa = new Exa(process.env.EXA_API_KEY!);
  const client = await connectToExaMcp();
  const { tools } = await client.listTools();

  pi.registerTool({
    name: "deep_search_exa",
    label: "deep_search_exa",
    description:
      "Perform deep web search using Exa. Supports deep-lite (fast), deep (balanced), and deep-reasoning (thorough) search modes.",
    promptSnippet: "Deep web search for thorough research queries",
    promptGuidelines: [
      "Use exa_deep_search for comprehensive, multi-step research with synthesized answers, complex queries that requires breakdown and reasoning, or research focused queries. This tool is not for simple web searches.",
    ],
    parameters: DeepSearchParams,

    renderResult: renderTruncatedResult,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Performing Exa Deep Search...`,
          },
        ],
        details: {},
      });

      const result = await deepSearch(exa, {
        query: params.query,
        numResults: params.numResults,
        type: params.type,
        category: params.category,
      });

      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Request was cancelled" }],
          details: {},
        };
      }

      const text = JSON.stringify(result, null, 2);
      return {
        content: [{ type: "text" as const, text }],
        details: {},
      };
    },
  });

  // load Exa search MCP tools
  for (const tool of tools) {
    if (
      tool.name === "web_search_advanced_exa" &&
      !pi.getFlag("exa-advanced")
    ) {
      continue;
    }

    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "",
      parameters: Type.Unsafe(tool.inputSchema),

      renderResult: renderTruncatedResult,

      async execute(toolCallId, params, signal, _onUpdate, _ctx) {
        try {
          const result = await client.callTool(
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
                  type: "text",
                  text: text || "Tool call failed",
                } satisfies TextContent,
              ],
              details: { isError: true },
            };
          }

          return {
            content: [
              {
                type: "text",
                text: text || "No results",
              } satisfies TextContent,
            ],
            details: {},
          };
        } catch (err) {
          if (signal?.aborted) {
            return {
              content: [
                {
                  type: "text",
                  text: "Request was cancelled",
                } satisfies TextContent,
              ],
              details: {},
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              } satisfies TextContent,
            ],
            details: { isError: true },
          };
        }
      },
    });
  }

  pi.on("session_shutdown", async () => {
    await client.close();
  });
}

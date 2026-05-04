import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { connectToExaMcp } from "./exa_mcp_client";

export default async function (pi: ExtensionAPI) {
  pi.registerFlag("exa-advanced", {
    description:
      "Enables the advanced Exa web search tool for more granular controls (~1200 extra tokens)",
    type: "boolean",
    default: false,
  });

  const client = await connectToExaMcp();
  const { tools } = await client.listTools();

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

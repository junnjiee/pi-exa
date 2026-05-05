import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { Tool } from "@modelcontextprotocol/sdk/types";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const EXA_MCP_CACHE_FILE = join(getAgentDir(), "exa-mcp-cache");
const EXA_MCP_SERVER = "https://mcp.exa.ai/mcp";

let exaMcpClientPromise: Promise<Client> | undefined;

// singleton MCP client instance
export function getExaMcp(apiKey?: string): Promise<Client> {
  if (!exaMcpClientPromise) {
    // return the async promise to ensure that concurrent callers can invoke
    // the same promise
    // this variable only stores the result of execution, as the async function
    // is ran immediately
    const clientPromise = (async () => {
      const exaMcpUrl = new URL(EXA_MCP_SERVER);
      exaMcpUrl.searchParams.set(
        "tools",
        "web_search_exa,web_search_advanced_exa,web_fetch_exa",
      );
      if (apiKey) {
        exaMcpUrl.searchParams.set("exaApiKey", apiKey);
      }

      const transport = new StreamableHTTPClientTransport(exaMcpUrl);

      const client = new Client(
        { name: "pi-exa", version: "0.1.0" },
        { capabilities: {} },
      );

      await client.connect(transport);
      return client;
    })();

    exaMcpClientPromise = clientPromise.catch((err) => {
      // check if the current singleton instance is the one with error
      // we do not want to clear non-error instances
      if (clientPromise === exaMcpClientPromise) {
        exaMcpClientPromise = undefined;
      }
      throw err;
    });
  }

  return exaMcpClientPromise;
}

export async function closeExaMcp() {
  if (!exaMcpClientPromise) {
    return;
  }
  const clientPromise = exaMcpClientPromise;
  exaMcpClientPromise = undefined;
  const client = await clientPromise;
  await client.close();
}

// NOTE: no error handling for when there's no cache data and MCP server is down
export async function getExaMcpTools(apiKey?: string): Promise<Tool[]> {
  try {
    await access(EXA_MCP_CACHE_FILE);
    const cachedTools = await readFile(EXA_MCP_CACHE_FILE, "utf8");
    return JSON.parse(cachedTools);
  } catch {
    const client = await getExaMcp(apiKey);
    const { tools } = await client.listTools();

    await mkdir(dirname(EXA_MCP_CACHE_FILE), { recursive: true });
    await writeFile(EXA_MCP_CACHE_FILE, JSON.stringify(tools, null, 2));
    return tools;
  }
}

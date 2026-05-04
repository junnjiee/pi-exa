import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

export async function connectToExaMcp(apiKey?: string): Promise<Client> {
  const exaMcpUrl = new URL("https://mcp.exa.ai/mcp");
  exaMcpUrl.searchParams.set(
    "tools",
    "web_search_exa,web_search_advanced_exa,web_fetch_exa",
  );
  if (apiKey) {
    exaMcpUrl.searchParams.set("exaApiKey", apiKey);
  }

  const transport = new StreamableHTTPClientTransport(exaMcpUrl);

  const client = new Client(
    { name: "pi-web-search", version: "0.1.0" },
    { capabilities: {} },
  );

  // TODO: error handling for connection
  await client.connect(transport);
  return client;
}

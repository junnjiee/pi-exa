# Pi Exa

Web search, fetch and deep research for your Pi Agent. Powered by [Exa](https://exa.ai)

**No API key needed** for web search and fetch. Works out of the box, just install and your agent starts using.

## Why Exa for your Agent

- Free - 1000 requests/month, via the [Exa MCP](https://github.com/exa-labs/exa-mcp-server) server
- Semantic search - understands intent, not just keyword searches
- LLM-friendly results - Exa returns clean snippets instead of dumping entire sites that nuke your context window
- Get what you want - Your agent can make sense of Exa's multiple search filters to get you narrowed results

## Install

```
pi install npm:pi-exa
```

**Optional**: An Exa API key for the deep research tool. To register your key:

```
/exa-login
```

## Docs

### Commands

| command                | description                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/exa-login`           | Writes your Exa API key to `.pi/agents/auth.json`                                                                              |
| `/exa-logout`          | Remove your API key from `.pi/agents/auth.json`                                                                                |
| `/exa-mcp-use-api-key` | Uses your API key when calling Exa MCP server. You will be billed. Only use when you reached your rate limit for free requests |

### Tools

Enabled by default:

| name                             | interface                                                 | description                                                                         |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `web_search_exa`                 | [Exa MCP](https://github.com/exa-labs/exa-mcp-server)     | Use for general web search                                                          |
| `web_fetch_exa`                  | [Exa MCP](https://github.com/exa-labs/exa-mcp-server)     | Get content of a specific webpage                                                   |
| `deep_search_exa`                | [Exa API](https://exa.ai/docs/reference/search-api-guide) | Use for multi-step research or when answer requires synthesis from multiple sources |
| `enable_web_search_advanced_exa` | None                                                      | Allows Pi agent to enable web_search_advanced_exa                                   |

Disabled by default:

| name                      | calls                                                 | description                                                                                   |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `web_search_advanced_exa` | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | `web_search_exa` but with all filter parameters available (~1200 tokens to load into context) |

### Flags

| name             | description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `--exa-advanced` | Enables the `web_search_advanced_exa` tool by default for this session |

## Bugs and suggestions

Open an issue!

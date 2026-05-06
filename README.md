# Pi Exa

Web search, fetching, and deep research for your Pi Agent. Powered by [Exa](https://exa.ai)

**No API key needed** for web search and fetch. Works out of the box, just install it and your agent starts using it.

## Why Exa for your Agent

- Free - 1000 requests/month for web search and fetch, via the [Exa MCP server](https://github.com/exa-labs/exa-mcp-server)
- Semantic search - understands intent, not just keyword searches
- LLM-friendly results - Exa returns clean snippets instead of dumping entire sites that nuke your context window
- Get what you want - Your agent can make sense of Exa's multiple search filters to get you narrowed results

## Install

```
pi install npm:pi-exa
```

**Optional**: Exa API key for the deep search tool. To register your key:

```
pi /exa-login
```

## Features

### Exa MCP

- Use web search and content fetching with no API key required
- Toggle paid Exa MCP usage with `/exa-mcp-use-api-key on|off`
- Lazy-loaded Exa MCP server that connects on first tool call
- Cached MCP tool schemas so Pi can register tools during startup even before connecting

### Exa Advanced Web Search

- Let your agent use every Exa search filter
- Disabled by default to save context (~1200 tokens)
- Enable for the session with `/exa-advanced-search on` or at startup with `--exa-advanced`

### Deep Search

- Give your agent access to Deep Search via the Exa API, with `deep-lite`, `deep`, and `deep-reasoning` modes

## Docs

### Commands

| command                | description                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/exa-login`           | Writes your Exa API key to `.pi/agents/auth.json`                                                                                                                              |
| `/exa-logout`          | Removes your API key from `.pi/agents/auth.json`                                                                                                                               |
| `/exa-status`          | Shows the Pi Exa extension status                                                                                                                                              |
| `/exa-advanced-search` | Enables/disables the advanced Exa web search tool with `/exa-advanced-search on/off`                                                                                           |
| `/exa-mcp-use-api-key` | Enables/disables use of your API key for Exa MCP server with `/exa-mcp-use-api-key on/off`. You will be billed. Only use when you've reached your rate limit for free requests |

### Tools

Enabled by default:

| name              | interface                                                 | description                                                                         |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `web_search_exa`  | [Exa MCP](https://github.com/exa-labs/exa-mcp-server)     | Use for general web search                                                          |
| `web_fetch_exa`   | [Exa MCP](https://github.com/exa-labs/exa-mcp-server)     | Get content of a specific webpage                                                   |
| `deep_search_exa` | [Exa API](https://exa.ai/docs/reference/search-api-guide) | Use for multi-step research or when answer requires synthesis from multiple sources |

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

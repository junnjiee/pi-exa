# Pi Exa

<video src="./assets/demo.mp4" controls width="100%"></video>

[Watch the demo video](./assets/demo.mp4)

Web search, fetching, and deep research for your Pi Agent. Powered by [Exa](https://exa.ai).

**No API key needed** for web search and fetch. Works out of the box, install the extension and your agent can start using Exa search and fetch.

## Why Exa for your Agent

- Free - 1000 requests/month for web search and fetch, via the [Exa MCP server](https://github.com/exa-labs/exa-mcp-server)
- Semantic search - understands intent, not just keyword searches
- LLM-friendly results - Exa returns clean snippets instead of dumping entire sites that nuke your context window (through [Exa Highlights](https://exa.ai/blog/highlights-for-agents))
- Get what you want - Your agent can make sense of Exa's search options and filters to get you narrowed results

## Install

```
pi install npm:pi-exa
```

**Optional**: Exa API key for the deep search tool. To register your key:

```
pi /exa-login
```

## Features

### MCP

- Use web search and content fetching with **no API key required**
- Lazy-loaded Exa MCP server that only connects on first tool call
- Cached MCP tool schemas, Pi registers MCP tools during startup without connecting to the MCP server
- Toggle paid Exa MCP usage with `/exa-mcp-use-api-key on|off`

### Advanced Web Search

- Let your agent use every Exa search filter
- Disabled by default to save context (~1200 tokens)
- Enable or disable with `/exa-advanced-search on|off`

### Deep Search

- Give your agent access to Deep Search via the Exa API, with `deep-lite`, `deep`, and `deep-reasoning` modes
- Requires an Exa API key via `/exa-login` or `EXA_API_KEY` env var
- Enable or disable with `/exa-deep-search on|off`

## Docs

### Commands

| command                        | description                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/exa-login`                   | Writes your Exa API key to `.pi/agents/auth.json`                                                                                  |
| `/exa-logout`                  | Removes your API key from `.pi/agents/auth.json`                                                                                   |
| `/exa-status`                  | Shows the Pi Exa extension status                                                                                                  |
| `/exa-advanced-search on\|off` | Toggles the advanced Exa web search tool                                                                                           |
| `/exa-deep-search on\|off`     | Toggles the Exa deep search tool. Requires an Exa API key                                                                          |
| `/exa-mcp-use-api-key on\|off` | Toggles use of your API key for Exa MCP server. You will be billed. Only use when you've reached your rate limit for free requests |

### Tools

Always enabled:

| name             | interface                                             | description                       |
| ---------------- | ----------------------------------------------------- | --------------------------------- |
| `web_search_exa` | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | General web search                |
| `web_fetch_exa`  | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | Get content of a specific webpage |

Toggle to enable/disable. Preferences persist across sessions:

| name                      | interface                                                 | description                                                                                                                              |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `web_search_advanced_exa` | [Exa MCP](https://github.com/exa-labs/exa-mcp-server)     | `web_search_exa` but with all filter parameters available (~1200 tokens to load into context)                                            |
| `deep_search_exa`         | [Exa API](https://exa.ai/docs/reference/search-api-guide) | For multi-step research or when answer requires synthesis from multiple sources. Disabled automatically when no Exa API key is available |

## Bugs and suggestions

Open an issue!

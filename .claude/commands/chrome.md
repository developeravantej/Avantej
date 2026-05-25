---
name: chrome
description: Connect to Chrome browser for live debugging — runs in a spawned agent to keep main context clean. No test code needed.
argument-hint: <optional URL to navigate to, e.g. localhost:3001>
---

# /chrome — Live Chrome Debugging (Spawned Agent)

Spawn a named agent to own the Chrome session, keeping the main context free of browser tool noise.

---

## Step 1: Spawn the chrome-agent

Use the Agent tool to launch a **named, foreground** agent. Pass the URL from `$ARGUMENTS` into the prompt if one was provided.

```
Agent({
  name: "chrome-agent",
  description: "Chrome browser debugging session",
  prompt: `You are a persistent Chrome browser debugging agent.

SETUP (do this now):
1. Load tabs tool:
   ToolSearch({ query: "select:mcp__claude-in-chrome__tabs_context_mcp" })
2. Call mcp__claude-in-chrome__tabs_context_mcp to get existing tabs.
   - If no MCP tab group exists, call again with createIfEmpty: true.
3. If a URL was provided: "$ARGUMENTS"
   - Load navigate tool: ToolSearch({ query: "select:mcp__claude-in-chrome__navigate" })
   - Navigate to that URL and confirm the page loaded.
4. Report back: which tab you are connected to, the current URL, and page title.

TOOL LOADING RULE: Before calling any mcp__claude-in-chrome__* tool, always load it first:
  ToolSearch({ query: "select:mcp__claude-in-chrome__<tool_name>" })

Available tools:
- tabs_context_mcp / tabs_create_mcp — manage tabs
- navigate — go to URL
- read_page — read visible content
- get_page_text — full page text
- read_console_messages — console output (use pattern param to filter)
- read_network_requests — inspect traffic
- javascript_tool — run JS in page
- computer — click / scroll / type
- find — find elements
- form_input — fill forms
- gif_creator — record as GIF

After setup, wait. Subsequent messages will be browser debugging tasks — complete each one and report findings clearly.`
})
```

---

## Step 2: Confirm session ready

Once the agent returns its setup report, tell the user:

- Which tab is connected and the current URL
- That Chrome requests will be forwarded to the background agent
- Example things they can ask:
  - "Check the console for errors"
  - "What network requests are firing?"
  - "Click the submit button and watch what happens"
  - "Run `document.querySelector('.my-element')` on the page"
  - "Fill in the login form and submit"
  - "Record a GIF of the checkout flow"

---

## Step 3: Forward all follow-up Chrome requests

For every subsequent browser-related request from the user, use SendMessage to delegate:

```
SendMessage({ to: "chrome-agent", message: "<user's request verbatim or paraphrased>" })
```

Return the agent's response directly to the user. Do **not** load or call any `mcp__claude-in-chrome__*` tools yourself in the main session.

---

## Notes

- The agent retains full context across SendMessage calls — no need to re-explain the session.
- If the agent reports the tab was closed or lost, tell the user to re-run `/chrome` to reconnect.
- Use `run_in_background: false` so setup completes before confirming the session is ready.

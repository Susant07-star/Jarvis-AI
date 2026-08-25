# J.A.R.V.I.S. Agent Prompts — Modular Architecture

## Overview
This folder contains **modular, token-optimized system prompts** for J.A.R.V.I.S.'s multi-agent architecture.

Instead of sending one giant monolithic prompt on every request, we split instructions into **small, focused modules** and assemble only the relevant ones per agent/request type.

## Architecture

```
agent_prompts/
├── modules/                    ← Reusable prompt building blocks
│   ├── personality.json        ← Tone, warmth, style (shared by all agents)
│   ├── tools_browser.json      ← Browser tool definitions & usage rules
│   ├── behavior_rules.json     ← When to use tools vs. respond naturally
│   └── dom_interaction.json    ← DOM analysis, clicking, typing rules
│
├── agents/                     ← Agent-specific assembled prompts
│   ├── voice_agent_prompt.json ← Voice agent: personality + behavior
│   ├── browser_agent_prompt.json ← Browser agent: tools + DOM + behavior
│   └── vision_agent_prompt.json  ← Vision agent: coordinate + click (future)
│
├── prompt_builder.ts           ← TypeScript loader that assembles prompts
└── README.md                   ← This file
```

## How It Works

1. **Modules** are atomic JSON files containing one focused instruction set.
2. **Agent prompts** reference which modules to include.
3. **prompt_builder.ts** reads the agent config, loads only the needed modules, and concatenates them into a single system prompt string.
4. **websocket.ts / api.ts** import the builder and call `buildPrompt("browser")` instead of hardcoding a massive template literal.

## Token Savings

| Approach | Tokens/Request | Notes |
|---|---|---|
| Old monolithic prompt | ~400 | All rules sent every time |
| Modular (voice only) | ~80 | Personality + behavior only |
| Modular (browser) | ~250 | Personality + tools + DOM |
| Modular (vision) | ~150 | Personality + coordinates |

## How to Add a New Agent

1. Create a new module in `modules/` if the agent needs unique instructions.
2. Create `agents/new_agent_prompt.json` referencing the needed modules.
3. Update `prompt_builder.ts` to support the new agent name.
4. Call `buildPrompt("new_agent")` from the appropriate route.

## How to Update Rules

- Edit the relevant **module** JSON file. The change propagates everywhere that module is used.
- Never duplicate instructions across modules — keep it DRY.

## Database Migration (Future)

All JSON files in this folder can be migrated to a database for:
- Dynamic prompt editing via admin UI
- A/B testing different prompts
- Per-user prompt customization

The `prompt_builder.ts` loader is the **only file that needs to change** for database migration.

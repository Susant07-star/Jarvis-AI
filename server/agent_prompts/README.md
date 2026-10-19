# Root Server Prompt Modules

This directory holds JSON prompt modules and agent profiles used by the root Node service. `prompt_builder.ts` loads an `agents/<name>_agent_prompt.json` file, concatenates its referenced modules, and caches the result in memory. The `personality` module can be replaced with `CUSTOM_SYSTEM_PROMPT`.

The profiles currently include voice, browser, and vision variants. They are prompt configurations used by explicit TypeScript routes; they are not separate model processes or a multi-agent orchestration framework. The exact route may also add runtime context such as time, memory, or a task plan.

## Files

- `agents/` maps a profile name to module IDs and optional prompt settings.
- `modules/` contains reusable identity, behavior, browser, voice, and integration instructions.
- `prompt_builder.ts` implements prompt loading, caching, and time-context assembly.

## Change prompts safely

1. Find the route that calls `buildPrompt()` and confirm the selected profile and surrounding runtime context.
2. Keep descriptions consistent with tools actually registered by that route. Prompt text does not create a tool or enforce authorization.
3. Treat all model-proposed actions as untrusted. Validate and authorize them in the backend dispatcher/executor.
4. Do not claim a device or service is online in a static prompt. Use runtime health state or phrase the capability conditionally.
5. Keep sensitive credentials and personal data out of prompt files.

Prompt caching is process-local. Restart the Node service after changes unless the caller explicitly clears the cache.

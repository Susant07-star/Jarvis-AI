# J.A.R.V.I.S. Documentation

Use these documents as the current repository guide. They describe source and configuration, not the live health of a deployment.

## Current reference docs

- [Architecture](ARCHITECTURE.md) — runtime boundaries, request flow, models, tools, state, and known architectural limits.
- [System Status](SYSTEM_STATUS.md) — source-grounded capability inventory, configuration requirements, and known limitations.
- [Developer Guide](DEVELOPER_GUIDE.md) — setup, environment variables, package map, optional services, and verification commands.
- [Project Instructions](PROJECT_INSTRUCTIONS.md) — implementation and documentation rules.
- [Debugging Guide](DEBUGGING.md) — route-oriented troubleshooting.
- [Roadmap](ROADMAP.md) — proposed priorities based on the current source review.
- [Feature/Runtime Map](feature_comparison.md) — comparison of the separate packages and their integration boundaries.
- [Engineering Notes](developer_knowledge_base.md) — current MCP, tool, Electron, prompt, and UI development guidance.
- [Product and Distribution Notes](product_distribution_roadmap.md) — packaging and release planning, not current product capability.
- [Changelog](CHANGELOG.md) — historical project notes; older entries may describe the state at the time and are not deployment verification.
- [Bootstrap Prompt](BOOTSTRAP_PROMPT.md) — short orientation for a new contributor or coding agent.

## Package-specific docs

- [Electron desktop application](../jarvis-desktop/README.md)
- [Python browser service](../python_agent/README.md)
- [Voice matching service](../voice_engine_microservice/README.md)
- [Root prompt modules](../server/agent_prompts/README.md)

## Planning and implementation notes

Files such as `implementation_plan.md`, `implementation_plan_for_voice.md`, `jarvis_analysis_and_roadmap.md`, `iris_capability_analysis.md`, and older implementation notes record ideas or work at particular points in time. Treat them as historical/planning material; confirm current behavior in source and the reference docs above.

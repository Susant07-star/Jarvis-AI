---
paths: ['src/renderer/**/*.tsx', 'src/renderer/**/*.ts']
---

# UI / UX Standards (The "J.A.R.V.I.S. Neural OS" Aesthetic)

You are modifying the visual layer of **J.A.R.V.I.S.** — a premium, commercial-grade AI desktop application. Act as a high-end Silicon Valley UX Engineer. The interface must feel like a futuristic AI operating system, not a standard web app.

## Color Palette

- **Deep Backgrounds:** `#030303` or `#050505` (Never absolute black unless for deep shadows).
- **Primary Accents:** Emerald / Neon Green (`emerald-400`, `emerald-500`, `#10b981`) — The signature J.A.R.V.I.S. color.
- **Secondary Accents:** Cyan (`cyan-400`), Purple (`purple-500`).
- **Error States:** Deep Red (`red-500`, `red-900/20`).

## Component Rules

- **Glassmorphism:** Standard panels should be `bg-black/40 backdrop-blur-xl border border-white/5 shadow-2xl`.
- **Typography:** Use `font-sans` for main UI, and `font-mono tracking-widest uppercase text-[10px]` for system telemetry, labels, and logs.
- **Glows & Lasers:** Use absolute positioned `div` elements with gradients to create ambient blooms behind active components.
- **Micro-Animations:** Nothing should snap. Every state change uses `framer-motion` spring or fade transitions.
- **Naming:** All on-screen labels and system text should say **J.A.R.V.I.S.**. e.g., "J.A.R.V.I.S. ONLINE", "NEURAL UPLINK SECURE", "JARVIS INITIALIZING".

## 3D Engine (Three.js / R3F) Rules

If touching `Sphere.tsx` or related WebGL files:

- **No Memory Leaks:** NEVER instantiate variables (like `new THREE.Color()`) inside a `useFrame` loop. Pre-instantiate using `useMemo` and mutate them.
- **Low-End Scaling:** Always cap pixel ratios to prevent melting low-end GPUs: `<Canvas dpr={[1, 1.5]} gl={{ powerPreference: "high-performance" }}>`.
- Disable depth writing for overlapping transparent particles (`depthWrite={false}`).
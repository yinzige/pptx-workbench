# PPTX Workbench

Codex-native local workbench for producing editable, animated `.pptx` decks from a structured `deck-spec`.

This project is not a PowerPoint clone. It is a production cockpit for a Codex-led PPT workflow: Codex edits the source spec, the browser provides preview, annotation, QA, export, and event bridging, and the final deliverable is still real PPTX.

## Why It Exists

The goal is to give Codex a reliable "hands-on" workspace for PowerPoint production:

- plan and edit decks through `specs/example.deck-spec.yaml`
- preview slides from the same source used for PPTX export
- collect object-level and region-level annotations
- generate two PPTX variants for compatibility testing
- validate click logic and playback behavior
- bridge Workbench events back into the active Codex thread

The workflow keeps the editable information layer in PPTX, while using a web cockpit for fast review and Codex-assisted iteration.

## Current Version

`v1.6.11.2`

Highlights:

- Deck-spec driven slide model with layers, elements, scene beats, and reveal logic.
- Same-source browser preview, thumbnails, and playback QA.
- Object and free-region annotation UI with `Ask Codex` interaction.
- Deterministic local edits for safe small changes such as punctuation removal, text replacement, object deletion, hiding, moving, and resizing.
- Codex Bridge with current-thread registration, one-time URL tokens, event queue, and JSON-RPC app-server probing.
- Real Codex app-server probing over `stdio` using `thread/resume` and `turn/start`.
- Real business-loop dispatch: uploads and open-ended annotations automatically try to enter the active Codex thread through the shared bridge dispatcher.
- Bridge receipts in `outputs/codex-bridge-receipts.jsonl` for annotation, upload, export, playback, and dispatch status.
- Dual PPTX output:
  - `PowerPoint-rich.pptx`
  - `WPS-compatible.pptx`
- Locked local export flow for delivery folders.

## Architecture

```text
deck-spec YAML
  -> browser preview / annotation / playback QA
  -> PPTX generator
  -> PowerPoint-rich.pptx
  -> WPS-compatible.pptx

Workbench event
  -> events/codex-events.jsonl
  -> Codex Bridge
  -> Codex app-server JSON-RPC
  -> active Codex thread
```

Key source files:

- `specs/example.deck-spec.yaml` - sample deck source of truth
- `src/lib/renderDeck.ts` - PPTX rendering
- `src/client/main.ts` - browser workbench
- `src/lib/codexBridge.ts` - bridge state, queue, token binding
- `src/lib/codexAppServerClient.ts` - Codex app-server JSON-RPC probing/sending
- `scripts/codex-thread-bridge.ts` - sends queued Workbench events to Codex
- `scripts/probe-codex-app-server.ts` - writes an app-server probe report

## Quick Start

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Generate PPTX files:

```bash
npm run generate
```

Run full verification:

```bash
npm run verify
```

## Codex Bridge

The bridge is intentionally based on the current confirmed Codex thread. It does not use a fixed project-thread binding and does not guess historical threads.

Supported binding paths:

1. Builder or workflow startup registers the current thread.
2. Current Codex session runs:

```bash
npm run bridge:register-current
```

3. Current Codex session creates a one-time URL token:

```bash
npm run bridge:create-token
```

Probe the local Codex app-server:

```bash
npm run bridge:probe-app-server
```

Send queued Workbench events:

```bash
npm run codex-bridge
```

In v1.6.11.2 the browser server also uses the same dispatch path:

- upload events are recorded and immediately dispatched when the real bridge is available
- deterministic annotations are applied locally and marked `applied` only after a real deck-spec diff
- open-ended annotations stay out of fake local edits and are dispatched to the active Codex thread
- dispatch receipts are written to `outputs/codex-bridge-receipts.jsonl`

Bridge state and event files are local runtime artifacts and are intentionally ignored by git:

- `.codex-bridge/`
- `.codex-bridge/current-thread.json`
- `events/`
- `outputs/`

## Scripts

```bash
npm run dev                    # start local workbench
npm run generate               # generate PPTX outputs
npm run verify                 # typecheck, build, generate, verify outputs
npm run bridge:register-current
npm run bridge:create-token
npm run bridge:probe-app-server
npm run codex-bridge
```

## Output Strategy

The generator creates two PPTX variants:

- **PowerPoint-rich**: richer native animation/timing path for PowerPoint and Keynote-style testing.
- **WPS-compatible**: compatibility-oriented fallback with state-page strategy and simpler transitions.

Browser playback mode is a QA simulator driven by deck-spec scene beats. It does not replace real PowerPoint / WPS / Keynote playback verification.

## What This Is Not

- Not a SaaS app.
- Not a full PowerPoint clone.
- Not a video renderer.
- Not a replacement for final real PPTX playback testing.
- Not a fixed-thread automation bridge.

## Status

This is an active experimental workflow project. The v1.6 line focuses on Workbench, annotation, playback QA, export, and Codex Bridge. The next planned major work is template/page-type systems and richer deck production patterns.

## License

MIT

---
type: belief
id: frag-dock-stackpanel-fill
provenance: session 2026-07-23 (Lars + Grok) — todo_tui chrome+list markup tree
ts: 2026-07-23
tags: [toolchain, vaxis, layout, dock, stackpanel]
---

# StackPanel inside Dock is a nested layout, not a component name

Dock's fill slot used to treat every inner tag as a child *component*. Nested
`<StackPanel dock="fill">` then looked up `StackPanel_event` and failed loud —
correct failure, wrong model. StackPanel (and later nested Dock) is a
**layout container**: Dock carves the fill window, then StackPanel owns y
inside it.

Two fill shapes:

1. **Static kids** — flatten into the fill (`sub` + child invoke), same thesis
   as top-level StackPanel.
2. **Empty** — live fill: init a `stack` cursor over the fill window and
   **return** that `Stack` from the component so draw-time `sweep` →
   `stack-row` can push rows. Chrome + list stay one markup tree; live
   children stay a draw-time concern.

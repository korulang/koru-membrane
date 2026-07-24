---
type: belief
id: frag-tor-agentive-surface
provenance: session 2026-07-24 (Lars + Claude + Grok) — the `event` → `tor` rename, language design
ts: 2026-07-24
tags: [koru, language-design, naming, agentive, continuation-branches, pie-etymology]
---

The `event` keyword misleads: it suggests reactive/async listeners, a frame
borrowed from event-driven programming that nothing in the construct actually
carries. What the construct *does* declare is the **agentive surface** of a
named operation — its typed input (the patient, what gets done-to) plus its
named continuation branches (what the doer can hand back as control-flow
possibilities). That second half is the load-bearing half no other language
(known) puts in the signature: the caller's *next step* is typed by the
construct itself. Control flow is pushed into the type system via the
branches living in the declaration, not in the caller's brain.

The rename target is **`tor`**, grounded in the Proto-Indo-European agentive
suffix *-tṛ* / *-tor-. The Sanskrit primary agentive suffix -tṛ (stem -tar-)
forms agent nouns: **kartṛ** "doer/agent" (root √kṛ, to do/make), gantṛ
"goer", dātṛ "giver", mantṛ "thinker." Latin inherits the same formation as
-tor (cognate, confirmed across Indo-European morphology), and it is
productively visible in English/Latin agent nouns everyone already knows:

  **acTOR** — the one who acts
  **creaTOR** — the one who creates
  **moniTOR** — the one who watches over
  **menTOR** — the one who advises/guides
  **dicTOR** — the one who speaks
  **operaTOR** — the one who operates

So `tor` is not an invented coinage; it is the PIE agentive surface worn
flat as a keyword. A `tor greet { name: []const u8 }` declares *who does*
and *what doing looks like from outside* — the kartṛ-role made into the type
system's grammar — and the `proc greet { ... }` is the going-forward
(procedere) that actually does it. The pairing sharpens to noun/verb at the
language's spine: agentive surface + procedural body.

The etymology also names the input cleanly: *kartṛ* (doer) and *karman*
(action/the-done-to) are complementary grammatical case roles in classical
Indian grammar, sharing the root √kṛ. The `tor` declares the doer; the
`{ name: []const u8 }` input declares the karma — what gets done-to. Patient
and agent, separated at the language's surface the way PIE grammar separates
them.

Collision-verified: `tor` does not appear as a standalone identifier anywhere
in the `.kz` corpus or `.zig` sources (case-sensitive and case-insensitive,
zero hits). Safe to take as a keyword.

Open: the mechanical rename scope (keyword in the lexer/parser, every `event`
decl in stdlib + tests, error messages, error code labels like
KORU020 "Duplicate branch in event"); the question of whether `event_decl` /
`EventDecl` / `<name>_event` internal names also rename or keep their current
spelling as an implementation detail; the user-facing prose on korulang.org.
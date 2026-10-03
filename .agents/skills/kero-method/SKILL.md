---
name: kero-method
description: The Kero method for agents. Use when starting a product from zero, designing, redesigning or polishing any interface or visual piece with a human who directs the work, when orchestrating agents on it, and before saying a design is done. Decides which other Kero skill to load at each step.
---

# Kero method

A person directs, agents build, and nothing reaches the person until it has been measured. The person's eye is the last check, never the first.

## Roles

- **The person brings the direction.** Concept, references and taste are theirs. When a design task arrives without them, ask for the idea and the references and wait. Do not offer a menu of aesthetics to pick from; it makes them choose between ideas that are not theirs.
- **When nobody can answer**, as in an unattended run, a redesign goes on from what the code says: skip step 1, write the project skill from the code, and say in the report that no references were given. A project from zero or from a reference stops and waits; there is nothing to build on.
- **The agent brings everything that can be checked.** Structure, states, code, measurement and the record of what was learned.
- **Survey before asking.** What the code already says (tokens, components, routes, existing rules) is never a question.

## Partner skills

The loop names other skills: `anydesign`, `badesign-skill`, Emil Kowalski's skills, `typebien` and SAGA. They are optional. If one is not installed, say so once, point to its install command (`npx skills add uxKero/anydesign`, `uxKero/badesign-skill`, `emilkowalski/skills`, `uxKero/typebien`, `uxKero/optimize-search-answers-agents`) and continue with the principles in this skill. Never stop the work waiting for one.

## Three entries

Every entry starts the same way: decide in one sentence whether one agent does the work alone. Load `kero-orchestrate` only when the answer is to split it.

- **From zero.** No product yet. Load `kero-research` to find what exists, why it fails and the thesis; then `kero-scope` for the list of what the product does. Only then come the direction, the references and the name (`kero-scope` holds the naming rules), and the loop below.
- **Redesign.** The product exists. Load `kero-system` and write the project skill from the code first: the tokens, components and routes already there, and where they contradict each other. Then take the references into the loop at step 1; at step 2 the same skill is updated with what the references change, not written again.
- **From a reference.** No product to keep, only a screenshot, a site or a Figma file to build from. Enter the loop at step 1; `anydesign` carries most of the work, and its design.md is checked against the images before anything is built.

## The loop

1. **Reference to system.** Turn each reference into a written system with the `anydesign` skill: tokens, components and reconstruction notes. Then look at the screenshots themselves. A summary loses what the images show: where a frame starts, what never carries a background, which arrows separate and which decorate.
2. **System to project skill.** Load `kero-system` and turn the system into a skill that lives in the project and loads itself. A design document that someone has to remember to open governs nothing.
3. **Craft.** Load `badesign-skill` for judgment on composition, type, color, states and motion. The project skill wins over it where they disagree.
   - **Motion and interaction** go through Emil Kowalski's skills: `emil-design-eng` while building, `animate` for a new animation, `review-animations` before delivering anything that moves.
   - **Phones** go through `mobile-native`: hover that sticks, tap flashes, viewport height, inputs that zoom, safe areas.
   - **Libraries** go through `pick-ui-library` before hand rolling a toast, a dialog or a drawer.
4. **Words.** Landing copy goes through `typebien`. What has to be true and findable about the product goes through SAGA (`optimize-search-answers-agents`) first.
5. **Build.** Delegate in pieces small enough to verify. Every brief to a sub agent carries the project skill, the exact scope, and what must stay untouched.
6. **Measure.** Load `kero-audit` and run it on every screen that changed. Fix what it reports before anyone looks. The taste below is measured there where it can be: contrast of text, controls and states, text size, nested radii, spacing scale and line length.
7. **Show.** Send the screenshot or the file. Never describe an image the person cannot see.
8. **Judge blind** when choosing between two approaches, two models or two versions of a skill. Load `kero-blind`.
9. **Record.** Every correction becomes a rule in the project skill, written as a principle with its reason.

## Orchestrating

Before splitting any work across agents, load `kero-orchestrate`. When [Orca](https://onorca.dev) is running, parallel work goes there, each agent in its own worktree. It decides whether delegating pays, writes the brief, isolates the work and reviews what comes back. One agent doing the work well is the default.

## Measuring

- Before trusting a check, look at what it ran against. A 200 from a local server proves nothing about production.
- A count of faults is reported with its denominator. "0 of 20" means something; "0" can mean nothing was looked at.
- Wait for fonts before measuring text, measure at the real viewport, and capture fixed height screens in sections, because a full page capture stretches them.
- Compute contrast on the color as painted, after transparency and every layer behind it.
- When a step has a fallback, the fallback announces itself in the log and on screen.
- A patch that cannot find what it was meant to change fails loudly. "Fixed" is only said after it was seen.

## Iterating

- Change only what was pointed at. What the person did not mention stays.
- When a word in a correction can be read two ways, ask with both readings before redoing anything.
- "This is not clear" is about use, not position. Ask which part is not understood before moving things around.
- If something has to be cut to fit, cut what the person did not value and say what was cut.

## Taste, as principles

These come from a long run of corrections. Each one is a default with its reason, so a project can override it with a better one.

- **State is shown by the content.** The active item gets its color, image or ground; a stripe on one side is what generated interfaces do.
- **Type that has to be read starts at 14px.** Below that a product looks cramped and cheap.
- **Numbers that must be read without doubt use a face where every digit has its own outline.** Pixel and novelty faces are for words.
- **The effect of a control is seen, not explained.** Moving it changes the thing itself, in place.
- **Unavailable options stay visible**, disabled, with the reason written.
- **Simple interfaces carry no help paragraphs.** Clarifications live behind an info icon; the long description of an option lives in its detail panel.
- **A text field needs no drawn ring.** The caret is its focus indicator; every other control shows a designed focus state, never a hard black outline.
- **A generic structure needs a reason.** A list with a thumbnail and two lines, or a grid of thumbnails, is the default every user has seen a thousand times.
- **Ornament that does not inform is removed.** If a value does not help someone decide, it goes.
- **Native controls are designed too.** Selects, scrollbars, checkboxes and date fields get the project's style, keep their keyboard behavior and close when focus or a click goes elsewhere.
- **Radii are concentric.** The inner radius is the outer radius minus the inset.
- **Space separates before lines do.** One separation method per boundary.
- **Spacing comes from one scale.** Loose values read as mistakes.
- **Shadows share one light.** Same direction everywhere, growing with elevation.
- **Running text is 45 to 75 characters per line.**
- **Undo beats confirm.** A reversible action with Undo instead of a dialog everyone accepts unread; confirm only what cannot be undone.
- **An error says how to go on**, next to the problem, without blame or codes.
- **Align by eye, not by box.** Play triangles, round icons and glyphs are nudged until they look centered.
- **One primary action per view.** Everything else steps back.

## Words

- Product copy says what goes in and what comes out, never the path in between. How it is made is the one thing that cannot be copied by looking.
- Progress messages speak about what is happening for the user. The machinery stays inside; a percentage is fine.
- Prices are shown in the unit people buy and spend in the product.
- A product that serves more than one country is written in a neutral register.
- Names are short, sound strong and do not describe the product.

## Pieces outside the screen

- An image prompt is one complete block: size, proportion, empty zones, hex values, the exact text with its hierarchy, and the negatives. Variants are separate complete prompts.
- A direction from an earlier piece is not reused unless the person asks.
- An image for a social post is a composition: one large hero piece and smaller supporting ones, made from real output of the product, and labeled as a composition.

## Done

A design is done when the audit passes with its denominators, the person has the files in front of them, and the corrections from this round are written into the project skill.

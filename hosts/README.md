# Wrappers

One directory per host. **A wrapper shares zero content with any other wrapper** — they differ
only in manifest format, which is what stops them drifting from each other.

## What a wrapper may contain

A manifest, a name, a description, an install instruction, a license, and a docs link.

It may **not** contain a sentence about the product's behavior. Past a hard ceiling of
non-generated content (`WRAPPER_NON_GENERATED_WORD_CEILING` in `build/pins.mjs`) the lint fails.
The description is generated from `recognition.md`'s first paragraph, never hand-written, because
it is what a host matches against and is the closest thing here to platform-authored behavior.

## Adding a host

Create `hosts/<name>/` with an `install.json` declaring the paths the wrapper installs to and any
env var it sets. `build/assemble.mjs` discovers it, generates the skill body and manifest, and
extends `build/install-manifest.json` — which means the subtractive suite's precondition check
covers the new host with **no edit to the test**.

## Current hosts

- **`self-serve/`** — the git-repo host. Shipped first, deliberately: it keeps a third party's
  review queue off the critical path and makes the content-before-packaging order structural
  rather than a promise (FORK-5).
- **`claude-code/`** — a marketplace repo. Its four slash commands are the four action ids in the
  shape that host has, not a fifth thing.
- **`chatgpt/`** — the curated directory shared by ChatGPT and Codex. Its listing renders starter
  prompts, which are derived from the section headings by a fixed expansion rather than authored
  per host: an authored row would be a pinned string in a third party's directory that nothing
  here can reach to change.

**The rule for a curated directory's review queue.** If its review demands a content change, that
change goes into `recognition.md` — which means it goes to everyone — or it is refused. A content
change made only for one directory's reviewer is per-host content with a compliance excuse.

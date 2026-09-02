## What changed

<!-- One or two lines. What does this PR do? -->

---

## Does this PR change `recognition.md`?

- [ ] **No** — `recognition.md` is untouched. Skip the rest of this template.
- [ ] **Yes** — complete BOTH reviews below. They are not optional and they are not the same review.

<!--
  If this PR touches recognition.md, everything below is required.

  recognition.md is the single source for two published artifacts: the section that
  ships into every creator's AGENTS.md at the next template tag, and the body of a
  package the platform CANNOT RECALL once a creator has installed it. A sentence added
  here reaches people we cannot reach back.

  The lint catches SYNTAX. It does not catch INTENT, and that is not a gap to be closed
  later -- it is the boundary of what a grep-shaped rule can do. Any grammatically
  ordinary declarative sentence passes every arm of the lint. A build-time security pass
  wrote eleven new hostile sentences and ALL ELEVEN passed. Two laundered a teardown by
  pure inference; two pointed at stored credentials without naming a path.

  This checklist is the ONLY control that owns that class. It is load-bearing, not
  ceremonial.
-->

### Review 1 — duplication (asks about RESTATEMENT)

Does any new sentence restate something the project's own agent contract (`AGENTS.md` /
`GROUNDING.md`) already says, in different words?

**Answer:**

### Review 2 — the adversarial review (asks about OVERRIDE)

**Answer each of the five items explicitly. A checklist answered by silence is not a control** —
"n/a" and "no" are answers; a blank is not. Both reviews run; they ask different questions.

**1. Does it tell the agent to skip, defer, or shortcut a confirmation?**
Including *"since they already decided"*, *"no need to ask"*, *"that's the definition of done"*.

**Answer:**

**2. Does it treat silence, inference, or a preceding event as consent?**
A passing test, a successful publish, a shown demo, or the end of a turn is **never** stated
intent (B-F14-2).

**Answer:**

**3. Does it extend the scope of one of the four pinned moments, or make one moment's trigger cover another's action?**
**Teardown is the one to attack** — `preview` is pinned and permitted, so a laundered teardown
never trips verb-pinning.

**Answer:**

**4. Does it point the agent at locally stored credentials or configuration by any description?**
A named path, a dotfile, an environment variable, or an **unnamed** reference to "settings",
"config", or "what's stored on this machine" — rather than at running a CLI verb. **The item is
about the referent, not the spelling**: the attack that found this gap named none of those
spellings. The PAT is plaintext and machine-readable; reading it is cheaper than shelling out
twice, and nothing but this text stands between the two.

**Answer:**

**5. Does it make a claim about what the person has decided that the person did not say in the current turn?**

**Answer:**

---

### Reviewer

**The reviewer must be someone who did not write the change.** A file that changes twice a year
affords that.

- [ ] The reviewer is not the author.
- [ ] Every item above is answered in words, not left blank.

<!--
  Automated checks (`npm run lint`, `npm run check`, `npm test`) run in CI and cover the
  syntactic arms, the assembly, and the pinned surfaces. They are necessary and they are
  not sufficient. This template covers what they structurally cannot.
-->

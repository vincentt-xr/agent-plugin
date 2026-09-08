// The pinned surfaces. Every constant here is a published fact the platform cannot recall
// once a creator has installed a copy, so each is frozen and each change is a record change.

// implementation.md §8. The verbs `recognition.md` is permitted to name. One word.
// Everything else defers to "the agent contract". `preview` earns its place because teardown
// has to name something and "stop the preview" is what the creator said anyway.
//
// `outdated` is the second, added by f17. It is the verb that answers "what is behind", and the
// upgrade moment cannot defer it the way the other moments defer theirs: the whole procedure's
// facts arrive from that one answer, and a procedure that will not name the verb produces an
// agent guessing at one. B-F3-8's enforceable half is verbs, so naming it is the half f14
// accepted; naming a flag, an exit code, or an output shape remains the half it refused.
export const PINNED_PLUGIN_VERBS = Object.freeze(['preview', 'outdated']);

// QA-F14-G3: the ids are APPEND-ONLY, exactly as B-F3-8 treats verbs. An installed package
// resolves against the id, not the label, so a rename orphans a copy we cannot reach. Labels
// may change freely; ids may not.
//
// `update` is APPENDED by f17's `plugin-holds-upgrade`. Appended, never reordered: the ids are
// positional against recognition.md's headings in `renderActions`, so a reorder here would
// silently re-point every installed copy's rows at the wrong moments.
export const PINNED_ACTION_IDS = Object.freeze(['start', 'resume', 'phone', 'stop', 'update']);

// The moments are the feature. A further section is a further moment, which is a record change
// and not a packaging change (D-The-labels-are-a-pinned-surface).
//
// Moved 4 -> 5 by `plugin-holds-upgrade`, by the mechanism f14 specified rather than around it.
// Hard at its new value: the ceiling's purpose is a surface too small to rot, and that purpose
// survives being moved by one.
export const SECTION_CEILING = 5;

// The ONE file path `recognition.md` is permitted to name — an exact-token allowlist, not a
// pattern. `package.json` is a fact about the JavaScript ecosystem rather than about Vincentt or
// about the creator's project, and the upgrade moment's substance is a string that goes into it.
//
// EXACT TOKENS, matched delimiter-bounded and whole. `../package.json`, `~/package.json`,
// `my-package.json` and `tsconfig.json` are all still violations, and `.vincentt/` fails
// absolutely — it is not on this list and no entry here can ever admit it, because the arm tests
// the WHOLE token and `.vincentt/` is a directory prefix rather than a token.
//
// A pattern was rejected. The narrowing exists because the shipped recognition text depends on
// this arm and an independent security pass found two sentences that passed every arm and still
// made reading a plaintext credential the cheapest obedient path. A regex allowance is the shape
// that lets the next one ride in behind a legitimate name.
export const PATH_ALLOWLIST = Object.freeze(['package.json']);

// implementation.md §4(1): an action label is a menu row, not a sentence.
export const LABEL_MAX_WORDS = 5;

// §6: a wrapper may hold a manifest, a name, a description, an install instruction, a license,
// and a docs link — and no sentence about the product's behavior. The ceiling is measured in
// non-generated words so that "thin" is a number rather than an intention.
export const WRAPPER_NON_GENERATED_WORD_CEILING = 60;

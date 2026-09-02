// The pinned surfaces. Every constant here is a published fact the platform cannot recall
// once a creator has installed a copy, so each is frozen and each change is a record change.

// implementation.md §8. The verbs `recognition.md` is permitted to name. One word.
// Everything else defers to "the agent contract". `preview` earns its place because teardown
// has to name something and "stop the preview" is what the creator said anyway.
export const PINNED_PLUGIN_VERBS = Object.freeze(['preview']);

// QA-F14-G3: the ids are APPEND-ONLY, exactly as B-F3-8 treats verbs. An installed package
// resolves against the id, not the label, so a rename orphans a copy we cannot reach. Labels
// may change freely; ids may not.
export const PINNED_ACTION_IDS = Object.freeze(['start', 'resume', 'phone', 'stop']);

// The four moments are the feature. A fifth section is a fifth moment, which is a record
// change and not a packaging change (D-The-labels-are-a-pinned-surface).
export const SECTION_CEILING = 4;

// implementation.md §4(1): an action label is a menu row, not a sentence.
export const LABEL_MAX_WORDS = 5;

// §6: a wrapper may hold a manifest, a name, a description, an install instruction, a license,
// and a docs link — and no sentence about the product's behavior. The ceiling is measured in
// non-generated words so that "thin" is a number rather than an intention.
export const WRAPPER_NON_GENERATED_WORD_CEILING = 60;

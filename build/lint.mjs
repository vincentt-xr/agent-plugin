// The source lint — implementation.md §4(1) and §4(1b).
//
// Every arm returns a violation naming ITSELF, because a lint that says "the source is invalid"
// tells a contributor nothing about which rule they crossed. The lint is run, not asserted:
// `npm run lint` exits non-zero on any violation.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecognition, splitSentences } from './parse.mjs';
import { isMain } from './is-main.mjs';
import {
  PINNED_PLUGIN_VERBS,
  SECTION_CEILING,
  LABEL_MAX_WORDS,
  PINNED_ACTION_IDS,
  WRAPPER_NON_GENERATED_WORD_CEILING,
  PATH_ALLOWLIST,
} from './pins.mjs';

// §4.1: the one sentence in the package not from recognition.md. The lint exempts it BY EXACT
// MATCH so it cannot grow — a prefix or substring exemption would let a second sentence ride in
// behind the first.
export function isPrecedenceSentence(text, precedence) {
  return text.trim() === precedence.trim();
}

const ARMS = {
  FLAG: 'flag',
  EXIT_CODE: 'exit-code',
  FILE_PATH: 'file-path',
  SEMVER: 'semver',
  GIT_DESTRUCTIVE: 'git-destructive',
  STATE_RESTORING: 'state-restoring',
  COMPONENT: 'component',
  VERB_PIN: 'verb-pin',
  SECOND_PERSON: 'second-person',
  DECLARATIVE_OPENER: 'declarative-opener',
  CLAUSE_OPENER: 'clause-opener',
  LABEL_LENGTH: 'label-length',
  LABEL_CONTENT: 'label-content',
  LABEL_RESOLUTION: 'label-resolution',
  LABEL_ID_SET: 'label-id-set',
  SECTION_CEILING: 'section-ceiling',
  STRUCTURE: 'structure',
  WRAPPER_CEILING: 'wrapper-ceiling',
};

export { ARMS };

// A sentence body opens declaratively when it opens with one of these, or with a proper noun.
// §4(1b): a sentence opening with a bare verb is an instruction, and instructions to the agent
// do not belong in a file whose whole job is "what did the person mean?".
const DECLARATIVE_OPENERS = new Set([
  'When', 'The', 'A', 'An', 'This', 'That', 'Nothing', 'Anything', 'Where',
  'Each', 'Every', 'Its', 'Their', 'Only', 'Both', 'Neither', 'No', 'Some',
  'One', 'It', 'They', 'There', 'These', 'Those', 'Someone', 'Something',
]);

function violation(arm, message, detail = {}) {
  return { arm, message, ...detail };
}

// —— §4(1) the syntactic arms ————————————————————————————————————————————————

function lintFlags(text) {
  const out = [];
  for (const m of text.matchAll(/--[a-z][a-z-]*/g)) {
    out.push(
      violation(
        ARMS.FLAG,
        `no flag may appear in recognition.md: found "${m[0]}". A flag is what the command does; ` +
          `this file answers what the person meant. It belongs in AGENTS.md or --help.`,
      ),
    );
  }
  return out;
}

function lintExitCodes(text) {
  const out = [];
  for (const m of text.matchAll(/exit \d+|\bexits? [0-9]+/gi)) {
    out.push(
      violation(
        ARMS.EXIT_CODE,
        `no exit code may appear in recognition.md: found "${m[0]}". Exit codes, output shapes ` +
          `and JSON fields belong in AGENTS.md or --help (B-F12-1).`,
      ),
    );
  }
  return out;
}

// §4: NARROWED by `plugin-holds-upgrade`, never disabled. The arm still finds every `.json`
// token and every `.vincentt/`; what changed is that a token EXACTLY equal to an entry in
// PATH_ALLOWLIST is permitted, because the upgrade moment's substance is a string that goes into
// the ecosystem's own conventional manifest.
//
// The match is deliberately built the other way round from the obvious implementation. Rather
// than exempting an allowlisted spelling from a `.json` hit, it CAPTURES THE WHOLE TOKEN around
// the hit and compares that whole token to the allowlist. The obvious implementation — testing
// whether the matched text or its surroundings "contain" an allowed name — is what admits
// `../package.json`, `~/package.json` and `my-package.json`, each of which contains the allowed
// name and none of which is it.
//
// A token runs to the nearest path/prose delimiter on each side, and `/`, `\` and `~` are
// delimiters that BECOME PART of the token, so a path-qualified spelling can never compare equal
// to a bare allowlisted name.
//
// `.vincentt/` is unconditional and is checked before the allowlist is consulted at all. No
// entry in PATH_ALLOWLIST can admit it: it is tested as its own literal, not as a token.

// A filename character: anything that is not whitespace and not prose punctuation. `.` is
// handled separately, because a `.` belongs to the token only when another filename character
// follows it — otherwise a sentence-terminal period is swallowed and the legitimate
// `…into package.json.` compares as `package.json.` and fails.
const FILENAME_CHAR = String.raw`[^\s\`"'(),;:!?]`;

// The WHOLE token around a `.json`, extended in BOTH directions.
//
// Extending only LEFTWARDS was a real bug, and this repo's own corpus caught it rather than
// review: `package.json.bak` matched with the token captured as `package.json`, compared equal to
// the allowlist, and PASSED. A trailing-suffix spelling is as much a different file as a
// leading-path one, so the token runs to a delimiter on both sides.
const JSON_TOKEN = new RegExp(
  String.raw`(?:${FILENAME_CHAR}(?<=[^.])|\.(?=${FILENAME_CHAR}))*` +
    String.raw`\.json` +
    String.raw`(?:\.(?=${FILENAME_CHAR})|${FILENAME_CHAR}(?<=[^.]))*`,
  'g',
);

function lintFilePaths(text) {
  const out = [];

  for (const m of text.matchAll(/\.vincentt\//g)) {
    out.push(
      violation(
        ARMS.FILE_PATH,
        `no file path may appear in recognition.md: found "${m[0]}". A path in the creator's ` +
          `tree belongs in AGENTS.md or GROUNDING.md. This one is refused absolutely — the path ` +
          `allowlist cannot admit it.`,
      ),
    );
  }

  for (const m of text.matchAll(JSON_TOKEN)) {
    const token = m[0];
    if (PATH_ALLOWLIST.includes(token)) continue;
    out.push(
      violation(
        ARMS.FILE_PATH,
        `no file path may appear in recognition.md: found "${token}". The path allowlist holds ` +
          `[${PATH_ALLOWLIST.join(', ')}] as EXACT tokens, and "${token}" is not one of them — a ` +
          `path-qualified or differently-named spelling is a different file. A path in the ` +
          `creator's tree belongs in AGENTS.md or GROUNDING.md.`,
      ),
    );
  }
  return out;
}

// §6.2 + §4: the SEMVER arm. Condition (ii) of the amended B-F14-1, mechanically.
//
// A published package that states a version is a stale copy the platform cannot recall on a
// creator's timetable. Every version the upgrade procedure acts on arrives from the platform's
// own public surface at the moment it runs, so a version-shaped string ANYWHERE in the source is
// a fact that has entered the package.
//
// Deliberately shape-based rather than name-based: it does not matter which package a version
// belongs to, or whether it is even a real one. The defect is a number that can go stale.
function lintSemver(text) {
  const out = [];
  for (const m of text.matchAll(/\d+\.\d+\.\d+/g)) {
    out.push(
      violation(
        ARMS.SEMVER,
        `no version may appear in recognition.md: found "${m[0]}". The package holds a METHOD and ` +
          `never a FACT (B-F14-1 condition (ii)) — every version the procedure acts on is read at ` +
          `run time from the platform's public surface. A version published here is a stale copy ` +
          `the platform cannot recall on a creator's timetable.`,
      ),
    );
  }
  return out;
}

// §6.2: the GIT-DESTRUCTIVE arm, and its companion the STATE-RESTORING-PHRASE arm.
//
// Two arms because the trap needs two. The first catches a named destructive command. The second
// exists because THE TRAP SENTENCE CONTAINS NO COMMAND WORD: the independent security pass
// produced "a working tree returned to its committed state is the previous contents back", which
// names no command, states a fact, and completely specifies a hard reset. On this product's tree
// a hard reset or force-clean destroys the project binding, the env file, and every asset the
// creator dropped in, because those are ignored by version control and a dirty tree is the modal
// case. So the second arm tests for a described TARGET STATE rather than for a verb.
const GIT_DESTRUCTIVE = [
  /\breset\s+--hard\b/i,
  /\bgit\s+reset\b/i,
  /\bclean\s+-fd\b/i,
  /\bclean\s+-[a-z]*d[a-z]*f?\b/i,
  /\bcheckout\s+\./i,
  /\bgit\s+checkout\s+--\s/i,
  /\bgit\s+stash\b/i,
  /\bgit\s+revert\b/i,
  /\bgit\s+restore\b/i,
];

// A state-restoring phrase names a state to put the tree INTO. `returned to`, `back to` and
// `restored to` are only such phrases when their object NAMES A STATE — which is what keeps this
// arm off the pinned heading "Coming back to something", whose object is a bare indefinite.
//
// That is not a softening for the heading's convenience: it is the actual distinction. "back to
// something" describes a conversation resuming; "back to its committed contents" describes a
// filesystem transformation. Testing the object is what tells them apart, and the arm is
// MEASURED against both in the corpus rather than argued about.
const RESTORING_OBJECT =
  String.raw`(?:the\s+|its\s+|their\s+|a\s+|an\s+|how\s+|what\s+|where\s+)*` +
  String.raw`(?:previous|prior|original|committed|clean|pristine|last|earlier|former|initial|old)?\s*` +
  String.raw`(?:states?|contents?|versions?|conditions?|shapes?|forms?|bytes|files?|trees?|` +
  String.raw`folders?|repositor(?:y|ies)|repos?|projects?|working\s+tree|they\s+were|it\s+was|` +
  String.raw`things\s+were)`;

const STATE_RESTORING = [
  new RegExp(String.raw`\b(?:returned|restored|reverted|rolled|put|brought)\s+back\s+to\b`, 'i'),
  new RegExp(String.raw`\b(?:returned|restored|reverted)\s+to\s+${RESTORING_OBJECT}`, 'i'),
  new RegExp(String.raw`\bback\s+to\s+${RESTORING_OBJECT}`, 'i'),
  /\bas\s+it\s+was\b/i,
  /\bas\s+they\s+were\b/i,
  /\bcommitted\s+state\b/i,
  /\bclean\s+state\b/i,
  /\bpristine\s+state\b/i,
  /\buntouched\s+state\b/i,
];

function lintGitDestructive(text) {
  const out = [];
  for (const re of GIT_DESTRUCTIVE) {
    const m = re.exec(text);
    if (!m) continue;
    out.push(
      violation(
        ARMS.GIT_DESTRUCTIVE,
        `no version-control command that discards work may appear in recognition.md: found ` +
          `"${m[0]}". The procedure conveys recoverability by naming WHERE bytes are, never by ` +
          `naming a transformation — an agent that reads one and reaches for it does more damage ` +
          `than the upgrade did, and on this tree it destroys the project binding, the env file, ` +
          `and every asset the creator added, all of which are ignored by version control.`,
      ),
    );
  }
  return out;
}

function lintStateRestoring(text) {
  const out = [];
  for (const re of STATE_RESTORING) {
    const m = re.exec(text);
    if (!m) continue;
    out.push(
      violation(
        ARMS.STATE_RESTORING,
        `no state-restoring phrase may appear in recognition.md: found "${m[0]}". THIS ARM EXISTS ` +
          `BECAUSE THE TRAP SENTENCE CONTAINS NO COMMAND WORD — the security pass's own sentence ` +
          `("a working tree returned to its committed state is the previous contents back") names ` +
          `no command, states a fact, and fully specifies a hard reset. A described target state ` +
          `is an operationalizable instruction; only a statement of where bytes ARE is not.`,
      ),
    );
  }
  return out;
}

function lintComponents(text) {
  const out = [];
  for (const m of text.matchAll(/<[A-Z][A-Za-z]+ |\bprop\b/g)) {
    out.push(
      violation(
        ARMS.COMPONENT,
        `no component or prop may appear in recognition.md: found "${m[0].trim()}". The SDK ` +
          `surface belongs in GROUNDING.md.`,
      ),
    );
  }
  return out;
}

// §4: "every `vincentt <verb>` token is in PINNED_PLUGIN_VERBS". The match is on the COMMAND as
// it is typed — lowercase `vincentt`, optionally via npx — not on the product name. "Vincentt is
// the platform for it" is prose about the product and names no verb; the capital is the
// distinction the arm reads, which is why this match is case-SENSITIVE.
function lintVerbs(text) {
  const out = [];
  for (const m of text.matchAll(/(?:^|[^A-Za-z])vincentt\s+([a-z][a-z-]*)/g)) {
    const verb = m[1];
    if (!PINNED_PLUGIN_VERBS.includes(verb)) {
      out.push(
        violation(
          ARMS.VERB_PIN,
          `"vincentt ${verb}" is not in PINNED_PLUGIN_VERBS [${PINNED_PLUGIN_VERBS.join(', ')}]. ` +
            `Naming a verb here publishes it into a package the platform cannot recall; defer to ` +
            `"the agent contract" instead.`,
        ),
      );
    }
  }
  return out;
}

// —— §4(1b) the form arms ——————————————————————————————————————————————————

function lintSecondPerson(text) {
  const out = [];
  for (const m of text.matchAll(/\b(you|your|yours|you're|you've|you'll)\b/gi)) {
    out.push(
      violation(
        ARMS.SECOND_PERSON,
        `recognition.md's body may contain no second-person address: found "${m[0]}". ` +
          `Second person addresses the agent; this file describes the person.`,
      ),
    );
  }
  return out;
}

function lintDeclarativeOpeners(sentences) {
  const out = [];
  for (const sentence of sentences) {
    const firstWord = /^["'“(]*([A-Za-z][A-Za-z'’-]*)/.exec(sentence);
    if (!firstWord) continue;
    const word = firstWord[1];
    const isDeclarative =
      DECLARATIVE_OPENERS.has(word) || /^[A-Z][a-z]/.test(word) === false || isProperNoun(word);
    if (!isDeclarative) {
      out.push(
        violation(
          ARMS.DECLARATIVE_OPENER,
          `every sentence in a section body must open declaratively; "${word}" opens an ` +
            `instruction. Sentence: "${truncate(sentence)}"`,
        ),
      );
    }
  }
  return out;
}

// The clause-level split — implementation.md §4 calls it "cheap and worth doing" and explicitly
// does NOT claim it closes the class. It is implemented and MEASURED here, and it is OFF BY
// DEFAULT because qa.md's QA-F14-02 pins ATTACK_1 as a PASS; turning it on inverts a pinned
// expectation, which is a deliberate record change and not a build-time decision.
//
// MEASURED, by running it over the whole F14_HOSTILE_SOURCES corpus rather than reasoning:
//   ATTACK_1        CAUGHT   ("do not ask" after an em-dash)
//   ATTACK_3        STILL PASSES  — a declarative override has no bare verb to find
//   ATTACK_DOTFILE  STILL PASSES  — likewise
//   SHIPPED         STILL CLEAN   — no false positive on the approved source
//
// So it converts one of three residuals. It does NOT close the class: two of the three shapes
// the checklist owns are untouched, and both are the ones that read as ordinary prose.
// Overstating this rule a second time is the greater risk (FORK-B).
export function splitClauses(sentence) {
  return sentence
    .split(/\s+—\s+|;\s+|,\s+so\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function lintClauseOpeners(sentences) {
  const out = [];
  for (const sentence of sentences) {
    // The first clause IS the sentence opener, already covered by the declarative arm.
    for (const clause of splitClauses(sentence).slice(1)) {
      const m = /^["'“(]*([A-Za-z][A-Za-z'’-]*)/.exec(clause);
      if (!m) continue;
      const word = m[1];
      if (BARE_IMPERATIVES.has(word) || BARE_IMPERATIVES.has(capitalise(word))) {
        out.push(
          violation(
            ARMS.CLAUSE_OPENER,
            `a subordinate clause opens with the bare imperative "${word}", which is an ` +
              `instruction to the agent: "${truncate(clause)}"`,
          ),
        );
      }
    }
  }
  return out;
}

function capitalise(w) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// A proper noun here is a capitalised word that is not a known bare imperative. The lint tests
// SENTENCE openers by design; see §4 and FORK-B for what that deliberately does not catch.
const BARE_IMPERATIVES = new Set([
  'Confirm', 'Stop', 'Start', 'Run', 'Read', 'Ask', 'Tell', 'Do', 'Use', 'Open',
  'Follow', 'Check', 'Make', 'Take', 'Give', 'Go', 'Skip', 'Assume', 'Create',
  'Install', 'Print', 'Show', 'Call', 'Set', 'Add', 'Remove', 'Write', 'Send',
  'Pick', 'Close', 'Build', 'Publish', 'Preview', 'Resume', 'Continue', 'Never',
  'Always', 'Avoid', 'Ensure', 'Keep', 'Let', 'Report', 'Return', 'Treat', 'Wait',
]);

function isProperNoun(word) {
  return /^[A-Z]/.test(word) && !BARE_IMPERATIVES.has(word);
}

function truncate(s, n = 80) {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

// —— the whole-source lint —————————————————————————————————————————————————

export function lintSource(source, options = {}) {
  const violations = [];
  const doc = parseRecognition(source);

  if (doc.sections.length === 0) {
    violations.push(
      violation(ARMS.STRUCTURE, 'recognition.md has no ### sections; there is nothing to render.'),
    );
  }
  if (doc.sections.length > SECTION_CEILING) {
    violations.push(
      violation(
        ARMS.SECTION_CEILING,
        `recognition.md has ${doc.sections.length} sections; the ceiling is ${SECTION_CEILING}. ` +
          `A fifth section is a fifth MOMENT, which is a record change and not a packaging change.`,
      ),
    );
  }

  // The syntactic arms run over the whole source. A flag is forbidden in a heading as surely as
  // in a body.
  violations.push(
    ...lintFlags(source),
    ...lintExitCodes(source),
    ...lintFilePaths(source),
    ...lintSemver(source),
    ...lintGitDestructive(source),
    ...lintStateRestoring(source),
    ...lintComponents(source),
    ...lintVerbs(source),
  );

  // The form arms run over section bodies and the preamble — the prose an agent reads as
  // guidance. Headings are labels, checked by the label arms.
  const proseBlocks = [doc.preambleText, ...doc.sections.map((s) => s.body)].filter(Boolean);
  const precedence = options.precedence ?? '';
  for (const block of proseBlocks) {
    violations.push(...lintSecondPerson(block));
    const sentences = splitSentences(block).filter(
      (s) => !(precedence && isPrecedenceSentence(s, precedence)),
    );
    violations.push(...lintDeclarativeOpeners(sentences));
    // Off by default — see splitClauses above for the measured result and why enabling it is a
    // record change rather than a build-time decision.
    if (options.clauseLevel) violations.push(...lintClauseOpeners(sentences));
  }

  violations.push(...lintLabels(doc, options.actions));
  return violations;
}

// —— the label arms (QA-F14-04) ——————————————————————————————————————————————

export function lintLabels(doc, actions) {
  const violations = [];
  const headings = doc.sections.map((s) => s.heading);

  for (const heading of headings) {
    const words = heading.trim().split(/\s+/);
    if (words.length > LABEL_MAX_WORDS) {
      violations.push(
        violation(
          ARMS.LABEL_LENGTH,
          `heading "${heading}" is ${words.length} words; an action label may be at most ` +
            `${LABEL_MAX_WORDS}. Each heading is also a menu row.`,
        ),
      );
    }
  }

  if (!actions) return violations;

  const ids = actions.map((a) => a.id);
  for (const id of ids) {
    if (!PINNED_ACTION_IDS.includes(id)) {
      violations.push(
        violation(
          ARMS.LABEL_ID_SET,
          `action id "${id}" is not in the pinned set [${PINNED_ACTION_IDS.join(', ')}]. Ids are ` +
            `append-only: an installed package resolves against the id, and the platform cannot ` +
            `reach an installed copy to rename one (B-F3-8, QA-F14-G3).`,
        ),
      );
    }
  }
  for (const pinned of PINNED_ACTION_IDS) {
    if (!ids.includes(pinned)) {
      violations.push(
        violation(
          ARMS.LABEL_ID_SET,
          `pinned action id "${pinned}" is missing. Ids are never removed — an already-installed ` +
            `package still resolves against it.`,
        ),
      );
    }
  }

  for (const action of actions) {
    if (!headings.includes(action.section)) {
      violations.push(
        violation(
          ARMS.LABEL_RESOLUTION,
          `action "${action.id}" names section "${action.section}", which matches no ### heading ` +
            `in recognition.md. A label naming something absent from the grounding would be ` +
            `per-host capability with a keystroke attached.`,
        ),
      );
    }
    const words = String(action.label ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > LABEL_MAX_WORDS) {
      violations.push(
        violation(
          ARMS.LABEL_LENGTH,
          `action "${action.id}" has a ${words.length}-word label; the ceiling is ` +
            `${LABEL_MAX_WORDS}.`,
        ),
      );
    }
    const label = String(action.label ?? '');
    const bad = /--[a-z]|https?:\/\/|\bvincentt\b|[/\\]|\.json/i.exec(label);
    if (bad) {
      violations.push(
        violation(
          ARMS.LABEL_CONTENT,
          `action "${action.id}" label contains "${bad[0]}". A label is a moment, not a command: ` +
            `no flag, path, URL, or vincentt token.`,
        ),
      );
    }
  }

  return violations;
}

// —— the wrapper ceiling (§6) ————————————————————————————————————————————————

// A wrapper may hold a manifest, a name, a description, an install instruction, a license, and a
// docs link — and no sentence about the product's behavior. "Thin" is enforced as a measured
// number the same way agent-host-grounding bounded its pointer by size.
export function lintWrapperCeiling(nonGeneratedText, ceiling) {
  const words = nonGeneratedText.trim().split(/\s+/).filter(Boolean);
  if (words.length <= ceiling) return [];
  return [
    violation(
      ARMS.WRAPPER_CEILING,
      `wrapper carries ${words.length} words of non-generated content; the ceiling is ${ceiling}. ` +
        `Content about the product belongs in recognition.md, where it reaches every creator.`,
    ),
  ];
}

export function lintFile(path, options) {
  return lintSource(readFileSync(path, 'utf8'), options);
}

// —— the CLI ——————————————————————————————————————————————————————————————————

// `build/lint.mjs` is directly runnable. A lint that does not fail the build is worse than no
// lint, because it launders the claim that one exists — so this exits non-zero on any violation.
//
// Paths resolve from THIS FILE's location, never from the cwd: the lint must read the checkout it
// lives in, so that running it from anywhere lints the right tree.
export function runLintCli() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');

  const sourcePath = join(root, 'recognition.md');
  if (!existsSync(sourcePath)) {
    console.error(`recognition.md lint FAILED: no source at ${sourcePath}.`);
    return 1;
  }
  const source = readFileSync(sourcePath, 'utf8');

  const precedencePath = join(root, 'precedence.txt');
  const precedence = existsSync(precedencePath) ? readFileSync(precedencePath, 'utf8') : '';

  const actionsPath = join(root, 'actions.yml');
  const actions = existsSync(actionsPath)
    ? parseActionsMinimal(readFileSync(actionsPath, 'utf8'))
    : undefined;

  const violations = lintSource(source, { actions, precedence });

  // The wrapper ceiling counts only NON-generated files: the generated SKILL.md and manifest are
  // recognition.md's own words, and counting them would turn the ceiling into a limit on the
  // source. Wrappers are discovered, so a host added tomorrow is covered with no edit here.
  const hostsDir = join(root, 'hosts');
  if (existsSync(hostsDir)) {
    for (const entry of readdirSync(hostsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const doc = join(hostsDir, entry.name, 'README.md');
      if (existsSync(doc)) {
        violations.push(
          ...lintWrapperCeiling(readFileSync(doc, 'utf8'), WRAPPER_NON_GENERATED_WORD_CEILING),
        );
      }
    }
  }

  if (violations.length) {
    console.error(`recognition.md lint FAILED — ${violations.length} violation(s):\n`);
    for (const v of violations) console.error(`  [${v.arm}] ${v.message}\n`);
    return 1;
  }
  console.log('recognition.md lint passed: every arm green.');
  return 0;
}

// A deliberately tiny reader for the shape build/assemble.mjs itself writes. Importing the
// assembler here would make the lint depend on the renderer it is meant to constrain.
function parseActionsMinimal(yaml) {
  const actions = [];
  let current = null;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const idMatch = /^\s*-\s*id:\s*(.+)$/.exec(line);
    if (idMatch) {
      current = { id: idMatch[1].trim() };
      actions.push(current);
      continue;
    }
    const kv = /^\s+([a-z]+):\s*(.+)$/.exec(line);
    if (kv && current) current[kv[1]] = kv[2].trim();
  }
  return actions;
}

if (isMain(import.meta.url)) {
  process.exit(runLintCli());
}

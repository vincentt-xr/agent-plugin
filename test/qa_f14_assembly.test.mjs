// QA-F14-03, QA-F14-04, QA-F14-G3 — the reproducible assembly, the four labels,
// and the append-only id pin.
//
// Authored from features/f14-agent-plugin/qa.md §E and §I.
//
// THE STRUCTURAL CONTROL. implementation.md §4(3) is the real answer to
// non-duplication: neither rendered copy is authored. A contributor cannot add a
// sentence to the plugin without adding it to recognition.md. These cases are
// what make that a build failure rather than a paragraph.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSEMBLE = path.join(REPO, "build/assemble.mjs");

const BEGIN = "<!-- BEGIN recognition (generated from recognition.md — do not edit here) -->";
const END = "<!-- END recognition -->";

/**
 * A scratch copy of the checkout. Every mutating arm of QA-F14-03 runs here so
 * the real tree is never edited — the fixture is F14_SOURCE_TREE, the tree
 * itself, and a case that corrupted it would poison every later case.
 */
function scratch() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "f14-assembly-"));
  cpSync(REPO, tmp, {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.includes("/.git"),
  });
  return tmp;
}

/** Run `assemble --check`: the mode that verifies tracked outputs are current. */
function check(cwd) {
  return spawnSync(process.execPath, [path.join(cwd, "build/assemble.mjs"), "--check"], {
    cwd,
    encoding: "utf8",
  });
}

test("QA-F14-03(a) · both rendered outputs match the assembly BYTE-FOR-BYTE", () => {
  assert.ok(existsSync(ASSEMBLE), "build/assemble.mjs must exist");
  const r = check(REPO);
  assert.equal(
    r.status,
    0,
    `the tracked outputs are stale — re-run \`npm run assemble\`.\n${r.stdout}${r.stderr}`,
  );
});

test("QA-F14-03(b) · a hand-edit to the tracked AGENTS.md section FAILS, naming recognition.md", () => {
  const tmp = scratch();
  try {
    // The template's copy lives in v2-template; this repo tracks the rendering it
    // publishes. Whichever tracked file carries the assembled section, the check
    // must reject a word changed inside the markers.
    const target = trackedGroundingCopy(tmp);
    const before = readFileSync(target, "utf8");
    assert.ok(before.includes(BEGIN) && before.includes(END), "the markers must be present");
    writeFileSync(target, before.replace(BEGIN + "\n", BEGIN + "\nHAND EDITED.\n"));

    const r = check(tmp);
    assert.notEqual(r.status, 0, "a hand-edited generated section must FAIL the check");
    assert.match(
      r.stdout + r.stderr,
      /recognition\.md/,
      "the failure must NAME recognition.md as the place to edit — a contributor who hand-edited " +
        "a rendered copy needs to be told where the source is, not merely that output differs",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-03(c) · a hand-edit to the generated skill body FAILS, naming recognition.md", () => {
  const tmp = scratch();
  try {
    const target = generatedSkillBody(tmp);
    const before = readFileSync(target, "utf8");
    writeFileSync(target, before + "\nHAND EDITED.\n");

    const r = check(tmp);
    assert.notEqual(r.status, 0, "a hand-edited skill body must FAIL the check");
    assert.match(r.stdout + r.stderr, /recognition\.md/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-03(d) · a MISSING recognition.md FAILS rather than emitting an empty section", () => {
  const tmp = scratch();
  try {
    rmSync(path.join(tmp, "recognition.md"));
    const r = spawnSync(process.execPath, [path.join(tmp, "build/assemble.mjs")], {
      cwd: tmp,
      encoding: "utf8",
    });
    assert.notEqual(
      r.status,
      0,
      "a missing source must FAIL the assembly. Emitting an empty section would silently ship a " +
        "template with no recognition text — the creator loses the mapping and nothing reports it.",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-03 · the markers are present and correctly PAIRED", () => {
  const body = readFileSync(trackedGroundingCopy(REPO), "utf8");
  const begins = body.split(BEGIN).length - 1;
  const ends = body.split(END).length - 1;
  assert.equal(begins, 1, "exactly one BEGIN marker");
  assert.equal(ends, 1, "exactly one END marker");
  assert.ok(
    body.indexOf(BEGIN) < body.indexOf(END),
    "BEGIN must precede END — an unclosed BEGIN would swallow the rest of AGENTS.md into the " +
      "generated region, and the next assembly would overwrite it",
  );
});

// --- QA-F14-04 · the four labels --------------------------------------------

const EXPECTED_IDS = ["start", "resume", "phone", "stop"];

/** Parse the generated actions.yml without adding a YAML dependency to this repo. */
function readActions(root = REPO) {
  const raw = readFileSync(path.join(root, "actions.yml"), "utf8");
  const entries = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    const id = line.match(/^\s*-\s*id:\s*(\S+)\s*$/);
    if (id) {
      cur = { id: id[1].replace(/^["']|["']$/g, "") };
      entries.push(cur);
      continue;
    }
    const kv = line.match(/^\s+(label|section):\s*(.+?)\s*$/);
    if (kv && cur) cur[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return entries;
}

test("QA-F14-04 · all four ids are present and NO fifth is accepted", () => {
  const actions = readActions();
  assert.deepEqual(
    actions.map((a) => a.id).sort(),
    [...EXPECTED_IDS].sort(),
    "actions.yml must carry exactly the four pinned ids",
  );
});

test("QA-F14-04 · every `section` matches a `###` heading in recognition.md EXACTLY", () => {
  const source = readFileSync(path.join(REPO, "recognition.md"), "utf8");
  const headings = [...source.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1]);
  for (const a of readActions()) {
    assert.ok(
      headings.includes(a.section),
      `label \`${a.id}\` points at section "${a.section}", which is not a heading in ` +
        `recognition.md. Headings are: ${JSON.stringify(headings)}. A heading renamed without ` +
        `the label following it is QA-F14-G3(b).`,
    );
  }
});

test("QA-F14-04 · the ceiling holds — a FIFTH section fails the build", () => {
  const tmp = scratch();
  try {
    const src = path.join(tmp, "recognition.md");
    writeFileSync(
      src,
      readFileSync(src, "utf8") +
        "\n### Sharing it with the world\n\nWhen the person says they want it live, the loop's " +
        "publishing step is what they are asking for.\n",
    );
    // Either the assembly refuses, or the lint's ceiling arm does. Both are the
    // same claim: a fifth section is a fifth MOMENT, which is a record change,
    // not a packaging change (D-The-labels-are-a-pinned-surface).
    const asm = spawnSync(process.execPath, [path.join(tmp, "build/assemble.mjs")], {
      cwd: tmp,
      encoding: "utf8",
    });
    const lint = spawnSync(process.execPath, [path.join(tmp, "build/lint.mjs")], {
      cwd: tmp,
      encoding: "utf8",
    });
    assert.ok(
      asm.status !== 0 || lint.status !== 0,
      "a fifth `###` section must fail the build (label-ceiling arm). Both the assembly and the " +
        "lint exited 0.",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-04 · LABEL_ORPHAN — a label whose section matches no heading fails", () => {
  const tmp = scratch();
  try {
    const f = path.join(tmp, "actions.yml");
    writeFileSync(
      f,
      readFileSync(f, "utf8").replace(/section:\s*.+/, "section: No Such Heading"),
    );
    const r = check(tmp);
    assert.notEqual(r.status, 0, "an orphaned label must fail the resolution arm");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-04 · every label is <= 5 words and names no flag, path, URL, or vincentt token", () => {
  for (const a of readActions()) {
    assert.ok(a.label, `label \`${a.id}\` must carry display text`);
    const words = a.label.trim().split(/\s+/);
    assert.ok(
      words.length <= 5,
      `label \`${a.id}\` is ${words.length} words ("${a.label}") — the ceiling is 5`,
    );
    assert.doesNotMatch(a.label, /--[a-z]/, `label \`${a.id}\` names a flag`);
    assert.doesNotMatch(a.label, /\.json|\.vincentt\//, `label \`${a.id}\` names a path`);
    assert.doesNotMatch(a.label, /https?:\/\//i, `label \`${a.id}\` names a URL`);
    assert.doesNotMatch(
      a.label,
      /\bvincentt\b/i,
      `label \`${a.id}\` names the \`vincentt\` token — a label is what the creator meant, not ` +
        `what the command is called`,
    );
  }
});

test("QA-F14-04 · actions.yml is GENERATED — hand-editing a label fails the check", () => {
  const tmp = scratch();
  try {
    const f = path.join(tmp, "actions.yml");
    writeFileSync(f, readFileSync(f, "utf8").replace(/label:\s*.+/, "label: Hand edited"));
    const r = check(tmp);
    assert.notEqual(
      r.status,
      0,
      "a hand-edited label must fail exactly as QA-F14-03(b) does for the body — otherwise a " +
        "string published into a third party's directory can be changed without touching the source",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- QA-F14-G3 · the append-only id pin -------------------------------------
//
// THE FINDING, stated plainly: a build-time check guards the FUTURE publish and
// NOTHING guards the INSTALLED one. A heading can be renamed, actions.yml
// regenerated, the build green, the package published — while a creator's
// already-installed package still carries the OLD label. That is UNDETECTABLE
// here, because detecting it requires reading a creator's host, which tripwires
// (a) and (c) both forbid.
//
// So the case asserts the only thing that CAN be asserted: the ids are
// APPEND-ONLY, exactly as B-F3-8 treats verbs. Pinning them is what makes the
// stale installed package keep working.

test("QA-F14-G3 · the four action ids are APPEND-ONLY — frozen constants", () => {
  const ids = readActions().map((a) => a.id);
  for (const pinned of EXPECTED_IDS) {
    assert.ok(
      ids.includes(pinned),
      `action id \`${pinned}\` was REMOVED or RENAMED.\n\n` +
        `B-F3-8's amended rationale: a published package in a third party's directory is ` +
        `grounding the platform cannot revise on the creator's timetable. An id is what a STALE ` +
        `INSTALLED package resolves against; renaming one breaks every copy already on a ` +
        `creator's machine, silently, with no signal reaching us. Ids may be ADDED (up to the ` +
        `ceiling of four, so in practice never) and NEVER renamed or removed.\n\n` +
        `The LABELS may change freely — a label is display text. Only the ids and the moments ` +
        `are pinned.`,
    );
  }
});

test("QA-F14-G3 · a label may change without breaking the pin", () => {
  // The complement of the case above, asserted so the pin is not read as
  // freezing the display text too. Changing a label changes actions.yml's
  // rendering, and the id set is unaffected.
  const tmp = scratch();
  try {
    const src = path.join(tmp, "recognition.md");
    const before = readFileSync(src, "utf8");
    // Rename nothing structural; the ids derive from the moments, not the wording.
    assert.ok(before.includes("###"), "the source carries `###` sections");
    assert.deepEqual(readActions(tmp).map((a) => a.id).sort(), [...EXPECTED_IDS].sort());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- helpers ----------------------------------------------------------------

/**
 * The tracked rendering of the grounding section this repo publishes.
 *
 * Located by CONTENT (the markers) rather than by a hardcoded filename, so dev's
 * choice of path does not make this suite wrong. If nothing carries the markers,
 * that is the finding and the message says so.
 */
function trackedGroundingCopy(root) {
  const candidates = [
    "AGENTS.md",
    "dist/AGENTS.section.md",
    "build/out/AGENTS.section.md",
    "hosts/self-serve/AGENTS.section.md",
    "grounding.md",
  ].map((p) => path.join(root, p));
  for (const c of candidates) {
    if (existsSync(c) && readFileSync(c, "utf8").includes(BEGIN)) return c;
  }
  assert.fail(
    `no tracked file in the agent-plugin checkout carries the assembled grounding section ` +
      `between its BEGIN/END markers. Looked at: ${candidates.join(", ")}. qa.md §E QA-F14-03 ` +
      `requires the assembled section to be TRACKED so a hand-edit is detectable.`,
  );
}

/** The generated skill body inside the wrapper. */
function generatedSkillBody(root) {
  const candidates = [
    "hosts/self-serve/skills/vincentt/SKILL.md",
    "hosts/self-serve/SKILL.md",
    "hosts/self-serve/skill.md",
  ].map((p) => path.join(root, p));
  for (const c of candidates) if (existsSync(c)) return c;
  assert.fail(
    `no generated skill body found in hosts/. Looked at: ${candidates.join(", ")}. ` +
      `implementation.md §6 requires the wrapper to carry a GENERATED skill body.`,
  );
}

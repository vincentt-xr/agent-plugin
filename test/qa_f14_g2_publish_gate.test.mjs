// QA-F14-G2 — the publish gate refuses when the template tag lacks the section,
// and is NOT satisfiable by a stale tag.
//
// THE CROSS-REPO CONTRACT CASE (exempt from the guardrail budget).
//
// f14 spans four repositories and only ONE pair exchanges a pinned shape:
// `agent-plugin` → `v2-template`, the assembled section, pinned byte-for-byte by
// this gate. The other three pairs exchange nothing — the template is cloned
// whole, the CLI names no template file, the console shares no shape with either.
//
// Authored from features/f14-agent-plugin/qa.md §I.
//
// ⚠ ENV: NETWORK, read-only. The one case in the f14 catalog that is not offline.
// It needs a `git fetch`/`git archive` of a template tag. Named at design time
// (qa.md §C) so the build did not discover it. No credential, no cloud resource,
// no deploy step.
//
// The five arms are driven against REAL FIXTURE TAGS IN A SCRATCH CLONE rather
// than against the live template, so (b), (c) and (e) can be produced at all —
// the live tag is (a) by construction and the other four rows are unreachable
// without a repository we control.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { evaluateGate, fetchTemplateAgents, extractSection, OUTCOME } = await import(
  path.join(REPO, "build/publish-gate.mjs")
);
const { renderGroundingSection, readSource } = await import(
  path.join(REPO, "build/assemble.mjs")
);

/** This repo's own assembly — the bytes the tag must carry. */
const EXPECTED = renderGroundingSection(readSource());

// ---------------------------------------------------------------------------
// The pure arms — every row of the table, no network
// ---------------------------------------------------------------------------

test("QA-F14-G2(a) · the tag CONTAINS the section byte-for-byte → publish PROCEEDS", () => {
  const agentsMd = `# Agent contract\n\nsome preamble\n\n${EXPECTED}\nsome epilogue\n`;
  const r = evaluateGate({ fetched: agentsMd, expected: EXPECTED });
  assert.equal(r.outcome, OUTCOME.PROCEED, r.message);
});

test("QA-F14-G2(b) · a DIFFERENT rendering (one word changed) → publish REFUSES", () => {
  const drifted = EXPECTED.replace(/\bperson\b/, "user");
  assert.notEqual(drifted, EXPECTED, "the fixture must actually differ");
  const r = evaluateGate({ fetched: `# A\n\n${drifted}\n`, expected: EXPECTED });

  assert.equal(r.outcome, OUTCOME.REFUSE);
  assert.equal(r.reason, "differs");
  // The refusal must name the tag it checked and the byte offset that differed —
  // "the gate failed" leaves a release engineer with nothing to act on.
  assert.match(r.message, /latest/, "the message must name the tag it checked");
  assert.match(r.message, /byte \d+/, "the message must name the byte offset that differed");
  assert.equal(typeof r.offset, "number");
});

test("QA-F14-G2(c) · NO section at all → publish REFUSES", () => {
  const r = evaluateGate({ fetched: "# Agent contract\n\nnothing generated here\n", expected: EXPECTED });
  assert.equal(r.outcome, OUTCOME.REFUSE);
  assert.equal(r.reason, "absent");
  assert.match(r.message, /latest/);
});

test("QA-F14-G2(d) · an UNREACHABLE tag REFUSES and does NOT fall through to `assume fine`", () => {
  // ⚠ THE ARM THIS CASE EXISTS FOR.
  //
  // A gate whose failure mode on an unreachable input is "proceed" is not a gate.
  // D-The-publish-gate-enforces-content-before-packaging calls it "structural
  // rather than a promise"; a fetch that silently succeeds-on-error turns it back
  // into a promise, and nobody finds out until a package ships ahead of its content.
  for (const error of [
    "fatal: could not read from remote repository",
    "ssh: connect to host github.com port 22: Network is unreachable",
    "fatal: couldn't find remote ref latest",
    "error: RPC failed; curl 56 Recv failure",
  ]) {
    const r = evaluateGate({ fetched: undefined, expected: EXPECTED, error });
    assert.equal(
      r.outcome,
      OUTCOME.REFUSE,
      `an unreachable tag (${error}) must REFUSE, never proceed`,
    );
    assert.equal(r.reason, "unreachable");
    assert.match(r.message, /latest/);
  }

  // And explicitly: an empty/absent body with no error is still not a pass.
  assert.equal(evaluateGate({ fetched: "", expected: EXPECTED }).outcome, OUTCOME.REFUSE);
  assert.equal(evaluateGate({ fetched: undefined, expected: EXPECTED }).outcome, OUTCOME.REFUSE);
});

test("QA-F14-G2 · an unclosed BEGIN marker is not a section", () => {
  // Would otherwise swallow the rest of AGENTS.md into the generated region and
  // compare a much larger string, which fails for the wrong reason.
  const unclosed = `# A\n\n<!-- BEGIN recognition (generated from recognition.md — do not edit here) -->\ncontent\n`;
  const r = evaluateGate({ fetched: unclosed, expected: EXPECTED });
  assert.equal(r.outcome, OUTCOME.REFUSE);
  assert.equal(r.reason, "absent");
  assert.equal(extractSection(unclosed), null);
});

// ---------------------------------------------------------------------------
// QA-F14-G2(e) · the assertion is made against the TAG, not against `main`
// ---------------------------------------------------------------------------

test("QA-F14-G2(e) · a correct `main` with a LAGGING tag still REFUSES", { timeout: 60_000 }, () => {
  // ⚠ THE PROPERTY THE OTHER FOUR ARMS CANNOT SHOW, and it needs a real repository.
  //
  // Creators receive THE TAG. A gate satisfied by an unreleased branch protects
  // nothing: `main` could carry the section for weeks while every scaffold still
  // clones a tag without it. So this builds a scratch template repo where `main`
  // is CORRECT and the tag LAGS, and asserts the gate still refuses.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "f14-g2-tag-"));
  const remote = path.join(tmp, "v2-template");
  try {
    mkdirSync(remote, { recursive: true });
    const git = (...args) =>
      execFileSync("git", ["-C", remote, ...args], { encoding: "utf8", stdio: "pipe" });

    execFileSync("git", ["init", "-q", "-b", "main", remote], { stdio: "pipe" });
    git("config", "user.email", "qa@example.test");
    git("config", "user.name", "QA");

    // 1. The OLD state: an AGENTS.md with NO recognition section. Tagged `latest`.
    writeFileSync(path.join(remote, "AGENTS.md"), "# Agent contract\n\nold, no section\n");
    git("add", "-A");
    git("commit", "-q", "-m", "old");
    git("tag", "latest");

    // 2. `main` MOVES FORWARD to the correct content. The tag does NOT follow.
    writeFileSync(
      path.join(remote, "AGENTS.md"),
      `# Agent contract\n\n${EXPECTED}\n`,
    );
    git("add", "-A");
    git("commit", "-q", "-m", "correct on main, tag left behind");

    // Sanity: main really does carry the right bytes, so a gate reading main WOULD pass.
    const onMain = git("show", "main:AGENTS.md");
    assert.equal(
      extractSection(onMain),
      EXPECTED,
      "the fixture is wrong: main must carry the correct section for this case to mean anything",
    );

    // 3. THE ASSERTION: the gate reads the TAG and refuses.
    const { fetched, error } = fetchTemplateAgents({ remote, tag: "latest" });
    const r = evaluateGate({ fetched, error, expected: EXPECTED });
    assert.equal(
      r.outcome,
      OUTCOME.REFUSE,
      "the gate PASSED against a lagging tag whose main happened to be correct. It is reading " +
        "the branch, not the tag — so a package could publish before any creator's scaffold " +
        "carried the content, which is the exact ordering FORK-5 made structural.",
    );

    // 4. And the complement, so the case is not merely "it always refuses":
    //    move the tag ONTO the correct commit and the gate proceeds.
    git("tag", "-f", "latest", "main");
    const ok = fetchTemplateAgents({ remote, tag: "latest" });
    const r2 = evaluateGate({ ...ok, expected: EXPECTED });
    assert.equal(
      r2.outcome,
      OUTCOME.PROCEED,
      `the gate must PASS once the tag carries the section: ${r2.message}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("QA-F14-G2 · the fetch reads a TAG from a REMOTE, never a local checkout", () => {
  // Structural, on the source: `git archive --remote=<remote> <tag>` cannot
  // consult a local branch, which is what makes (e) a property rather than a rule
  // the caller has to remember.
  const src = readFileSync(path.join(REPO, "build/publish-gate.mjs"), "utf8");
  // Read the EXECUTABLE lines: drop whole-line `//` comments and nothing else.
  //
  // Two regexes were tried here and both were wrong in a way worth recording,
  // because each failed for a reason unrelated to the subject — the QA-F3-G13
  // shape. `//.*$` also eats the `//` inside `https://github.com/...`, deleting
  // the very `--remote` this case looks for; and a `/\*[\s\S]*?\*\//` sweep
  // matched across the file's URL-bearing lines and stripped it to nothing, so
  // the assertion "failed" against an empty string. Line filtering is enough.
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

  assert.match(
    code,
    /archive[\s\S]{0,120}--remote/,
    "the gate must fetch with `git archive --remote=<remote> <tag>` — a fetch that consults a " +
      "local checkout could be satisfied by an unreleased branch, which is arm (e)'s whole point",
  );
  assert.doesNotMatch(
    code,
    /\brev-parse\s+(HEAD|main)\b|\bshow\s+main:/,
    "the gate must not read a local branch",
  );
});

// ---------------------------------------------------------------------------
// The end-to-end arm against the REAL template — network, read-only
// ---------------------------------------------------------------------------

test(
  "QA-F14-G2 · against the real v2-template@latest, the gate reaches a DEFINITE verdict",
  { timeout: 120_000 },
  (t) => {
    // Not asserted PASS: at the time this runs the template tag may legitimately
    // predate the section, and the correct behavior then is REFUSE. What IS
    // asserted is that the gate produces one of its two real verdicts rather than
    // throwing, hanging, or silently proceeding on a network problem — the failure
    // mode arm (d) covers in the abstract and this covers against the real remote.
    const { fetched, error } = fetchTemplateAgents();
    const r = evaluateGate({ fetched, error, expected: EXPECTED });

    assert.ok(
      r.outcome === OUTCOME.PROCEED || r.outcome === OUTCOME.REFUSE,
      "the gate must reach a definite verdict against the real remote",
    );
    assert.ok(typeof r.message === "string" && r.message.length > 0);

    if (r.outcome === OUTCOME.REFUSE) {
      t.diagnostic(
        `v2-template@latest does not yet carry this assembly (${r.reason}). This is the EXPECTED ` +
          `state until the template tag is cut — implementation.md §11 orders the tag before the ` +
          `package publish. The gate is working: it is refusing.`,
      );
    }
  },
);

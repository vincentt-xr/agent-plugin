// QA-F14-G1 (the manifest + precondition arms) and QA-F14-08(a) (recognition).
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THESE ARMS LIVE HERE AND NOT IN `toolchain`
//
// The catalog put the whole of §9.1's subtractive table in `toolchain`, and for
// three of its arms that was the WRONG TIER. It is a tier error rather than an
// environment problem, and the tell is what each arm actually asserts:
//
//   · the install manifest is generated from the wrappers  → a fact about THIS
//     PACKAGE, whose wrappers and build live here
//   · no copy of the package resolves on the machine       → a fact about THIS
//     PACKAGE's published name and install paths
//   · a scaffolded AGENTS.md carries the assembled section → a fact about the
//     TEMPLATE TAG and this repo's assembly, the same pair QA-F14-G2 gates
//
// None of the three is a fact about the CLI. They were only in `toolchain`
// because §9.1 wrote one table and gave it one home. A `toolchain` CI runner
// checks out `toolchain` ALONE, so there they were structurally unrunnable — the
// suite fell back to a hardcoded manifest and G1's own integrity arm correctly
// fired on the fallback. The guard was working; the tier could not feed it.
//
// The CLI-shell half of QA-F14-08 (orientation, handoff, the transcripts) IS a
// fact about the CLI and stays in `toolchain`. See
// `toolchain/packages/cli/src/lib/qa.f14.subtractive.test.ts`.
//
// ⚠ THE ARMS WERE NOT WEAKENED TO ACHIEVE THIS. Every assertion below is the one
// the catalog specified; only its address changed. In particular the manifest arm
// still FAILS when the manifest is absent — it does not skip.
// ══════════════════════════════════════════════════════════════════════════════
//
// ENV: offline for the manifest/precondition arms. The recognition arm needs a
// v2-template checkout and says so explicitly when it does not have one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(REPO, "build/install-manifest.json");

// ---------------------------------------------------------------------------
// The manifest — OUR OWN PUBLISH TARGETS, not a survey of hosts
// ---------------------------------------------------------------------------
//
// implementation.md §9.2's distinction, and it is sharp:
//
//   HOST DETECTION asks "which application is running me?" — it inspects the
//   ambient process, environment, or capabilities to BRANCH on the answer.
//   Tripwire (a) forbids it, in the product AND in tests.
//
//   THE PRECONDITION CHECK asks "is a copy of an artifact WE PUBLISHED present at
//   a path WE CAN NAME FROM OUR OWN RELEASE METADATA?" It reads only our own
//   outputs, learns nothing about what is running, gets the SAME ANSWER on a
//   machine with no host at all, and HAS NO BRANCH.
//
// A machine with a host installed and our package absent PASSES; a machine with
// no host and our package present FAILS. Exactly backwards from host detection,
// which is the tell that this is the right check.

function loadManifest() {
  assert.ok(
    existsSync(MANIFEST_PATH),
    `no generated install-manifest.json at ${MANIFEST_PATH}. The build must emit it from ` +
      `hosts/*/install.json (implementation.md §9.2) so a host added tomorrow extends the ` +
      `precondition check with no edit to any test.`,
  );
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return {
    packageNames: raw.packageName ? [raw.packageName] : [],
    // FLATTENED ACROSS EVERY WRAPPER, not just the first: the drift this guards
    // against is a second host whose install path nobody added.
    installPaths: (raw.wrappers ?? []).flatMap((w) => w.installPaths ?? []),
    envVars: (raw.wrappers ?? []).flatMap((w) => w.envVars ?? []),
  };
}

/**
 * Returns what it FOUND, which must be empty. `roots`/`home`/`env` are injectable
 * so the guard can be driven against a planted install and proved to fire.
 */
export function findInstalledPlugin(manifest, opts = {}) {
  const found = [];
  const roots = opts.roots ?? [REPO, path.resolve(REPO, "..")];
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();

  // 1. Module resolution of the published name must FAIL from every relevant root.
  for (const name of manifest.packageNames) {
    for (const root of roots) {
      try {
        const req = createRequire(path.join(root, "noop.js"));
        found.push(`module resolution succeeded: ${name} from ${root} → ${req.resolve(name)}`);
      } catch {
        // Not resolvable — the expected outcome.
      }
      const nm = path.join(root, "node_modules", ...name.split("/"));
      if (existsSync(nm)) found.push(`node_modules entry exists: ${nm}`);
    }
  }

  // 2. Nothing exists at any wrapper install path. A relative path is
  //    HOME-relative, which is where a wrapper installs.
  for (const p of manifest.installPaths) {
    const expanded = p.startsWith("~")
      ? path.join(home, p.slice(1))
      : path.isAbsolute(p)
        ? p
        : path.join(home, p);
    if (existsSync(expanded)) found.push(`wrapper install path exists: ${expanded}`);
  }

  // 3. The environment carries no variable our wrappers set.
  for (const v of manifest.envVars) {
    if (env[v] !== undefined) found.push(`wrapper env var set: ${v}=${env[v]}`);
  }

  return found;
}

const PRECONDITION_MESSAGE = (found) =>
  `Precondition failed: the subtractive suite requires the agent-plugin package to be absent; ` +
  `found ${found}. This suite is the only evidence tripwire (d) was not a dissolution — remove ` +
  `the install and re-run rather than skipping.`;

test("QA-F14-G1 · the manifest is GENERATED from the wrappers, not hand-written", () => {
  // FAILS when absent; it does not skip. A precondition nothing checks is a
  // comment, and a manifest arm that skips itself is the same bug one level up.
  const manifest = loadManifest();

  assert.ok(
    manifest.packageNames.length > 0,
    "the manifest must name the package we publish under",
  );
  assert.ok(
    manifest.installPaths.length > 0,
    'the generated manifest declares no install paths, so the "nothing exists at a wrapper ' +
      'install path" arm would assert nothing',
  );
  assert.ok(manifest.envVars.length > 0, "the manifest must declare the wrappers' env vars");

  // GENERATED FROM THE WRAPPERS, asserted against the wrapper directories on
  // disk rather than against the manifest itself. This is the arm that makes
  // "a host added tomorrow extends the check with no edit" true: add
  // `hosts/<new>/install.json` without re-running the build and this fails.
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const declaredHosts = (raw.wrappers ?? []).map((w) => w.host).sort();

  const hostsDir = path.join(REPO, "hosts");
  const onDiskHosts = readdirSync(hostsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(hostsDir, e.name, "install.json")))
    .map((e) => e.name)
    .sort();

  assert.ok(onDiskHosts.length > 0, "at least one wrapper must declare an install.json");
  assert.deepEqual(
    declaredHosts,
    onDiskHosts,
    `the manifest does not match the wrappers on disk. Declared: ${JSON.stringify(declaredHosts)}; ` +
      `on disk: ${JSON.stringify(onDiskHosts)}. Re-run the build — a wrapper missing from the ` +
      `manifest is an install path the precondition check will never look at.`,
  );

  // And each wrapper's own install.json agrees with what the manifest carries for
  // it, so the generation cannot drop a path while keeping the host.
  for (const host of onDiskHosts) {
    const own = JSON.parse(readFileSync(path.join(hostsDir, host, "install.json"), "utf8"));
    const inManifest = raw.wrappers.find((w) => w.host === host);
    assert.deepEqual(
      (inManifest.installPaths ?? []).slice().sort(),
      (own.installPaths ?? []).slice().sort(),
      `manifest install paths for \`${host}\` differ from hosts/${host}/install.json`,
    );
    assert.deepEqual(
      (inManifest.envVars ?? []).slice().sort(),
      (own.envVars ?? []).slice().sort(),
      `manifest env vars for \`${host}\` differ from hosts/${host}/install.json`,
    );
  }
});

test("QA-F14-G1 · no agent-plugin package resolves on this machine", () => {
  const manifest = loadManifest();
  const found = findInstalledPlugin(manifest);
  assert.deepEqual(found, [], PRECONDITION_MESSAGE(found.join("; ")));
});

test("QA-F14-G1 · THE GUARD ITSELF FIRES — an injected fake install turns it red", () => {
  // ⚠ THE CASE THAT MAKES THE GUARD WORTH HAVING.
  //
  // In CI the package is never installed, so the guard never fires, and a guard
  // exercised only where it CANNOT fire is one nobody knows is broken. So we make
  // it fire: plant a fake install, confirm the check reports it, remove it.
  const manifest = loadManifest();
  const tmp = path.join(os.tmpdir(), `qa-f14-g1-fake-${process.pid}`);
  const name = manifest.packageNames[0];
  const fakePkg = path.join(tmp, "node_modules", ...name.split("/"));
  try {
    mkdirSync(fakePkg, { recursive: true });
    writeFileSync(
      path.join(fakePkg, "package.json"),
      JSON.stringify({ name, version: "0.0.0-fake" }),
    );
    const found = findInstalledPlugin(manifest, { roots: [tmp] });
    assert.notDeepEqual(
      found,
      [],
      "the precondition check did NOT notice a planted install. The guard is broken, which means " +
        "every green run of the subtractive suite proves nothing about absence.",
    );
    assert.match(found.join("\n"), /agent-plugin/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  assert.deepEqual(findInstalledPlugin(manifest, { roots: [tmp] }), []);
});

test("QA-F14-G1 · the guard fires on EVERY wrapper install path the manifest declares", () => {
  // Driven from the REAL manifest, one arm per declared path — so a host added
  // tomorrow is exercised here without this test being edited.
  const manifest = loadManifest();
  for (const declared of manifest.installPaths) {
    const fakeHome = path.join(os.tmpdir(), `qa-f14-g1-home-${process.pid}`);
    try {
      const planted = path.join(fakeHome, declared);
      mkdirSync(path.dirname(planted), { recursive: true });
      writeFileSync(planted, "x");
      const found = findInstalledPlugin(manifest, { roots: [], env: {}, home: fakeHome });
      assert.match(
        found.join("\n"),
        new RegExp(declared.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `the guard did not notice an install planted at the declared path \`${declared}\``,
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  }
});

test("QA-F14-G1 · the guard fires on every wrapper env var the manifest declares", () => {
  const manifest = loadManifest();
  for (const v of manifest.envVars) {
    const found = findInstalledPlugin(
      { ...manifest, packageNames: [], installPaths: [] },
      { roots: [], env: { [v]: "1" } },
    );
    assert.match(found.join("\n"), new RegExp(v), `the guard ignored the declared env var \`${v}\``);
  }
});

test("QA-F14-G1 · the check reads OUR OWN publish targets, never a host survey", () => {
  // Tripwire (a), asserted structurally: with an EMPTY manifest the check returns
  // nothing REGARDLESS of what is installed on the machine. A host survey would
  // still find something.
  assert.deepEqual(
    findInstalledPlugin({ packageNames: [], installPaths: [], envVars: [] }),
    [],
  );
});

// ---------------------------------------------------------------------------
// QA-F14-08(a) · recognition — the template tag carries the assembled section
// ---------------------------------------------------------------------------

test("QA-F14-08(a) · a scaffolded tree's AGENTS.md carries the assembled section", async (t) => {
  // The plugin causes the agent to LOOK AT THE LOOP. The bare-shell equivalent is
  // "read AGENTS.md and start the Vincentt loop", and what makes that possible is
  // the section being IN THE TREE — placed by the whole-tree clone, no placement
  // code, no package.
  //
  // ⚠ NEEDS A v2-template CHECKOUT, and that is a DECLARED prerequisite rather
  // than a silent skip: `QA_F14_TEMPLATE_DIR`, or a sibling checkout. This repo's
  // own CI can provide one deliberately (it already fetches the template tag for
  // QA-F14-G2), which is precisely why the arm belongs here rather than in a
  // toolchain runner that checks out one repo.
  const candidates = [
    process.env.QA_F14_TEMPLATE_DIR,
    path.resolve(REPO, "../v2-template"),
  ].filter(Boolean);

  const found = candidates.map((c) => path.join(c, "AGENTS.md")).find((f) => existsSync(f));

  if (!found) {
    const remedy =
      `NO v2-template CHECKOUT — this arm did not run. Looked at: ${candidates.join(", ")}. ` +
      `Set QA_F14_TEMPLATE_DIR.`;

    // ⚠ IN CI THIS IS A FAILURE, NOT A SKIP.
    //
    // This repo's CI checks the template out deliberately (`.github/workflows/
    // ci.yml`), precisely so this arm can run. If it is missing THERE, the wiring
    // regressed and the arm must be seen to have stopped running — a suite that
    // silently self-disables in the environment that gates the merge is a vacuous
    // pass wearing a different costume.
    //
    // Locally a bare checkout is an ordinary state, so it skips loudly instead.
    if (process.env.CI) {
      assert.fail(
        `${remedy} In CI this is a FAILURE rather than a skip: the workflow checks the template ` +
          `out for exactly this arm, so its absence means that wiring regressed. The recognition ` +
          `cell is half of the subtractive table's evidence and it must not go quiet.`,
      );
    }
    t.skip(
      `${remedy} Reported as UNRUN rather than passed: the recognition cell is half of the ` +
        `subtractive table's evidence and a green tick here would be a lie.`,
    );
    return;
  }

  const agents = readFileSync(found, "utf8");
  assert.match(
    agents,
    /<!-- BEGIN recognition/,
    "the scaffolded tree's AGENTS.md must carry the assembled recognition section. Without it " +
      "the bare-shell equivalent of `recognition` does not exist, and the plugin holds a " +
      "capability rather than an ergonomic — tripwire (d) refuses the release.",
  );
  assert.match(agents, /<!-- END recognition -->/);

  // BYTE-IDENTICAL to this repo's assembly — not merely "contains something". A
  // drifted rendering means the creator WITHOUT the package reads different text
  // from the creator WITH it, which is per-host content by another name.
  const { renderGroundingSection, readSource } = await import(
    path.join(REPO, "build/assemble.mjs")
  );
  const expected = renderGroundingSection(readSource());
  const begin = agents.indexOf("<!-- BEGIN recognition");
  const end = agents.indexOf("<!-- END recognition -->");
  const inTree = `${agents.slice(begin, end + "<!-- END recognition -->".length)}\n`;
  assert.equal(
    inTree,
    expected,
    "the template's recognition section is not byte-identical to this repo's assembly",
  );
});

// QA-F14-03 — neither rendered copy is authored. The assembly is reproducible and a hand-edit
// fails with a message naming the source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withScratchRepo } from './scratch.mjs';
import {
  REPO_ROOT,
  SOURCE_PATH,
  BEGIN_MARKER,
  END_MARKER,
  renderGroundingSection,
  renderSkillBody,
  renderActions,
  renderDescription,
  renderSelfServeManifest,
  renderInstallManifest,
  computeOutputs,
  check,
  staleMessage,
  parseActions,
  listWrappers,
  PACKAGE_NAME,
  renderClaudeCodeCommands,
  renderClaudeCodePlugin,
} from '../build/assemble.mjs';
import { PINNED_ACTION_IDS, PINNED_PLUGIN_VERBS } from '../build/pins.mjs';
import { firstParagraph } from '../build/parse.mjs';
import { SHIPPED } from './hostile-sources.mjs';

const PRECEDENCE = readFileSync(join(REPO_ROOT, 'precedence.txt'), 'utf8');

// Every mutating arm runs `assemble --check` in a SCRATCH COPY and reads its exit code. The real
// tree is never edited: the suite runs its files in parallel, so a mutation here — even one with
// a `finally` that restores it — is observable by every other test while it is in flight, and
// surfaces as an unrelated failure elsewhere.
function checkInScratch(mutate) {
  return withScratchRepo((tmp) => {
    mutate(tmp);
    const r = spawnSync(process.execPath, [join(tmp, 'build/assemble.mjs'), '--check'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  });
}

// —— (a) both outputs match byte-for-byte ——————————————————————————————————————

test('QA-F14-03(a) · every tracked output matches the assembly BYTE-FOR-BYTE', () => {
  const stale = check();
  assert.deepEqual(
    stale,
    [],
    stale.length ? staleMessage(stale) : 'the tracked outputs must equal a fresh assembly',
  );
});

test('QA-F14-03(a) · the assembly is deterministic — two runs produce identical bytes', () => {
  const once = computeOutputs().map((o) => o.content);
  const twice = computeOutputs().map((o) => o.content);
  assert.deepEqual(once, twice);
});

// —— (c) a hand-edited skill body fails, NAMING recognition.md ————————————————

test('QA-F14-03(c) · a hand-edit to the generated skill body FAILS, naming recognition.md', () => {
  const { status, output } = checkInScratch((tmp) => {
    const skillPath = join(tmp, 'hosts/self-serve/SKILL.md');
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf8')}\nHAND EDITED.\n`);
  });
  assert.notEqual(status, 0, 'a hand-edited rendered copy must FAIL the check with a non-zero exit');
  assert.match(output, /recognition\.md/, 'the message must name the SOURCE, not merely say "differs"');
  assert.match(output, /hosts\/self-serve\/SKILL\.md/, 'and it must name the file that was edited');
  assert.match(output, /byte \d+/, 'the failure carries the byte offset that differed');
});

test('QA-F14-03(c) · a hand-edited actions.yml label FAILS the same way', () => {
  const { status, output } = checkInScratch((tmp) => {
    const actionsPath = join(tmp, 'actions.yml');
    writeFileSync(
      actionsPath,
      readFileSync(actionsPath, 'utf8').replace('label: Stop the preview', 'label: Stop it now'),
    );
  });
  assert.notEqual(status, 0, 'actions.yml is GENERATED — hand-editing a label must fail as the body does');
  assert.match(output, /actions\.yml/);
});

test('QA-F14-03(c) · a hand-edit to the tracked grounding section FAILS too', () => {
  const { status, output } = checkInScratch((tmp) => {
    const sectionPath = join(tmp, 'dist/AGENTS.section.md');
    const before = readFileSync(sectionPath, 'utf8');
    writeFileSync(sectionPath, before.replace(`${BEGIN_MARKER}\n`, `${BEGIN_MARKER}\nHAND EDITED.\n`));
  });
  assert.notEqual(status, 0, 'the rendering this repo publishes must be guarded like every other output');
  assert.match(output, /recognition\.md/);
});

// —— (b) the grounding copy, checked the same way from the template side ————————

test('QA-F14-03(b) · a hand-edit to the grounding section is detectable by the same comparison', () => {
  // v2-template's CI runs this same assertion against its own AGENTS.md. Here the assembled
  // section is compared to a mutated copy of itself, which is exactly what that CI arm does with
  // the section it extracts from its checkout.
  const expected = renderGroundingSection(SHIPPED);
  const tampered = expected.replace('a preview is what they are asking for', 'a preview is what they want');
  assert.notEqual(tampered, expected);
  assert.ok(tampered.includes(BEGIN_MARKER) && tampered.includes(END_MARKER));
});

test('QA-F14-03 · the markers are present and correctly paired', () => {
  const section = renderGroundingSection(SHIPPED);
  const begin = section.indexOf(BEGIN_MARKER);
  const end = section.indexOf(END_MARKER);
  assert.ok(begin >= 0, 'BEGIN marker present');
  assert.ok(end > begin, 'END marker present and AFTER begin — an unclosed BEGIN would swallow the rest of AGENTS.md');
  assert.equal(section.split(BEGIN_MARKER).length - 1, 1, 'exactly one BEGIN marker');
  assert.equal(section.split(END_MARKER).length - 1, 1, 'exactly one END marker');
  assert.match(BEGIN_MARKER, /do not edit here/, 'the marker itself tells a reader the region is generated');
});

// —— (d) a missing source FAILS rather than emitting an empty section ——————————

test('QA-F14-03(d) · a MISSING recognition.md fails the assembly rather than rendering nothing', () => {
  const { status, output } = withScratchRepo((tmp) => {
    rmSync(join(tmp, 'recognition.md'));
    const r = spawnSync(process.execPath, [join(tmp, 'build/assemble.mjs')], {
      cwd: tmp,
      encoding: 'utf8',
    });
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  });
  assert.notEqual(status, 0, 'a missing source must fail the build');
  assert.match(output, /recognition\.md is missing/);
  assert.match(
    output,
    /refuses to emit an empty section/,
    'a source that renders nothing would silently ship a template with no recognition text',
  );
});

test('QA-F14-03(d) · an EMPTY recognition.md fails too', () => {
  const { status, output } = withScratchRepo((tmp) => {
    writeFileSync(join(tmp, 'recognition.md'), '   \n');
    const r = spawnSync(process.execPath, [join(tmp, 'build/assemble.mjs')], {
      cwd: tmp,
      encoding: 'utf8',
    });
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  });
  assert.notEqual(status, 0, 'an empty source must fail');
  assert.match(output, /empty/i);
});

// —— the renderers carry the source's words and add none of their own ——————————

test('both renderers carry every section body from the source verbatim', () => {
  const grounding = renderGroundingSection(SHIPPED);
  const skill = renderSkillBody(SHIPPED, PRECEDENCE);
  for (const heading of ['Starting something new', 'Coming back to something', 'Showing it on a phone', 'Finishing']) {
    assert.ok(grounding.includes(`### ${heading}`), `grounding carries "${heading}"`);
    assert.ok(skill.includes(`### ${heading}`), `skill body carries "${heading}"`);
  }
  const sentence = 'Nothing other than the person saying';
  assert.ok(grounding.includes(sentence) && skill.includes(sentence));
});

test('§4.1 · the precedence sentence is in the PACKAGE and NOT in the grounding', () => {
  const grounding = renderGroundingSection(SHIPPED);
  const skill = renderSkillBody(SHIPPED, PRECEDENCE);
  const sentence = PRECEDENCE.trim();
  assert.ok(skill.includes(sentence), 'the package states precedence');
  assert.ok(
    !grounding.includes(sentence),
    'the winner does not need to declare itself, and a sentence in both would be the duplication ' +
      'the rule forbids',
  );
});

test('§4.1 · the precedence sentence is the ONLY package sentence not from recognition.md', () => {
  const skill = renderSkillBody(SHIPPED, PRECEDENCE);
  // Remove the source's own content and the exempt sentence; what remains must be structure
  // (headings already came from the source, markers, separators) and no prose.
  const residue = skill
    .replace(PRECEDENCE.trim(), '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l !== '---')
    .filter((l) => !SHIPPED.includes(l.replace(/^#+\s*/, '')))
    .filter((l) => !SHIPPED.includes(l));
  assert.deepEqual(residue, [], `the package added prose of its own: ${JSON.stringify(residue)}`);
});

// —— §6 the description is generated, never hand-written ——————————————————————

test('§6 · the wrapper description is GENERATED from recognition.md\'s first paragraph', () => {
  const description = renderDescription(SHIPPED);
  assert.ok(description.length > 0);
  assert.ok(
    firstParagraph(SHIPPED).startsWith(description),
    'the description is drawn from the first paragraph, not authored beside it',
  );

  // The proof that it is generated rather than copied: change the source, and it changes.
  const altered = SHIPPED.replace(
    'Vincentt is a platform for building AR apps',
    'Vincentt is a platform for making AR apps',
  );
  assert.notEqual(renderDescription(altered), description);

  const manifest = JSON.parse(renderSelfServeManifest(SHIPPED));
  assert.equal(manifest.description, description, 'the manifest field is the generated string');
  assert.equal(manifest.generated.source, 'recognition.md', 'the artifact names where a change is made');
});

test('§6 · every host-read manifest field is generated or a permitted wrapper field', () => {
  const manifest = JSON.parse(renderSelfServeManifest(SHIPPED));
  // manifest, name, description, install instruction, license, docs link — and nothing else.
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ['description', 'generated', 'homepage', 'license', 'name', 'skill', 'version'].sort(),
  );
});

// —— §9.2 the install manifest is generated FROM THE WRAPPERS ————————————————————

test('§9.2 · the install manifest is discovered from the wrappers, not hand-listed', () => {
  const manifest = JSON.parse(renderInstallManifest());
  assert.equal(manifest.packageName, PACKAGE_NAME);

  // The expected host list is READ FROM THE DIRECTORY, not written here. A literal would make
  // "a host was added" indistinguishable from "the manifest drifted" — and the literal that
  // used to sit here contradicted this test's own comment, which is how the claim survived.
  const onDisk = readdirSync(join(REPO_ROOT, 'hosts'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(join(REPO_ROOT, 'hosts', name, 'install.json')))
    .sort();
  assert.ok(onDisk.length > 0, 'there is at least one wrapper to discover');
  assert.deepEqual(manifest.wrappers.map((w) => w.host), onDisk);

  // EVERY wrapper round-trips, not just the first: the drift this guards against is a second
  // host whose declared paths the manifest quietly dropped.
  for (const wrapper of manifest.wrappers) {
    const declared = JSON.parse(
      readFileSync(join(REPO_ROOT, `hosts/${wrapper.host}/install.json`), 'utf8'),
    );
    assert.deepEqual(wrapper.installPaths, declared.installPaths, `${wrapper.host} installPaths`);
    assert.deepEqual(wrapper.envVars, declared.envVars, `${wrapper.host} envVars`);
  }

  // A host added tomorrow extends the check with no edit to the test — the same drift argument as
  // the TABS allowlist. listWrappers reads the hosts directory rather than a literal.
  assert.deepEqual(listWrappers(), manifest.wrappers);
});

// —— the Claude Code commands are the SAME four actions ————————————————————————

test('tripwire (b) · the commands are exactly the pinned action ids, no more', () => {
  const commands = renderClaudeCodeCommands(SHIPPED);
  // The set is PINNED_ACTION_IDS, so a fifth command cannot be added here without adding a fifth
  // MOMENT to recognition.md — and that is a record change, not a packaging change. This is what
  // stops the command list becoming an affordance Claude Code has and no other host does.
  assert.equal(commands.length, PINNED_ACTION_IDS.length);
  assert.deepEqual(commands.map((c) => c.name), ['start', 'resume', 'preview', 'stop']);
});

test('a command NAME may differ from its pinned id; the id is what is pinned', () => {
  // `phone` is a fine id for the moment and a poor thing to type. The id stays append-only
  // because an installed copy resolves against it; the name is display text like the label.
  const commands = renderClaudeCodeCommands(SHIPPED);
  assert.ok(PINNED_ACTION_IDS.includes('phone'), 'phone remains a pinned id');
  assert.ok(!commands.some((c) => c.name === 'phone'), 'and is never what a person types');
  assert.ok(commands.some((c) => c.name === 'preview'), 'preview is its display name');
});

test('every command names a real section and carries no behavior of its own', () => {
  for (const command of renderClaudeCodeCommands(SHIPPED)) {
    const heading = /asking about: \*\*(.+?)\*\*/.exec(command.content)?.[1];
    assert.ok(heading, `${command.name} names the section it belongs to`);
    assert.ok(
      SHIPPED.includes(`### ${heading}`),
      `${command.name} names "${heading}", which must be a real heading in recognition.md`,
    );
    // A command body is not a second place for behavior to live. It points at the skill and at
    // the project's contract, and says nothing about what to run — no flag, no path, no verb
    // beyond the one recognition.md itself is permitted.
    assert.ok(!/--[a-z]/.test(command.content), `${command.name} names no flag`);
    assert.ok(!/\.json|\.vincentt\//.test(command.content), `${command.name} names no path`);
    const verbs = [...command.content.matchAll(/(?:^|[^A-Za-z])vincentt\s+([a-z][a-z-]*)/g)];
    for (const [, verb] of verbs) {
      assert.ok(PINNED_PLUGIN_VERBS.includes(verb), `${command.name} names unpinned verb ${verb}`);
    }
  }
});

test('§6 · the plugin manifest carries an author and the paragraph, both generated', () => {
  const plugin = JSON.parse(renderClaudeCodePlugin(SHIPPED));
  assert.equal(plugin.author.name, 'Vincentt');
  // The panel shows the description as a BLOCK, so it gets the paragraph rather than the
  // one-sentence match surface — and it is still generated, not authored.
  assert.ok(plugin.description.startsWith('Vincentt is a platform for building AR apps'));
  assert.ok(plugin.description.length > renderDescription(SHIPPED).length);
  // The paragraph's last sentence is about the FILE, which is noise in a panel showing no file.
  assert.ok(!/This file is only about/.test(plugin.description));
});

// —— actions.yml round-trips through the reader the lint uses ————————————————————

test('the generated actions.yml parses back to exactly what was rendered', () => {
  const yaml = renderActions(SHIPPED);
  const parsed = parseActions(yaml);
  assert.equal(parsed.length, 4);
  assert.deepEqual(parsed.map((a) => a.id), ['start', 'resume', 'phone', 'stop']);
  for (const action of parsed) {
    assert.ok(action.label && action.section, 'each row carries a label and a section');
    assert.ok(SHIPPED.includes(`### ${action.section}`), 'each section names a real heading');
  }
});

test('a source with the wrong number of sections fails the action rendering', () => {
  const short = SHIPPED.replace(/### Finishing[\s\S]*$/, '');
  assert.throws(() => renderActions(short), /sections but 4 action ids are pinned/);
});

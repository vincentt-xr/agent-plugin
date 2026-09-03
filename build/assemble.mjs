#!/usr/bin/env node
// The assembler — implementation.md §3. Renders every output from recognition.md.
//
// Neither rendered copy is authored. A contributor cannot add a sentence to the plugin without
// adding it to recognition.md, and adding it there puts it in the grounding at the next template
// tag. `--check` re-runs the render and compares against the tracked outputs byte-for-byte; a
// hand-edit fails with a message naming the source.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecognition, firstParagraph, splitSentences } from './parse.mjs';
import { isMain } from './is-main.mjs';
import { PINNED_ACTION_IDS } from './pins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..');

export const BEGIN_MARKER = '<!-- BEGIN recognition (generated from recognition.md — do not edit here) -->';
export const END_MARKER = '<!-- END recognition -->';

export const SOURCE_PATH = join(REPO_ROOT, 'recognition.md');
export const PRECEDENCE_PATH = join(REPO_ROOT, 'precedence.txt');

// The published package name. The subtractive precondition (§9.2) resolves this from our own
// release metadata — it is a fact about what WE publish, never a probe of what is running.
export const PACKAGE_NAME = '@vincentt-xr/agent-plugin';

// Shared by every wrapper manifest. A per-wrapper literal is how two hosts end up published at
// two versions from one commit, which is the drift the whole hosts/ shape exists to prevent.
export const PACKAGE_VERSION = '0.1.0';
export const HOMEPAGE = 'https://github.com/vincentt-xr/agent-plugin';

// The ids are pinned; the SECTION each maps to and the LABEL each shows are read from
// recognition.md's headings in order. A heading rename therefore moves the label and leaves the
// id alone, which is exactly QA-F14-G3's rule expressed as code rather than as a promise.
const ID_ORDER = PINNED_ACTION_IDS;

// The label is a menu row, not the heading verbatim: a heading is a phrase in a document and a
// row is a thing a person clicks. The mapping is fixed here so it is generated, not authored.
const LABEL_FOR_ID = Object.freeze({
  start: 'Start a new AR app',
  resume: 'Pick up a project',
  phone: 'Show it on a phone',
  stop: 'Stop the preview',
});

export function readSource() {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(
      `assembly failed: recognition.md is missing at ${SOURCE_PATH}. It is the single source for ` +
        `every generated output; the assembly refuses to emit an empty section, because a ` +
        `template shipped with no recognition text fails silently in every creator's tree.`,
    );
  }
  const source = readFileSync(SOURCE_PATH, 'utf8');
  if (!source.trim()) {
    throw new Error('assembly failed: recognition.md is empty. Refusing to render an empty section.');
  }
  return source;
}

// —— renderer 1: the grounding section (v2-template/AGENTS.md) ————————————————

export function renderGroundingSection(source) {
  const doc = parseRecognition(source);
  if (!doc.title) throw new Error('assembly failed: recognition.md has no # title.');
  const parts = [BEGIN_MARKER, '', `## ${doc.title}`, ''];
  if (doc.preambleText) parts.push(doc.preambleText, '');
  for (const section of doc.sections) {
    parts.push(`### ${section.heading}`, '', section.body, '');
  }
  parts.push(END_MARKER);
  return `${parts.join('\n')}\n`;
}

// —— renderer 2: the package skill body ——————————————————————————————————————

// §4.1: the precedence sentence is the only sentence in the package not from recognition.md. It
// is in the package and not the grounding, because the winner does not need to declare itself.
export function renderSkillBody(source, precedence) {
  const doc = parseRecognition(source);
  const parts = [`# ${doc.title}`, ''];
  if (doc.preambleText) parts.push(doc.preambleText, '');
  for (const section of doc.sections) {
    parts.push(`### ${section.heading}`, '', section.body, '');
  }
  parts.push('---', '', precedence.trim(), '');
  return parts.join('\n');
}

// —— the action labels ————————————————————————————————————————————————————————

export function renderActions(source) {
  const doc = parseRecognition(source);
  if (doc.sections.length !== ID_ORDER.length) {
    throw new Error(
      `assembly failed: recognition.md has ${doc.sections.length} sections but ${ID_ORDER.length} ` +
        `action ids are pinned. The four moments are the feature; adding or removing one is a ` +
        `record change, not a packaging change.`,
    );
  }
  const rows = ID_ORDER.map((id, i) => ({
    id,
    label: LABEL_FOR_ID[id],
    section: doc.sections[i].heading,
  }));

  const header = [
    '# The action rows a creator sees in a host\'s inline action menu.',
    '#',
    '# GENERATED from recognition.md by build/assemble.mjs — this file is an OUTPUT, not an',
    '# authored artifact. A hand-edit fails the assembly check (implementation.md §4 (2)).',
    '#',
    '# Ids are PINNED and append-only: an already-installed package resolves against the id, and',
    '# nothing in this feature can reach an installed copy to rename one (QA-F14-G3, B-F3-8).',
    '# Labels are display text and may change freely.',
    '',
    'actions:',
  ];
  const body = rows.flatMap((r) => [
    `  - id: ${r.id}`,
    `    label: ${r.label}`,
    `    section: ${r.section}`,
    '',
  ]);
  return `${[...header, ...body].join('\n').replace(/\n+$/, '')}\n`;
}

// A deliberately tiny reader for the shape we generate. Adding a YAML dependency to read a file
// this repo itself wrote would be a dependency bought for nothing.
export function parseActions(yaml) {
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

// —— the wrapper (§6) —————————————————————————————————————————————————————————

// §6: the description is the one wrapper field with real weight — it is what a host matches
// against. It is GENERATED from recognition.md's first paragraph, never hand-written.
export function renderDescription(source) {
  const para = firstParagraph(source);
  const [first] = para.split(/(?<=\.)\s+/);
  return (first ?? para).trim();
}

// The long form — the WHOLE first paragraph, for surfaces that show a plugin's description as a
// block rather than a menu row. Still generated and still zero authored words: it is the same
// paragraph, not truncated. A host that shows one line gets renderDescription; a host with room
// for a paragraph gets the paragraph, and neither is a place to write new behavior.
export function renderLongDescription(source) {
  const para = firstParagraph(source);
  // The paragraph's LAST sentence is about the file itself ("this file is only about recognising
  // …") — orientation for an agent reading the source, and noise in a plugin panel that is not
  // showing a file. Dropped by position rather than by matching its words, so rewording the
  // source does not silently put it back.
  const sentences = splitSentences(para);
  return sentences.length > 1 ? sentences.slice(0, -1).join(' ') : para;
}

export function renderSelfServeManifest(source) {
  const manifest = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    description: renderDescription(source),
    license: 'MIT',
    homepage: HOMEPAGE,
    generated: {
      // Every field a host reads is generated. `source` names where a change is made, so a
      // reader who wants to edit the description learns the answer from the artifact itself.
      source: 'recognition.md',
      by: 'build/assemble.mjs',
    },
    skill: {
      body: 'SKILL.md',
      actions: 'actions.yml',
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// —— the Claude Code wrapper ——————————————————————————————————————————————————

// Claude Code loads a plugin from a marketplace repo: a root `.claude-plugin/marketplace.json`
// naming each plugin and where it lives, and a per-plugin `.claude-plugin/plugin.json` pointing
// at a skills directory. Every file below is GENERATED, for the same reason the self-serve
// manifest is: `description` is what the host matches a person's words against, and a
// hand-written one is the closest thing in this feature to platform-authored behavior.
//
// This is a MANIFEST FORMAT, not a capability. The skill body is byte-identical to the
// self-serve body — wrappers differ only in how a host is told to find it, which is what stops
// two hosts drifting into two products. Nothing here detects a host: these are the paths WE
// publish to, written unconditionally whether or not Claude Code exists on the machine.

// The skill name is the SECOND HALF of `plugin:skill` — the namespace already says `vincentt`,
// so repeating it here reads as the product name twice. `ar` is what the skill is about.
//
// The INSTALL PATH in hosts/claude-code/install.json is qualified (`vincentt-ar`) and this is
// not: inside the plugin the namespace disambiguates, but a bare `.claude/skills/ar` would make
// the subtractive precondition fire on any unrelated skill someone happened to name `ar`.
export const CLAUDE_CODE_SKILL_NAME = 'ar';
export const CLAUDE_CODE_PLUGIN_NAME = 'vincentt';
export const CLAUDE_CODE_DIR = 'dist/claude-code';

// Who publishes this. A wrapper is permitted a name, a description, an install instruction, a
// license and a docs link (§6); an author is the "name" field of a manifest, not a sentence about
// the product, so it does not count against the non-generated ceiling.
export const AUTHOR = Object.freeze({ name: 'Vincentt', url: HOMEPAGE });

// The command NAME a person types, per pinned action id. The id is the pinned surface and is
// append-only (an installed copy resolves against it); the name is display text, like the label,
// and may change freely. They are separated here because `phone` is a fine id for the moment
// "show it on a phone" and a poor thing to type — `/phone` reads as a verb for calling someone.
//
// `preview` is also the ONE verb recognition.md is permitted to name (PINNED_PLUGIN_VERBS), so
// the command a person types and the word the source is allowed to use are the same word.
const COMMAND_NAME_FOR_ID = Object.freeze({
  start: 'start',
  resume: 'resume',
  phone: 'preview',
  stop: 'stop',
});

// The frontmatter block. `name` is the skill's directory name because that is what the host
// resolves against, and `description` is the generated sentence — the same string the self-serve
// manifest carries, so the two wrappers cannot drift on the one field that has weight.
export function renderClaudeCodeSkill(source, precedence) {
  const description = renderDescription(source);
  const front = ['---', `name: ${CLAUDE_CODE_SKILL_NAME}`, `description: ${description}`, '---', ''];
  return `${front.join('\n')}\n${renderSkillBody(source, precedence)}`;
}

export function renderClaudeCodePlugin(source) {
  const plugin = {
    name: CLAUDE_CODE_PLUGIN_NAME,
    version: PACKAGE_VERSION,
    // The plugin panel shows this as a BLOCK, not a menu row, so it gets the whole paragraph.
    // The one-sentence form is what a match surface wants; this is what a reader wants.
    description: renderLongDescription(source),
    author: AUTHOR,
    license: 'MIT',
    homepage: HOMEPAGE,
    repository: `${HOMEPAGE}.git`,
    generated: { source: 'recognition.md', by: 'build/assemble.mjs' },
    skills: './skills/',
    commands: './commands/',
  };
  return `${JSON.stringify(plugin, null, 2)}\n`;
}

// —— the commands ————————————————————————————————————————————————————————————

// A host with an inline action menu renders `actions.yml`'s four rows. Claude Code has no such
// menu; it has slash commands. These are THE SAME FOUR ACTIONS in the shape this host has, not a
// fifth thing and not an affordance another host lacks — which is what keeps tripwire (b) intact.
// The set is `PINNED_ACTION_IDS`, so a command cannot be added here without adding a moment to
// recognition.md, and that is a record change.
//
// Each file is ONE generated line naming the section it belongs to. A command body is not a place
// to explain what to do: the skill already carries recognition.md, and a second copy here would be
// the duplication the whole generated-not-authored rule exists to prevent.
export function renderClaudeCodeCommands(source) {
  const doc = parseRecognition(source);
  return PINNED_ACTION_IDS.map((id, i) => {
    const section = doc.sections[i];
    const front = [
      '---',
      `name: ${COMMAND_NAME_FOR_ID[id]}`,
      `description: ${LABEL_FOR_ID[id]}`,
      '---',
      '',
    ];
    const body = [
      `The person is asking about: **${section.heading}**.`,
      '',
      `Follow the \`${CLAUDE_CODE_SKILL_NAME}\` skill's "${section.heading}" section, then the`,
      "project's own agent contract.",
      '',
    ];
    return {
      name: COMMAND_NAME_FOR_ID[id],
      content: `${[...front, ...body].join('\n')}`,
    };
  });
}

// The marketplace entry. `source` points at the generated tree rather than the repo root, so the
// thing a creator installs is an output and never the authored source beside it.
export function renderClaudeCodeMarketplace(source) {
  const marketplace = {
    name: 'vincentt-xr',
    owner: AUTHOR,
    metadata: {
      description: renderDescription(source),
      generated: { source: 'recognition.md', by: 'build/assemble.mjs' },
    },
    plugins: [
      {
        name: CLAUDE_CODE_PLUGIN_NAME,
        source: `./${CLAUDE_CODE_DIR}`,
        description: renderLongDescription(source),
        author: AUTHOR,
        license: 'MIT',
        homepage: HOMEPAGE,
      },
    ],
  };
  return `${JSON.stringify(marketplace, null, 2)}\n`;
}

// —— the ChatGPT / Codex wrapper ——————————————————————————————————————————————

// This host loads a plugin from a `.codex-plugin/plugin.json` naming a skills directory. Same
// argument as the Claude Code wrapper: a MANIFEST FORMAT, not a capability. The skill body is
// the same string, so this host carries no sentence another host lacks.
//
// The manifest names `skills` and NOTHING ELSE. There is no `mcpServers` and no `apps` key,
// because there is nothing to connect to — no server, no OAuth application, no MCP endpoint, no
// per-installation state (D-The-plugin-declares-no-connect-action). A listing here shows the
// skills toggle and the starter prompts and stops, and the empty connect slot is the design
// working rather than an omission.
export const CHATGPT_SKILL_NAME = 'ar';
export const CHATGPT_PLUGIN_NAME = 'vincentt';
export const CHATGPT_DIR = 'dist/chatgpt';

// The directory shows the plugin under a category. This is listing metadata pointing at a
// classification the host defines, not a sentence about what the product does — the same class
// of field as `license` and `homepage` (§6).
export const CHATGPT_CATEGORY = 'Creativity';

// §6: the starter prompts. This host renders a row a person CLICKS TO SPEAK, so the row has to
// be a sentence in the person's own voice — which is a shape `actions.yml`'s labels deliberately
// are not (a label is <= 5 words, names a moment, and may not contain a `vincentt` token).
//
// So the sentence is DERIVED FROM THE HEADING by a fixed expansion, never authored per host.
// That is the whole of FORK-A: the alternative was a `prompt:` field per action, which would be
// a fifth pinned string with no recall, written because one directory renders one field. A stiff
// sentence costs stiffness; an authored one costs a string we cannot reach to change.
//
// The mapping is keyed by PINNED_ACTION_ID, so a prompt cannot exist for a moment recognition.md
// does not have, and a fifth moment is a record change before it is ever a fifth row here.
const STARTER_PROMPT_FOR_ID = Object.freeze({
  start: 'Help me start a new AR app.',
  resume: 'Help me pick up a project I started.',
  phone: 'Show me what I am building on my phone.',
  stop: 'Stop the preview I have running.',
});

export function renderChatgptSkill(source, precedence) {
  const description = renderDescription(source);
  const front = ['---', `name: ${CHATGPT_SKILL_NAME}`, `description: ${description}`, '---', ''];
  return `${front.join('\n')}\n${renderSkillBody(source, precedence)}`;
}

export function renderChatgptPlugin(source) {
  const plugin = {
    name: CHATGPT_PLUGIN_NAME,
    version: PACKAGE_VERSION,
    description: renderDescription(source),
    author: AUTHOR,
    license: 'MIT',
    homepage: HOMEPAGE,
    repository: `${HOMEPAGE}.git`,
    generated: { source: 'recognition.md', by: 'build/assemble.mjs' },
    // The one component reference. No `mcpServers`, no `apps` — see above.
    skills: './skills/',
    interface: {
      displayName: 'Vincentt',
      shortDescription: renderDescription(source),
      // The listing shows this as a BLOCK, so it gets the whole paragraph — the same split the
      // Claude Code plugin panel gets, and for the same reason.
      longDescription: renderLongDescription(source),
      developerName: AUTHOR.name,
      category: CHATGPT_CATEGORY,
      websiteURL: HOMEPAGE,
      defaultPrompt: PINNED_ACTION_IDS.map((id) => STARTER_PROMPT_FOR_ID[id]),
    },
  };
  return `${JSON.stringify(plugin, null, 2)}\n`;
}

// The marketplace entry, this host's format. A creator can add this repo as a marketplace
// directly — from a GitHub shorthand, a git URL, or a local folder — which is how the wrapper is
// installable BEFORE any directory submission is reviewed, and how it stays installable for
// anyone who would rather not go through a directory at all.
//
// This host reads `.agents/plugins/marketplace.json`; it also accepts the Claude Code path as
// legacy-compatible, but that one names `dist/claude-code`, whose commands belong to a host this
// one is not. Two manifests, each naming its own build, is the same argument as two wrappers:
// the FORMAT differs, the body does not.
export function renderChatgptMarketplace(source) {
  const marketplace = {
    name: 'vincentt-xr',
    interface: { displayName: 'Vincentt' },
    metadata: {
      description: renderDescription(source),
      generated: { source: 'recognition.md', by: 'build/assemble.mjs' },
    },
    plugins: [
      {
        name: CHATGPT_PLUGIN_NAME,
        source: { source: 'local', path: `./${CHATGPT_DIR}` },
        description: renderLongDescription(source),
        author: AUTHOR,
        license: 'MIT',
        homepage: HOMEPAGE,
        category: CHATGPT_CATEGORY,
      },
    ],
  };
  return `${JSON.stringify(marketplace, null, 2)}\n`;
}

// §9.2: the install manifest. The suite's precondition check is generated FROM THE WRAPPERS, so
// a host added tomorrow extends the check with no edit — the same drift argument as the TABS
// allowlist. It lists what WE publish and where WE install it. It names no host application,
// enumerates no host directory, and reads nothing about what is running.
export function renderInstallManifest() {
  const wrappers = listWrappers();
  return `${JSON.stringify(
    {
      packageName: PACKAGE_NAME,
      generated: { by: 'build/assemble.mjs', from: 'hosts/*/install.json' },
      wrappers,
    },
    null,
    2,
  )}\n`;
}

// Each wrapper declares its own install paths and env var in its own install.json. The manifest
// is their union, DISCOVERED from the hosts directory rather than listed here — so a host added
// tomorrow extends the precondition check with no edit to the test. Same drift argument as the
// TABS allowlist: a hand-written second list is the mechanism that produces the bug.
//
// installPaths are relative to the user's home directory. They are OUR publish targets: the
// place our own install instruction tells a creator to put our own files. Reading them learns
// nothing about which application is running, and a machine with no host at all gets the same
// answer.
export function listWrappers() {
  const hostsDir = join(REPO_ROOT, 'hosts');
  if (!existsSync(hostsDir)) return [];
  return readdirSync(hostsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(hostsDir, e.name, 'install.json'))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, 'utf8')))
    .map((w) => ({ host: w.host, installPaths: w.installPaths, envVars: w.envVars }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

// —— outputs —————————————————————————————————————————————————————————————————

// Each wrapper's outputs, keyed by host. A host is added by dropping in `hosts/<host>/` and
// adding one entry here — the renderers differ because manifest FORMATS differ, which is the
// only thing a wrapper is allowed to differ in. The skill body passed to each is the same
// string, so no host can carry a sentence another host does not.
const WRAPPER_OUTPUTS = Object.freeze({
  'self-serve': (source, precedence) => [
    { path: join(REPO_ROOT, 'hosts/self-serve/SKILL.md'), content: renderSkillBody(source, precedence) },
    { path: join(REPO_ROOT, 'hosts/self-serve/manifest.json'), content: renderSelfServeManifest(source) },
  ],
  'claude-code': (source, precedence) => [
    {
      path: join(REPO_ROOT, CLAUDE_CODE_DIR, `skills/${CLAUDE_CODE_SKILL_NAME}/SKILL.md`),
      content: renderClaudeCodeSkill(source, precedence),
    },
    {
      path: join(REPO_ROOT, CLAUDE_CODE_DIR, '.claude-plugin/plugin.json'),
      content: renderClaudeCodePlugin(source),
    },
    ...renderClaudeCodeCommands(source).map((c) => ({
      path: join(REPO_ROOT, CLAUDE_CODE_DIR, `commands/${c.name}.md`),
      content: c.content,
    })),
    {
      path: join(REPO_ROOT, '.claude-plugin/marketplace.json'),
      content: renderClaudeCodeMarketplace(source),
    },
  ],
  chatgpt: (source, precedence) => [
    {
      path: join(REPO_ROOT, CHATGPT_DIR, `skills/${CHATGPT_SKILL_NAME}/SKILL.md`),
      content: renderChatgptSkill(source, precedence),
    },
    {
      path: join(REPO_ROOT, CHATGPT_DIR, '.codex-plugin/plugin.json'),
      content: renderChatgptPlugin(source),
    },
    {
      path: join(REPO_ROOT, '.agents/plugins/marketplace.json'),
      content: renderChatgptMarketplace(source),
    },
  ],
});

export function computeOutputs() {
  const source = readSource();
  const precedence = readFileSync(PRECEDENCE_PATH, 'utf8');

  // Discovered, not listed: the same directory read the install manifest uses, so the outputs
  // and the precondition check can never disagree about which hosts exist. A wrapper directory
  // with no renderer is a build failure rather than a silently unrendered host — a host that
  // ships an install.json and no skill body is exactly the empty-package failure readSource()
  // refuses for the source.
  const wrapperOutputs = listWrappers().flatMap(({ host }) => {
    const render = WRAPPER_OUTPUTS[host];
    if (!render) {
      throw new Error(
        `assembly failed: hosts/${host}/install.json declares a wrapper with no renderer in ` +
          `build/assemble.mjs. A declared host that renders nothing would pass the precondition ` +
          `check while publishing an empty wrapper.`,
      );
    }
    return render(source, precedence);
  });

  return [
    { path: join(REPO_ROOT, 'actions.yml'), content: renderActions(source) },
    ...wrapperOutputs,
    { path: join(REPO_ROOT, 'build/install-manifest.json'), content: renderInstallManifest() },
    // The rendering this repo publishes into v2-template's AGENTS.md. It is TRACKED, not a build
    // artifact, so a hand-edit to it is detectable by the same check that guards the skill body —
    // the template's own CI compares its copy against this one.
    { path: join(REPO_ROOT, 'dist/AGENTS.section.md'), content: renderGroundingSection(source) },
  ];
}

export function write() {
  for (const { path, content } of computeOutputs()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

// The assembly check — §4(2). The message names recognition.md, because a contributor who
// hand-edited a rendered copy needs to be told where the source is, not merely that output
// differs.
export function check() {
  const stale = [];
  for (const { path, content } of computeOutputs()) {
    const rel = relative(REPO_ROOT, path);
    if (!existsSync(path)) {
      stale.push({ path: rel, reason: 'missing' });
      continue;
    }
    const tracked = readFileSync(path, 'utf8');
    if (tracked !== content) {
      stale.push({ path: rel, reason: 'differs', offset: firstDifference(tracked, content) });
    }
  }
  return stale;
}

export function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

export function staleMessage(stale) {
  const lines = [
    'Assembly check FAILED. These files are generated from recognition.md and were edited by hand:',
    '',
  ];
  for (const s of stale) {
    lines.push(
      s.reason === 'missing'
        ? `  ${s.path} — missing; run \`npm run assemble\``
        : `  ${s.path} — differs from the assembly at byte ${s.offset}`,
    );
  }
  lines.push(
    '',
    'Edit recognition.md — it is the single source for every rendered copy — then run',
    '`npm run assemble` and commit the result. A sentence added to a rendered copy alone would',
    'reach the package without reaching the grounding, which is the duplication the rule forbids.',
  );
  return lines.join('\n');
}

// `pathToFileURL` rather than a `file://` template: on macOS a temp dir is reached through a
// symlink (/var → /private/var), so string-comparing the raw argv path silently made this block
// never run when the script was spawned from a scratch copy — the CLI exited 0 having done
// nothing, which is precisely the false-green this repo exists to prevent.
if (isMain(import.meta.url)) {
  const wantsCheck = process.argv.includes('--check');
  try {
    if (wantsCheck) {
      const stale = check();
      if (stale.length) {
        console.error(staleMessage(stale));
        process.exit(1);
      }
      console.log('Assembly check passed: every generated output matches recognition.md.');
    } else {
      write();
      console.log('Assembled every output from recognition.md.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// QA-F14-G2 — the publish gate refuses when the template tag lacks the section, and is NOT
// satisfiable by a stale tag (implementation.md §7).
//
// The gate is a pure function over the fetched bytes, so every row runs offline. Row (e) — the
// assertion is made against the TAG and not against main — is structural here: the fetch reads
// the tag from the remote and never consults a local branch, and the test drives that by feeding
// the gate main's (correct) content while the tag lags.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateGate,
  extractSection,
  extractFromTar,
  OUTCOME,
  TEMPLATE_TAG,
  TEMPLATE_AGENTS_PATH,
} from '../build/publish-gate.mjs';
import { renderGroundingSection, REPO_ROOT, BEGIN_MARKER, END_MARKER } from '../build/assemble.mjs';
import { SHIPPED } from './hostile-sources.mjs';

const EXPECTED = renderGroundingSection(SHIPPED);

// A stand-in AGENTS.md: prose, the marked region, more prose. The gate must find the region
// inside a real document, not only in a file that is nothing but the section.
function agentsMd(section) {
  return `# Agent instructions for this Vincentt XR project\n\nSome preamble.\n\n${section}\n## Start here\n\nMore prose.\n`;
}

test('QA-F14-G2(a) · a tag containing the section byte-for-byte PROCEEDS', () => {
  const result = evaluateGate({ fetched: agentsMd(EXPECTED), expected: EXPECTED });
  assert.equal(result.outcome, OUTCOME.PROCEED);
  assert.match(result.message, /byte-for-byte/);
});

test('QA-F14-G2(b) · a tag with a DIFFERENT rendering REFUSES, naming tag and byte offset', () => {
  const drifted = EXPECTED.replace('a preview is what they are asking for', 'a preview is what they want');
  assert.notEqual(drifted, EXPECTED);

  const result = evaluateGate({ fetched: agentsMd(drifted), expected: EXPECTED });
  assert.equal(result.outcome, OUTCOME.REFUSE);
  assert.equal(result.reason, 'differs');
  assert.ok(typeof result.offset === 'number' && result.offset >= 0, 'the refusal carries the byte offset');
  assert.match(result.message, new RegExp(TEMPLATE_TAG), 'the refusal names the tag it checked');
  assert.match(result.message, /byte \d+/);
});

test('QA-F14-G2(b) · a ONE-CHARACTER drift is enough to refuse', () => {
  // The mutation is asserted to have applied. A `.replace` that silently matched nothing would
  // compare the section against itself and pass vacuously — the same failure class as G1, one
  // level down, and the reason the section's own line wrapping is not assumed here.
  const drifted = EXPECTED.replace('Finishing', 'Finishinq');
  assert.notEqual(drifted, EXPECTED, 'the mutation must actually apply');

  const result = evaluateGate({ fetched: agentsMd(drifted), expected: EXPECTED });
  assert.equal(result.outcome, OUTCOME.REFUSE);
});

test('QA-F14-G2(c) · a tag with NO section at all REFUSES', () => {
  const result = evaluateGate({
    fetched: '# Agent instructions\n\nNo recognition section here.\n',
    expected: EXPECTED,
  });
  assert.equal(result.outcome, OUTCOME.REFUSE);
  assert.equal(result.reason, 'absent');
  assert.match(result.message, /no paired recognition markers/);
});

test('QA-F14-G2(c) · an UNCLOSED begin marker is treated as absent, not as a match', () => {
  // An unclosed BEGIN would otherwise swallow the rest of AGENTS.md into the generated region.
  const truncated = `# Agents\n\n${BEGIN_MARKER}\n\n## When the person says…\n\nsome text\n`;
  assert.equal(extractSection(truncated), null);
  assert.equal(evaluateGate({ fetched: truncated, expected: EXPECTED }).reason, 'absent');

  // …and so is an END that precedes its BEGIN.
  const inverted = `# Agents\n\n${END_MARKER}\n\nstuff\n\n${BEGIN_MARKER}\n`;
  assert.equal(extractSection(inverted), null);
});

test('QA-F14-G2(d) · an UNREACHABLE tag REFUSES and does NOT fall through to "assume fine"', () => {
  // THE ROW THIS CASE EXISTS FOR. A gate whose failure mode on an unreachable input is "proceed"
  // is not a gate; it is a promise with a network dependency.
  for (const error of ['fatal: could not read from remote repository', 'network is unreachable', "fatal: tag 'latest' not found"]) {
    const result = evaluateGate({ error, expected: EXPECTED });
    assert.equal(result.outcome, OUTCOME.REFUSE, `an unreachable tag must refuse: ${error}`);
    assert.equal(result.reason, 'unreachable');
    assert.match(result.message, /not evidence the content shipped/);
    assert.match(result.message, /is not a gate/);
  }
});

test('QA-F14-G2(d) · an unreachable tag refuses even when `fetched` is empty rather than absent', () => {
  const result = evaluateGate({ fetched: '', error: 'timeout', expected: EXPECTED });
  assert.equal(result.outcome, OUTCOME.REFUSE);
  assert.equal(result.reason, 'unreachable', 'the error takes precedence over an empty body');
});

test('QA-F14-G2(e) · the assertion is against the TAG, not the template\'s main', () => {
  // main carries the correct content while the tag lags. The gate reads only what it was given
  // from the tag, so it still refuses — the property row (e) exists to pin.
  const mainContent = agentsMd(EXPECTED);
  const tagContent = agentsMd(EXPECTED.replace('Vincentt is a platform', 'Vincentt was a platform'));
  assert.notEqual(mainContent, tagContent);

  const result = evaluateGate({ fetched: tagContent, expected: EXPECTED, tag: TEMPLATE_TAG });
  assert.equal(result.outcome, OUTCOME.REFUSE, 'a correct main must not satisfy the gate');

  // And the fetch is structurally tag-only: `git archive --remote <tag>` reads the remote's tag
  // and consults no local branch, so there is no code path by which main could be substituted.
  const gateSource = readFileSync(join(REPO_ROOT, 'build/publish-gate.mjs'), 'utf8');
  assert.match(gateSource, /git archive/);
  assert.match(gateSource, /--remote=/);
  assert.doesNotMatch(gateSource, /rev-parse\s+main|origin\/main|HEAD/, 'the gate must never read a branch');
});

test('QA-F14-G2 · every non-proceed outcome is a REFUSAL — there is no third state', () => {
  const cases = [
    { fetched: agentsMd(EXPECTED), expected: EXPECTED },
    { fetched: agentsMd(EXPECTED.replace('preview', 'pre-view')), expected: EXPECTED },
    { fetched: 'nothing', expected: EXPECTED },
    { error: 'boom', expected: EXPECTED },
    { fetched: undefined, expected: EXPECTED },
  ];
  for (const c of cases) {
    const result = evaluateGate(c);
    assert.ok([OUTCOME.PROCEED, OUTCOME.REFUSE].includes(result.outcome));
    assert.ok(result.message.length > 0);
  }
  assert.equal(evaluateGate(cases[0]).outcome, OUTCOME.PROCEED, 'exactly one case proceeds');
  for (const c of cases.slice(1)) assert.equal(evaluateGate(c).outcome, OUTCOME.REFUSE);
});

test('the tar reader extracts the one member the gate asks for', () => {
  const content = '# hello\n';
  const tar = makeTar(`v2-template/${TEMPLATE_AGENTS_PATH}`, content);
  assert.equal(extractFromTar(tar, TEMPLATE_AGENTS_PATH), content);
  assert.throws(() => extractFromTar(tar, 'NOPE.md'), /not found/);
});

// A minimal ustar writer, so the reader is tested against a real archive layout rather than
// against its own assumptions.
function makeTar(name, content) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'utf8');
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.write('        ', 148);
  header.write('0', 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const b of header) sum += b;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);

  const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
  body.write(content, 0, 'utf8');
  return Buffer.concat([header, body, Buffer.alloc(1024)]);
}

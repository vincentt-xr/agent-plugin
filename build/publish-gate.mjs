#!/usr/bin/env node
// The publish gate — implementation.md §7, QA-F14-G2.
//
// The release job REFUSES to publish if the current v2-template@latest does not contain the
// assembled section byte-for-byte. Content reaches creators who cannot install first, always,
// because a package cannot publish until it has. This is FORK-5's "content before packaging"
// turned into a build failure.
//
// Two properties this file exists to hold:
//
//   (1) It reads the TAG, never `main`. A tag lagging behind a correct main must still refuse —
//       creators receive the tag, and a gate satisfied by an unreleased branch protects nothing.
//   (2) An unreachable input REFUSES. A gate whose failure mode on a fetch error is "proceed" is
//       not a gate; it is a promise with a network dependency.

import { execFileSync } from 'node:child_process';
import { renderGroundingSection, readSource, firstDifference, BEGIN_MARKER, END_MARKER } from './assemble.mjs';
import { isMain } from './is-main.mjs';

export const TEMPLATE_REMOTE = 'https://github.com/vincentt-xr/v2-template.git';
export const TEMPLATE_TAG = 'latest';
export const TEMPLATE_AGENTS_PATH = 'AGENTS.md';

export const OUTCOME = {
  PROCEED: 'proceed',
  REFUSE: 'refuse',
};

// Extracts the marked region. An unclosed BEGIN marker would otherwise swallow the rest of
// AGENTS.md into the generated region, so both markers are required and their order is checked.
export function extractSection(agentsMd) {
  const begin = agentsMd.indexOf(BEGIN_MARKER);
  const end = agentsMd.indexOf(END_MARKER);
  if (begin === -1 || end === -1) return null;
  if (end < begin) return null;
  return `${agentsMd.slice(begin, end + END_MARKER.length)}\n`;
}

// The gate proper — a pure function over the fetched bytes, so every row of QA-F14-G2 is
// testable with no network.
export function evaluateGate({ fetched, error, expected, tag = TEMPLATE_TAG }) {
  if (error) {
    return {
      outcome: OUTCOME.REFUSE,
      reason: 'unreachable',
      message:
        `Publish REFUSED: could not read ${TEMPLATE_AGENTS_PATH} at v2-template@${tag} ` +
        `(${error}). An unreachable template tag is not evidence the content shipped, and a gate ` +
        `that proceeds on a fetch error is not a gate. Re-run when the tag is reachable.`,
    };
  }

  const section = extractSection(fetched ?? '');
  if (section === null) {
    return {
      outcome: OUTCOME.REFUSE,
      reason: 'absent',
      message:
        `Publish REFUSED: v2-template@${tag}'s ${TEMPLATE_AGENTS_PATH} contains no paired ` +
        `recognition markers, so the assembled section is not in the tag creators receive. ` +
        `Cut a template tag carrying the section before publishing the package.`,
    };
  }

  if (section !== expected) {
    const offset = firstDifference(section, expected);
    return {
      outcome: OUTCOME.REFUSE,
      reason: 'differs',
      offset,
      message:
        `Publish REFUSED: v2-template@${tag}'s recognition section differs from this repo's ` +
        `assembly at byte ${offset}. The tag carries a different rendering, so publishing now ` +
        `would ship a package whose content had not reached creators. Re-cut the template tag ` +
        `from the current recognition.md.`,
    };
  }

  return {
    outcome: OUTCOME.PROCEED,
    reason: 'match',
    message: `Publish gate passed: v2-template@${tag} carries the assembled section byte-for-byte.`,
  };
}

// The fetch. `git archive --remote` reads the tag from the remote directly and never consults a
// local branch, so property (1) is structural rather than a rule the caller has to remember.
export function fetchTemplateAgents({ remote = TEMPLATE_REMOTE, tag = TEMPLATE_TAG } = {}) {
  try {
    const buf = execFileSync('git', ['archive', `--remote=${remote}`, tag, TEMPLATE_AGENTS_PATH], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return { fetched: extractFromTar(buf, TEMPLATE_AGENTS_PATH) };
  } catch (err) {
    return { error: err.message.split('\n')[0] };
  }
}

// A minimal tar reader for one known member. Adding a tar dependency to a release gate would
// widen the gate's own supply chain for one file.
export function extractFromTar(buffer, wantedName) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const start = offset + 512;
    if (name === wantedName || name.endsWith(`/${wantedName}`)) {
      return buffer.subarray(start, start + size).toString('utf8');
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wantedName} not found in the fetched archive`);
}

if (isMain(import.meta.url)) {
  const expected = renderGroundingSection(readSource());
  const { fetched, error } = fetchTemplateAgents();
  const result = evaluateGate({ fetched, error, expected });
  if (result.outcome === OUTCOME.REFUSE) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(result.message);
}

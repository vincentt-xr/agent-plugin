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
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

// The fetch — a shallow fetch of the TAG into a scratch git dir, then read the blob out of it.
//
// NOT `git archive --remote`: GitHub does not serve the upload-archive service over HTTPS and
// answers 422, so that spelling refuses on every run. A gate that can only ever refuse is as
// useless as one that can only ever proceed, and it fails in the direction that looks safe —
// which is how it would have survived review. Verified against the real remote.
//
// `FETCH_HEAD` after fetching an explicit tag refspec is the tag's commit. No branch is ever
// named, so property (1) — the assertion is against the tag, never main — stays structural.
export function fetchTemplateAgents({ remote = TEMPLATE_REMOTE, tag = TEMPLATE_TAG } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'f14-gate-'));
  try {
    const git = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    git(['init', '--quiet']);
    git(['fetch', '--quiet', '--depth=1', remote, `refs/tags/${tag}`]);
    const fetched = git(['show', `FETCH_HEAD:${TEMPLATE_AGENTS_PATH}`]);
    return { fetched };
  } catch (err) {
    return { error: String(err.message).split('\n')[0] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

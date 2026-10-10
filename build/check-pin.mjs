#!/usr/bin/env node
// The release pin must name a real release: the tag exists on the remote and points at the pinned
// commit. Without this, a hand-edited sha would install a commit no release workflow checked, and
// the pin would only look like a release.
//
//   node build/check-pin.mjs [remote]    (remote defaults to origin)

import { execFileSync } from 'node:child_process';
import { isMain } from './is-main.mjs';
import { readReleasePin } from './assemble.mjs';

/**
 * The commit a tag names, from `git ls-remote` output. An annotated tag lists the tag object
 * under `refs/tags/<tag>` and the commit under `refs/tags/<tag>^{}`; the peeled line wins.
 * Undefined when the tag is absent.
 */
export function resolveTagCommit(lsRemote, tag) {
  let direct;
  let peeled;
  for (const line of lsRemote.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (ref === `refs/tags/${tag}`) direct = sha;
    if (ref === `refs/tags/${tag}^{}`) peeled = sha;
  }
  return peeled ?? direct;
}

if (isMain(import.meta.url)) {
  const remote = process.argv[2] ?? 'origin';
  let pin;
  try {
    pin = readReleasePin();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
  if (!pin) {
    console.log(
      '::warning::release-pin.json names no release, so the Claude Code marketplace entry installs ' +
        'the tip of main. The first tag that passes the release workflow opens the PR that pins it.',
    );
    process.exit(0);
  }
  const out = execFileSync('git', ['ls-remote', '--tags', remote, `refs/tags/${pin.tag}*`], {
    encoding: 'utf8',
  });
  const commit = resolveTagCommit(out, pin.tag);
  if (commit === undefined) {
    console.error(`::error::release-pin.json names tag ${pin.tag}, which does not exist on ${remote}.`);
    process.exit(1);
  }
  if (commit !== pin.sha) {
    console.error(
      `::error::release-pin.json pins ${pin.sha}, but tag ${pin.tag} points at ${commit}. ` +
        'Pin only through build/pin-release.mjs with the commit the tag names.',
    );
    process.exit(1);
  }
  console.log(`Release pin ${pin.tag} matches the tag on ${remote} (${commit}).`);
}

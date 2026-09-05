#!/usr/bin/env node
// A change to the shipped content must move the version.
//
// The version in package.json is not bookkeeping here. `assemble.mjs` stamps it into every
// wrapper manifest, and a host COMPARES AGAINST IT to decide whether an installed copy is
// current. Claude Code's marketplace source is this git repo, so a creator's update path is:
// refresh the local marketplace clone, then let the host compare the two versions. If the
// content moved and the version did not, that comparison says "on latest version" with Update
// greyed out -- truthfully, about stale content. The creator cannot learn from the product that
// there is anything to get.
//
// That is the failure this closes. It is the same class the assembly check owns one level down:
// there, a generated file may not drift from its source; here, the version a host reads may not
// drift from the content it describes.
//
// SCOPE -- the shipped content, which is narrower than the repo. recognition.md is the source
// every wrapper renders from, and precedence.txt ships in the package beside it. A change to
// either reaches a creator. A workflow comment, a README, or a test does not, and asking for a
// bump on those trains people to bump without reading, which is the failure mode the adversarial
// review's scope rule already names.
//
// It checks that the version MOVED, not that it moved correctly. Whether a change deserves a
// patch or a minor is a judgment about what the content does, and no diff answers it.

import { readFileSync, existsSync } from 'node:fs';
import { isMain } from './is-main.mjs';

// A change to one of these reaches a creator. Keep it narrow -- see SCOPE above.
export const SHIPPED_CONTENT = ['recognition.md', 'precedence.txt'];

function fail(lines) {
  console.error(`::error::${lines[0]}`);
  for (const line of lines) console.error(line);
  process.exit(1);
}

/** The shipped-content files in this diff. Empty means the PR carries no obligation. */
export function shippedContentChanged(changedFiles) {
  return changedFiles.map((f) => f.trim()).filter((f) => SHIPPED_CONTENT.includes(f));
}

/**
 * The version field, or undefined when it cannot be read.
 *
 * Undefined is never treated as "unchanged" by the caller: a package.json that will not parse is
 * a failure to report, not a comparison to quietly win. A check whose failure mode on a malformed
 * input is "proceed" is not a check.
 */
export function versionOf(packageJson) {
  try {
    const v = JSON.parse(packageJson).version;
    return typeof v === 'string' && v !== '' ? v : undefined;
  } catch {
    return undefined;
  }
}

if (isMain(import.meta.url)) {
  const [changedFilesPath, basePackageJsonPath, headPackageJsonPath] = process.argv.slice(2);

  const changedFiles = existsSync(changedFilesPath)
    ? readFileSync(changedFilesPath, 'utf8').split('\n')
    : [];

  const shipped = shippedContentChanged(changedFiles);
  if (shipped.length === 0) {
    console.log('No shipped content changed — this PR is not asked to move the version.');
    process.exit(0);
  }

  const base = existsSync(basePackageJsonPath)
    ? versionOf(readFileSync(basePackageJsonPath, 'utf8'))
    : undefined;
  const head = existsSync(headPackageJsonPath)
    ? versionOf(readFileSync(headPackageJsonPath, 'utf8'))
    : undefined;

  if (base === undefined || head === undefined) {
    fail([
      'Could not read a version from package.json on both sides of this diff.',
      '',
      `  base: ${base ?? 'unreadable'}`,
      `  head: ${head ?? 'unreadable'}`,
      '',
      'This check refuses rather than passing on an input it could not read.',
    ]);
  }

  if (base === head) {
    fail([
      `This PR changes shipped content but leaves the version at ${head}.`,
      '',
      ...shipped.map((f) => `  changed — ${f}`),
      '',
      'Run `npm version patch` (or minor) and commit the result. That moves package.json and,',
      'through assemble.mjs, every wrapper manifest with it — there is one version, not five.',
      '',
      'The version is what a HOST COMPARES AGAINST. Left unmoved, a creator who refreshes the',
      'marketplace receives the new content and is told they are on the latest version, with',
      'Update greyed out. They cannot learn from the product that there is anything to get.',
    ]);
  }

  console.log(`Shipped content changed and the version moved: ${base} → ${head}.`);
}

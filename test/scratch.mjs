// A scratch copy of the checkout.
//
// Every arm that mutates the tree runs here rather than against the real files. The suite runs
// its files in parallel, so a test that edits the shipped recognition.md — even with a `finally`
// that restores it — is observable by every other test while it is mid-flight, and shows up as an
// unrelated failure somewhere else. The fixture is F14_SOURCE_TREE, the tree itself; a case that
// corrupted it would poison every later case.

import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPO_ROOT } from '../build/assemble.mjs';

export function scratchRepo() {
  const tmp = mkdtempSync(join(tmpdir(), 'f14-dev-'));
  cpSync(REPO_ROOT, tmp, {
    recursive: true,
    filter: (src) => !src.includes('node_modules') && !src.includes('/.git'),
  });
  return tmp;
}

export function withScratchRepo(body) {
  const tmp = scratchRepo();
  try {
    return body(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

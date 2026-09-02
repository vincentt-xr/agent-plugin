// A local fixture template repo, so the publish gate can be driven END TO END — spawned, through
// its real fetch, to a real exit code — with NO NETWORK.
//
// Why this exists: a spawned run that reaches the real GitHub remote is only meaningful while the
// published tag lacks the section. REFUSE is then correct whichever path the run took, so the
// assertion passes for a reason it did not choose. When the tag lands, that arm flips from
// proving the gate refuses to proving nothing — silently. A fixture the test controls is what
// makes each outcome attributable.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'f14',
      GIT_AUTHOR_EMAIL: 'f14@example.invalid',
      GIT_COMMITTER_NAME: 'f14',
      GIT_COMMITTER_EMAIL: 'f14@example.invalid',
    },
  });
}

/**
 * Creates a fixture template repo and returns its path plus a cleanup function.
 *
 * `refs` maps a ref name to the AGENTS.md content committed under it. A name beginning with
 * `branch:` is created as a BRANCH rather than a tag — that is how the "a branch named `latest`
 * must not satisfy `refs/tags/latest`" case is expressed.
 */
export function makeTemplateRepo(refs) {
  const dir = mkdtempSync(join(tmpdir(), 'f14-fixture-'));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  writeFileSync(join(dir, 'README.md'), 'fixture\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '--quiet', '-m', 'base']);

  for (const [name, content] of Object.entries(refs)) {
    writeFileSync(join(dir, 'AGENTS.md'), content);
    git(dir, ['add', 'AGENTS.md']);
    git(dir, ['commit', '--quiet', '-m', `ref ${name}`]);
    if (name.startsWith('branch:')) {
      const branch = name.slice('branch:'.length);
      // Commits already land on the checked-out branch, so it advances on its own; git refuses to
      // force-update the branch a worktree is on.
      const current = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
      if (branch !== current) git(dir, ['branch', '--force', branch]);
    } else {
      git(dir, ['tag', '--force', name]);
    }
  }

  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A stand-in AGENTS.md: prose, the marked region, more prose. The gate must find the region
// inside a real document, not only in a file that is nothing but the section.
export function agentsMd(section) {
  return `# Agent instructions for this Vincentt XR project\n\nSome preamble.\n\n${section}\n## Start here\n\nMore prose.\n`;
}

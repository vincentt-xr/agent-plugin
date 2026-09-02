// The subtractive suite's precondition — implementation.md §9.2, QA-F14-G1.
//
// WHY THIS EXISTS. §9.1 stated "no package installed anywhere on the machine" as an environment
// property and nothing checked it. The suite passes identically with the package installed,
// because the package is text a HOST loads and contributes nothing to a spawned `vincentt`.
// Since the subtractive test is the only mechanical evidence tripwire (d) was not a dissolution,
// a vacuous pass makes the amendment's single gate green by construction — permanently, and
// invisibly. An environment property that nothing checks is a comment.
//
// WHAT THIS IS NOT. Host detection asks "which application is running me?" and branches on the
// answer; tripwire (a) forbids it. This asks "is a copy of an artifact WE published present at a
// path WE can name from our own release metadata?" It reads only our own outputs, learns nothing
// about what is running, gets the same answer on a machine with no host at all, and HAS NO
// BRANCH — one outcome for found (fail), one for not-found (proceed).
//
// The tell that this is the right check: a machine with a host installed and our package absent
// PASSES; a machine with no host and our package present FAILS. Exactly backwards from host
// detection.

import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';

export function loadInstallManifest(repoRoot) {
  const path = join(repoRoot, 'build/install-manifest.json');
  if (!existsSync(path)) {
    throw new Error(
      'precondition check cannot run: build/install-manifest.json is missing. It is generated ' +
        'from the wrappers by build/assemble.mjs; run `npm run assemble`.',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Every path this check looks at comes from the manifest, which is generated from the wrappers'
// own install.json files. Nothing here enumerates a directory to see what exists, reads a config
// or dotfile belonging to a host, or names a host in a conditional.
export function findInstalledCopies(manifest, options = {}) {
  const home = options.home ?? defaultHome();
  const env = options.env ?? process.env;
  const roots = options.moduleRoots ?? [];
  const found = [];

  for (const wrapper of manifest.wrappers ?? []) {
    for (const rel of wrapper.installPaths ?? []) {
      const path = isAbsolute(rel) ? rel : join(home, rel);
      if (existsSync(path)) {
        found.push({ kind: 'install-path', host: wrapper.host, path });
      }
    }
    for (const name of wrapper.envVars ?? []) {
      if (env[name]) {
        found.push({ kind: 'env-var', host: wrapper.host, path: `${name}=${env[name]}` });
      }
    }
  }

  // Module resolution of the published name, from every relevant root. Resolution failure is the
  // expected outcome and is not an error condition.
  for (const root of roots) {
    const resolved = tryResolve(manifest.packageName, root);
    if (resolved) found.push({ kind: 'module', host: null, path: resolved });
  }

  return found;
}

function tryResolve(name, fromDir) {
  try {
    const require = createRequire(join(fromDir, 'noop.js'));
    return require.resolve(name);
  } catch {
    return null;
  }
}

function defaultHome() {
  return process.env.HOME ?? process.env.USERPROFILE ?? '';
}

// The failure message matters: a skipped suite and a vacuously-passing one look identical in a
// CI summary, and the message is what stops the next person reaching for --skip.
export function preconditionMessage(found) {
  const first = found[0];
  return (
    `Precondition failed: the subtractive suite requires the agent-plugin package to be absent; ` +
    `found \`${first.path}\`. This suite is the only evidence tripwire (d) was not a dissolution ` +
    `- remove the install and re-run rather than skipping.` +
    (found.length > 1 ? `\n(${found.length} copies found in total.)` : '')
  );
}

// One outcome for found, one for not-found. No branch on which host, no branch on what is
// running, no skip path.
export function assertPackageAbsent(manifest, options = {}) {
  const found = findInstalledCopies(manifest, options);
  if (found.length > 0) throw new Error(preconditionMessage(found));
  return true;
}

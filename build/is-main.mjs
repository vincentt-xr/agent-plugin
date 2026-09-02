import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// True when this module is the process's entry point.
//
// Written by comparing REAL PATHS rather than the usual
// `import.meta.url === \`file://${process.argv[1]}\`` because that comparison is wrong on macOS:
// a temp directory is reached through a symlink (/var → /private/var), so a script spawned from a
// scratch copy compared unequal, the CLI block never ran, and the process exited 0 having done
// nothing. A build tool that silently does nothing and reports success is the exact false-green
// this repo's checks exist to prevent, so the guard is shared rather than repeated per file.
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(entry);
}

function resolve(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

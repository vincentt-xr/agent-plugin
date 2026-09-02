#!/usr/bin/env node
// Kept as an alias so `node build/run-lint.mjs` and `node build/lint.mjs` behave identically.
// The lint proper lives in lint.mjs, which is itself directly runnable.

import { runLintCli } from './lint.mjs';

process.exit(runLintCli());

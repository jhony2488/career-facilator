#!/usr/bin/env node
// Wrapper para rodar o CLI TS direto do bin (npm link / npx .) sem build.
require('tsx/cjs');
require('../src/cli/index.ts');

#!/usr/bin/env node

const Typo = require('../').default;
const typo = new Typo();

const log = str => process.stderr.write(`${str}\n`);
const start = Date.now();
const dict = process.argv[2];

log(`Generating dictionaries: ${dict}`);

typo.loadDictionary(dict)
  .then(() => typo.dumpState())
  .then(state => process.stdout.write(state))
  .then(() => log(`Completed in ${Math.round(Date.now() - start) / 1000}s`));

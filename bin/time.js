#!/usr/bin/env node

const Typo = require('../').default;
const typo = new Typo();

const log = str => process.stderr.write(`${str}\n`);

const time = promise => {
  const start = Date.now();
  return promise().then(() => Date.now() - start);
};

const alphabet = 'abcdefghijklmnopqrstuvwxyz';

time(() => typo.loadDictionary('en_US'))
  .then(time => log(`Dictionaries loaded in ${time}ms`))
  .then(() => time(() => typo.suggest('speling0')))
  .then(time => log(`Generated and corrected 'speling' in ${time}ms`))
  .then(() => time(() => typo.suggest('speling1')))
  .then(time => log(`Subsequently corrected 'speling' in ${time}ms`));

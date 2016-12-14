const Typo = require('../../').default;
const dictionary = new Typo();

let i = 0;
const getWord = () => `mispelled${i++}`;

suite('Typo', () => {
  before(next => dictionary.loadDictionary('en_US').then(next));
  bench('check', next => dictionary.check(getWord()).then(next));
  bench('suggest', next => dictionary.suggest(getWord()).then(next));
});

import Typo from '../../src';
import { expect } from 'chai';

describe('typo', () => {

  let typo: Typo;

  before(() => {
    typo = new Typo();
    return typo.loadDictionary('en_US');
  });

  const runCheckTable = (table: { word: string, correct: boolean }[]) => {
    table.forEach(tcase => {
      it(`says ${tcase.word} ${tcase.correct ? 'is' : 'is not'} correct`, () => {
        return typo.check(tcase.word).then(res => expect(res).to.equal(tcase.correct));
      });
    });
  };

  const runSuggestTable = (table: { args: any[], expected: string[], message?: string }[]) => {
    table.forEach(tcase => {
      it(`suggest(${tcase.args.join(',')})`, () => {
        return typo.suggest.apply(typo, tcase.args).then((value: string[]) => {
          expect(value).to.deep.equal(tcase.expected, tcase.message);
        });
      });
    });
  };

	describe('suggestions', () => {
    runSuggestTable([
      { args: ['speling', 3], expected: ['spieling', 'spelling', 'spewing'] },

      // Repeated calls function properly.
      { args: ['speling', 1], expected: ['spieling'] },
      { args: ['speling'], expected: ['spieling', 'spelling', 'spewing', 'pealing', 'peeing'] },
      { args: ['speling', 2], expected: ['spieling', 'spelling'] },
      { args: ['speling'], expected: ['spieling', 'spelling', 'spewing', 'pealing', 'peeing'] },

      // Requesting more suggestions than will be returned doesn't break anything.
      { args: ['spartang', 50], expected: ['spartan', 'parting', 'sparing', 'sprangs'] },
      { args: ['spartang', 30], expected: ['spartan', 'parting', 'sparing', 'sprangs'] },
      { args: ['spartang', 1], expected: ['spartan'] },

      { args: ['spitting'], expected: [], message: 'Correctly spelled words receive no suggestions.' },
      { args: ['spitting'], expected: [], message: 'Correctly spelled words receive no suggestions.' },

      // Words that are object properties don't break anything.
      { args: ['length'], expected: [], message: 'Correctly spelled words receive no suggestions.' },
      { args: ['length'], expected: [], message: 'Correctly spelled words receive no suggestions.' },
    ]);
	});

	describe('Correct checking of words with no affixes', function () {
    runCheckTable([
		  { word: 'I', correct: true },
		  { word: 'is', correct: true },
		  { word: 'makes', correct: true },
		  { word: 'example', correct: true },
		  { word: 'a', correct: true },
		  { word: 'aback', correct: true },
		  { word: 'juicily', correct: true },
		  { word: 'palmate', correct: true },
		  { word: 'palpable', correct: true },
    ]);
	});

	describe('Correct checking of root words with single affixes (affixes not used)', function () {
    runCheckTable([
		  { word: 'paling', correct: true },
		  { word: 'arrangeable', correct: true },
		  { word: 'arrant', correct: true },
		  { word: 'swabby', correct: true },
    ]);
	});

	describe('Correct checking of root words with single affixes (affixes used)', function () {
    runCheckTable([
		  { word: 'palmer\'s', correct: true },
		  { word: 'uncritically', correct: true },
		  { word: 'hypersensitiveness', correct: true },
		  { word: 'illusive', correct: true },
    ]);
	});

	describe('Capitalization is respected.', function () {
    runCheckTable([
		  { word: 'A', correct: true },
		  { word: 'a', correct: true },
		  { word: 'AA', correct: true },
		  { word: 'ABANDONER', correct: true },
		  { word: 'abandonER', correct: true },
		  { word: 'Abandoner', correct: true },
		  { word: 'Abbe', correct: true },
		  { word: 'Abbott\'s', correct: true },
		  { word: 'abbott\'s', correct: false },
		  { word: 'Abba', correct: true },
		  { word: 'ABBA', correct: true },
		  { word: 'Abba\'s', correct: true },
		  { word: 'Yum', correct: true },
		  { word: 'yum', correct: true },
		  { word: 'YUM', correct: true },
		  { word: 'aa', correct: false },
		  { word: 'aaron', correct: false },
		  { word: 'abigael', correct: false },
		  { word: 'YVES', correct: true },
		  { word: 'yves', correct: false },
		  { word: 'Yves', correct: true },
		  { word: 'MACARTHUR', correct: true },
		  { word: 'MacArthur', correct: true },
		  { word: 'Alex', correct: true },
		  { word: 'alex', correct: false },
    ]);
	});

	describe('Words not in the dictionary in any form are marked as misspelled.', function () {
    runCheckTable([
		  { word: 'aaraara', correct: false },
		  { word: 'aaraara', correct: false },
		  { word: 'aaraara', correct: false },
		  { word: 'aaraara', correct: false },
		  { word: 'aaraara', correct: false },
    ]);
	});

	describe('Leading and trailing whitespace is ignored.', function () {
    runCheckTable([
		  { word: 'concept ', correct: true },
		  { word: ' concept', correct: true },
		  { word: '  concept', correct: true },
		  { word: 'concept  ', correct: true },
		  { word: '  concept  ', correct: true },
    ]);
	});

	describe('ONLYINCOMPOUND flag is respected', function () {
    runCheckTable([
		  { word: '1th', correct: false },
		  { word: '2th', correct: false },
		  { word: '3th', correct: false },
    ]);
	});

	describe('Compound words', function () {
    runCheckTable([
		  { word: '1st', correct: true },
		  { word: '2nd', correct: true },
		  { word: '3rd', correct: true },
		  { word: '4th', correct: true },
		  { word: '5th', correct: true },
		  { word: '6th', correct: true },
		  { word: '7th', correct: true },
		  { word: '8th', correct: true },
		  { word: '9th', correct: true },
		  { word: '10th', correct: true },
		  { word: '11th', correct: true },
		  { word: '12th', correct: true },
		  { word: '13th', correct: true },
		  { word: '1th', correct: false },
		  { word: '2rd', correct: false },
		  { word: '3th', correct: false },
		  { word: '4rd', correct: false },
		  { word: '100st', correct: false },
    ]);
	});

	describe('Possessives are properly checked.', function () {
    runCheckTable([
		  { word: 'concept\'s', correct: true },
		  // acceptability's is in the dictionary including the 's
		  { word: 'acceptability\'s\'s', correct: false },
    ]);
	});

	describe('Replacement rules are implemented', function () {
    runSuggestTable([
		  { args: ['wagh'], expected: ['weigh'] },
		  { args: ['ceit'], expected: ['cat'] },
		  { args: ['seau'], expected: ['so'] },
		  { args: ['shaccable'], expected: ['shakable'] },
		  { args: ['soker'], expected: ['choker'] },
    ]);
	});

	describe('Contractions', function () {
    runCheckTable([
		  { word: 'aren\'t', correct: true },
		  { word: 'I\'m', correct: true },
		  { word: 'we\'re', correct: true },
		  { word: 'didn\'t', correct: true },
		  { word: 'didn\'ts', correct: false },
		  { word: 'he\'re', correct: false },
    ]);
	});

	describe('Capitalizations are handled properly.', function () {
    runSuggestTable([
		  { args: ['Wagh'], expected: ['Weigh'] },
		  { args: ['CEIT'], expected: ['CERT', 'CENT', 'CIT', 'CITY', 'CIR'] },
    ]);
	});
});

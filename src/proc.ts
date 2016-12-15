function prefix() {
  interface IAAFEntry {
    add: string;
    match?: RegExp;
    remove?: RegExp | string;
    continuationClasses?: string[];
  }

  interface IAAFRule {
    type: string;
    entries: IAAFEntry[],
    combineable: boolean;
  }

  interface IDictionaryTable {
    [word: string]: IAAFRule[][];
  }

  interface ILazyDeletionTable {
    children: { [char: string]: string[] };
  }

  let rules: { [name: string]: IAAFRule };
  let compoundRuleCodes: { [name: string]: string[] };
  let dictionaryTable: IDictionaryTable;
  let deletionTable: { [deleted: string]: string[] };
  let compoundRules: (string | RegExp)[] = [];
  let replacementTable: [string, string][] = [];
  let flags: {
    COMPOUNDMIN: string,
    FLAG?: string,
    KEEPCASE: string,
    NEEDAFFIX?: string,
    ONLYINCOMPOUND?: string,
  } = Object.create(null);

  let lazyDeletionTable: { [char: string]: ILazyDeletionTable } = {};
  let lazilyResolvedWords: { [word: string]: boolean } = {};

  const maxEditDistance = 2;

  const damlev = (() => {
    // Cache the codes and score arrays to significantly speed up damlev calls:
    // there's no need to re-allocate them.
    let sourceCodes: number[];
    let targetCodes: number[];
    let score: number[];

    /**
     * Clears the cached arrays, freeing memory that would otherwise be kept
     * forever.
     */
    function uncache() {
      sourceCodes = new Array(32);
      targetCodes = new Array(32);
      score = new Array(33 * 33);
    }

    uncache();

    /**
     * growArray will return an array that's at least as large as the provided
     * size. It may or may not return the same array that was passed in.
     * @param  {Array} arr
     * @param  {Number} size
     * @return {Array}
     */
    function growArray(arr: number[], size: number) {
      if (size <= arr.length) {
        return arr;
      }

      var target = arr.length;
      while (target < size) {
        target *= 2;
      }

      return new Array(target);
    }

    /**
     * Returns the edit distance between the source and target strings.
     * @param  {String} source
     * @param  {Strign} target
     * @return {Number}
     * @license MIT
     * @copyright 2016 WatchBeam Inc.
     * @see https://github.com/WatchBeam/damlev/blob/master/damlev.ts
     */
    return function damlev (source: string, target: string) {
      // If one of the strings is blank, returns the length of the other (the
      // cost of the n insertions)
      if (!source) {
        return target.length;
      } else if (!target){
        return source.length;
      }

      const sourceLength = source.length;
      const targetLength = target.length;
      let i: number;

      // Initialize a char code cache array
      sourceCodes = growArray(sourceCodes, sourceLength);
      targetCodes = growArray(targetCodes, targetLength);
      for (i = 0; i < sourceLength; i++) { sourceCodes[i] = source.charCodeAt(i); }
      for (i = 0; i < targetLength; i++) { targetCodes[i] = target.charCodeAt(i); }

      // Initialize the scoring matrix
      const INF = sourceLength + targetLength;
      const rowSize = sourceLength + 1;
      score = growArray(score, (sourceLength + 1) * (targetLength + 1));
      score[0] = INF;

      for (i = 0; i <= sourceLength; i++) {
        score[(i + 1) * rowSize] = INF;
        score[(i + 1) * rowSize + 1] = i;
      }

      for (i = 0; i <= targetLength; i++) {
        score[i] = INF;
        score[1 * rowSize + i + 1] = i;
      }

      // Run the damlev algorithm
      let chars: { [key: string]: number } = {};
      let j: number, DB: number, i1: number, j1: number, j2: number, newScore: number;
      for (i = 1; i <= sourceLength; i += 1) {
        DB = 0;
        for (j = 1; j <= targetLength; j += 1) {
          i1 = chars[targetCodes[j - 1]] || 0;
          j1 = DB;

          if (sourceCodes[i - 1] == targetCodes[j - 1]) {
            newScore = score[i * rowSize + j];
            DB = j;
          } else {
            newScore = Math.min(score[i * rowSize + j], Math.min(score[(i + 1) * rowSize + j], score[i * rowSize + j + 1])) + 1;
          }

          score[(i + 1) * rowSize + j + 1] = Math.min(newScore, score[i1 * rowSize + j1] + (i - i1) + (j - j1 - 1));
        }
        chars[sourceCodes[i - 1]] = i;
      }
      return score[(sourceLength + 1) * rowSize + targetLength + 1];
    };
  })();

  /**
   * Removes comment lines and then cleans up blank lines and trailing whitespace.
   *
   * @param {String} data The data from an affix file.
   * @return {String} The cleaned-up data.
   */
  function removeAffixComments(data: string): string {
    // Remove comments
    data = data.replace(/#.*$/mg, '');

    // Trim each line
    data = data.replace(/^\s\s*/m, '').replace(/\s\s*$/m, '');

    // Remove blank lines.
    data = data.replace(/\n{2,}/g, '\n');

    // Trim the entire string
    data = data.replace(/^\s\s*/, '').replace(/\s\s*$/, '');

    return data;
  }

	function parseRuleCodes(textCodes: string): string[] {
		if (!textCodes) {
			return [];
		}
		else if (!('FLAG' in flags)) {
			return textCodes.split('');
		}
		else if (flags.FLAG === 'long') {
			const flags: string[] = [];

			for (let i = 0, _len = textCodes.length; i < _len; i += 2) {
				flags.push(textCodes.substr(i, 2));
			}

			return flags;
		}
		else if (flags.FLAG === 'num') {
			return textCodes.split(',');
		}
	}
	/**
	 * Applies an affix rule to a word.
	 *
	 * @param {String} word The base word.
	 * @param {Object} rule The affix rule.
	 * @returns {String[]} The new words generated by the rule.
	 */

	function applyRule(word: string, rule: IAAFRule): string[] {
		const entries = rule.entries;
		let newWords: string[] = [];

		for (let i = 0, _len = entries.length; i < _len; i++) {
			const entry = entries[i];

			if (!entry.match || word.match(entry.match)) {
				let newWord = word;

				if (entry.remove) {
					newWord = newWord.replace(<any> entry.remove, '');
				}

				if (rule.type === 'SFX') {
					newWord = newWord + entry.add;
				}
				else {
					newWord = entry.add + newWord;
				}

				newWords.push(newWord);

				if (entry.continuationClasses) {
					for (let j = 0, _jlen = entry.continuationClasses.length; j < _jlen; j++) {
						const continuationRule = rules[entry.continuationClasses[j]];

						if (continuationRule) {
							newWords = newWords.concat(applyRule(newWord, continuationRule));
						}
						/*
						else {
							// This shouldn't happen, but it does, at least in the de_DE dictionary.
							// I think the author mistakenly supplied lower-case rule codes instead
							// of upper-case.
						}
						*/
					}
				}
			}
		}

		return newWords;
	};

	/**
	 * Parse the rules out from a .aff file.
	 *
	 * @param {String} data The contents of the affix file.
	 * @returns object The rules from the file.
	 */
  function parseAAF(data: string): { [ruleCode: string]: IAAFRule } {
    const rules: { [ruleCode: string]: IAAFRule } = Object.create(null);
    let line: string, subline: string, numEntries: number, lineParts: string[];
    let i: number, j: number, _len: number, _jlen: number;

    // Remove comment lines
    data = removeAffixComments(data);

    const lines = data.split('\n');

    for (i = 0, _len = lines.length; i < _len; i++) {
      line = lines[i];

      const definitionParts = line.split(/\s+/);
      const ruleType = definitionParts[0];

      if (ruleType == 'PFX' || ruleType == 'SFX') {
        const ruleCode = definitionParts[1];
        const combineable = definitionParts[2];
        numEntries = parseInt(definitionParts[3], 10);

        const entries: IAAFEntry[] = [];

        for (j = i + 1, _jlen = i + 1 + numEntries; j < _jlen; j++) {
          subline = lines[j];

          lineParts = subline.split(/\s+/);
          const charactersToRemove = lineParts[2];

          const additionParts = lineParts[3].split('/');

          let charactersToAdd = additionParts[0];
          if (charactersToAdd === '0') {
            charactersToAdd = '';
          }

          const continuationClasses = parseRuleCodes(additionParts[1]);
          const regexToMatch = lineParts[4];

          const entry: IAAFEntry = { add: charactersToAdd };

          if (continuationClasses.length > 0) {
            entry.continuationClasses = continuationClasses;
          }

          if (regexToMatch !== '.') {
            if (ruleType === 'SFX') {
              entry.match = new RegExp(regexToMatch + '$');
            }
            else {
              entry.match = new RegExp('^' + regexToMatch);
            }
          }

          if (charactersToRemove != '0') {
            if (ruleType === 'SFX') {
              entry.remove = new RegExp(charactersToRemove  + '$');
            }
            else {
              entry.remove = charactersToRemove;
            }
          }

          entries.push(entry);
        }

        rules[ruleCode] = {
          combineable: combineable === 'Y',
          entries,
          type: ruleType,
        };

        i += numEntries;
      }
      else if (ruleType === 'COMPOUNDRULE') {
        numEntries = parseInt(definitionParts[1], 10);

        for (j = i + 1, _jlen = i + 1 + numEntries; j < _jlen; j++) {
          line = lines[j];

          lineParts = line.split(/\s+/);
          compoundRules.push(lineParts[1]);
        }

        i += numEntries;
      }
      else if (ruleType === 'REP') {
        lineParts = line.split(/\s+/);

        if (lineParts.length === 3) {
          replacementTable.push([ lineParts[1], lineParts[2] ]);
        }
      }
      else {
        // ONLYINCOMPOUND
        // COMPOUNDMIN
        // FLAG
        // KEEPCASE
        // NEEDAFFIX

        (<any> flags)[ruleType] = definitionParts[1];
      }
    }

    return rules;
  }

  /**
   * Removes comment lines and then cleans up blank lines and trailing whitespace.
   *
   * @param {String} data The data from a .dic file.
   * @return {String} The cleaned-up data.
   */
  function removeDicComments(data: string): string {
    // I can't find any official documentation on it, but at least the de_DE
    // dictionary uses tab-indented lines as comments.

    // Remove comments
    data = data.replace(/^\t.*$/mg, '');

    return data;
  }

  function parseDIC(data: string): IDictionaryTable {
    data = removeDicComments(data);

    const lines = data.split('\n');
    const dictionaryTable: IDictionaryTable = Object.create(null);

    const addWord = (word: string, rules: any[]) => {
      // Some dictionaries will list the same word multiple times with different rule sets.
      if (!dictionaryTable[word]) {
        dictionaryTable[word] = null;
      }

      if (rules.length > 0) {
        if (dictionaryTable[word] === null) {
          dictionaryTable[word] = [];
        }

        dictionaryTable[word].push(rules);
      }
    }

    // The first line is the number of words in the dictionary.
    for (var i = 1, _len = lines.length; i < _len; i++) {
      const line = lines[i];

      const parts = line.split('/', 2);

      const word = parts[0];

      // Now for each affix rule, generate that form of the word.
      if (parts.length > 1) {
        const ruleCodesArray = parseRuleCodes(parts[1]);

        // Save the ruleCodes for compound word situations.
        if (!('NEEDAFFIX' in flags) || ruleCodesArray.indexOf(flags.NEEDAFFIX) == -1) {
          addWord(word, ruleCodesArray);
        }

        for (let j = 0, _jlen = ruleCodesArray.length; j < _jlen; j++) {
          const code = ruleCodesArray[j];
          const rule = rules[code];

          if (rule) {
            const newWords = applyRule(word, rule);

            for (let ii = 0, _iilen = newWords.length; ii < _iilen; ii++) {
              const newWord = newWords[ii];

              addWord(newWord, []);

              if (rule.combineable) {
                for (let k = j + 1; k < _jlen; k++) {
                  const combineCode = ruleCodesArray[k];
                  const combineRule = rules[combineCode];

                  if (combineRule) {
                    if (combineRule.combineable && (rule.type != combineRule.type)) {
                      const otherNewWords = applyRule(newWord, combineRule);

                      for (let iii = 0, _iiilen = otherNewWords.length; iii < _iiilen; iii++) {
                        const otherNewWord = otherNewWords[iii];
                        addWord(otherNewWord, []);
                      }
                    }
                  }
                }
              }
            }
          }

          if (compoundRuleCodes[code]) {
            compoundRuleCodes[code].push(word);
          }
        }
      }
      else {
        addWord(word.trim(), []);
      }
    }

    return dictionaryTable;
  }

	/**
	 * Checks whether a word exists in the current dictionary.
	 *
	 * @param {String} word The word to check.
	 * @returns {Boolean}
	 */

	function checkExact(word: string) {
		const ruleCodes = dictionaryTable[word];
		let i: number, _len: number;

		if (typeof ruleCodes === 'undefined') {
			// Check if this might be a compound word.
			if ('COMPOUNDMIN' in flags && word.length >= Number(flags.COMPOUNDMIN)) {
				for (i = 0, _len = compoundRules.length; i < _len; i++) {
					if (word.match(<any> compoundRules[i])) {
						return true;
					}
				}
			}
		}
		else if (ruleCodes === null) {
			// a null (but not undefined) value for an entry in the dictionary table
			// means that the word is in the dictionary but has no flags.
			return true;
		}
		else if (typeof ruleCodes === 'object') { // dictionary['hasOwnProperty'] will be a function.
			for (i = 0, _len = ruleCodes.length; i < _len; i++) {
				if (!hasFlag(word, 'ONLYINCOMPOUND', ruleCodes[i])) {
					return true;
				}
			}
		}

		return false;
	}

  	/**
	 * Looks up whether a given word is flagged with a given flag.
	 *
	 * @param {String} word The word in question.
	 * @param {String} flag The flag in question.
	 * @return {Boolean}
	 */

	function hasFlag(word: string, flag: string, wordFlags?: IAAFRule[]) {
		if (flag in flags) {
			if (typeof wordFlags === 'undefined') {
				wordFlags = Array.prototype.concat.apply([], dictionaryTable[word]);
			}

			if (wordFlags && wordFlags.indexOf((<any> flags)[flag]) !== -1) {
				return true;
			}
		}

		return false;
	}

  function generateDeletions(
    word: string,
    maxDistance: number,
    editDistance: number = 0,
    deletes: { [delItem: string]: boolean } = Object.create(null),
  ): string[] {
    if(word.length > 1 ) {
      for (let i = 0; i < word.length; i++) {
        let delItem: string = (word.substring(0, i) + word.substring(i + 1)).toLowerCase();

        if (!deletes[delItem]) {
          deletes[delItem] = true;
          if (editDistance + 1 < maxDistance) {
            generateDeletions(delItem, maxDistance, editDistance + 1, deletes);
          }
        }
      }
    }

    return editDistance === 0 ? Object.keys(deletes) : null;
  }

  function resolveDeletion(word: string): string[] {
    const t1 = lazyDeletionTable[word[0].toLowerCase()];
    if (!t1) {
      return;
    }

    for (let i = 1; i < maxEditDistance; i++) {
      let t2 = t1.children[(word[i] || '').toLowerCase()];
      if (!t2) {
        continue;
      }

      for (let k = 0; k < t2.length; k++) {
        if (lazilyResolvedWords[t2[k]]) {
          continue;
        }

        const deletions = generateDeletions(t2[k], 0);
        lazilyResolvedWords[t2[k]] = true;

        for (let j = 0; j < deletions.length; j++) {
          if (!deletionTable[deletions[j]]) {
            deletionTable[deletions[j]] = [t2[k]];
          } else {
            deletionTable[deletions[j]].push(t2[k]);
          }
        }
      }

      delete t1.children[word[i]];
    }
  }

  function prepareLazyTable() {
    lazilyResolvedWords = Object.create(null);

    for (let word in dictionaryTable) {
      let t1 = lazyDeletionTable[word[0]];
      if (!t1) {
        t1 = lazyDeletionTable[word[0]] = { children: {} };
      }

      for (let i = 1; i < maxEditDistance; i++) {
        let t2 = t1.children[(word[i] || '').toLowerCase()];
        if (!t2) {
          t1.children[word[i]] = [word];
        } else {
          t2.push(word);
        }
      }
    }
  }

  let memoized: { [word: string]: { suggestions: string[], limit: number } } = Object.create(null);

  const proc = {
    setup(affData: string, wordsData: string, lazy: boolean) {
      rules = parseAAF(affData);
      memoized = Object.create(null);
      deletionTable = Object.create(null);
      lazyDeletionTable = Object.create(null);

      // Save the rule codes that are used in compound rules.
      compoundRuleCodes = Object.create(null);
      for (let i = 0, _len = compoundRules.length; i < _len; i++) {
        const rule = <string> compoundRules[i];

        for (let j = 0, _jlen = rule.length; j < _jlen; j++) {
          compoundRuleCodes[rule[j]] = [];
        }
      }

      // If we add this ONLYINCOMPOUND flag to self.compoundRuleCodes, then _parseDIC
      // will do the work of saving the list of words that are compound-only.
      if (flags.ONLYINCOMPOUND) {
        compoundRuleCodes[flags.ONLYINCOMPOUND] = [];
      }

      dictionaryTable = parseDIC(wordsData);

      // Get rid of any codes from the compound rule codes that are never used
      // (or that were special regex characters).  Not especially necessary...
      for (let i in compoundRuleCodes) {
        if (compoundRuleCodes[i].length === 0) {
          delete compoundRuleCodes[i];
        }
      }

      // Build the full regular expressions for each compound rule.
      // I have a feeling (but no confirmation yet) that this method of
      // testing for compound words is probably slow.
      for (let i = 0, _len = compoundRules.length; i < _len; i++) {
        const ruleText = <string> compoundRules[i];
        let expressionText = '';

        for (let j = 0, _jlen = ruleText.length; j < _jlen; j++) {
          const character = ruleText[j];

          if (character in compoundRuleCodes) {
            expressionText += '(' + compoundRuleCodes[character].join('|') + ')';
          }
          else {
            expressionText += character;
          }
        }

        compoundRules[i] = new RegExp(expressionText, 'i');

        if (!lazy) {
          throw new Error('not implemented');
        } else {
          prepareLazyTable();
        }
      }
    },

    /**
     * Checks whether a word or a capitalization variant exists in the current dictionary.
     * The word is trimmed and several variations of capitalizations are checked.
     * If you want to check a word without any changes made to it, call checkExact()
     *
     * @see http://blog.stevenlevithan.com/archives/faster-trim-javascript re:trimming function
     *
     * @param {String} aWord The word to check.
     * @returns {Boolean}
     */
    check(aWord: string): boolean {

      // Remove leading and trailing whitespace
      const trimmedWord = aWord.replace(/^\s\s*/, '').replace(/\s\s*$/, '');

      if (checkExact(trimmedWord)) {
        return true;
      }

      // The exact word is not in the dictionary.
      if (trimmedWord.toUpperCase() === trimmedWord) {
        // The word was supplied in all uppercase.
        // Check for a capitalized form of the word.
        var capitalizedWord = trimmedWord[0] + trimmedWord.substring(1).toLowerCase();

        if (hasFlag(capitalizedWord, 'KEEPCASE')) {
          // Capitalization variants are not allowed for this word.
          return false;
        }

        if (checkExact(capitalizedWord)) {
          return true;
        }
      }

      var lowercaseWord = trimmedWord.toLowerCase();

      if (lowercaseWord !== trimmedWord) {
        if (hasFlag(lowercaseWord, 'KEEPCASE')) {
          // Capitalization variants are not allowed for this word.
          return false;
        }

        // Check for a lowercase form
        if (checkExact(lowercaseWord)) {
          return true;
        }
      }

      return false;
    },

    /**
     * Returns a list of suggestions for a misspelled word.
     *
     * @see http://www.norvig.com/spell-correct.html for the basis of this suggestor.
     * This suggestor is primitive, but it works.
     *
     * @param {String} word The misspelling.
     * @param {Number} limit The maximum number of suggestions to return.
     * @returns {String[]} The array of suggestions.
     */
    suggest(word: string, limit: number) {
      if (memoized[word]) {
        const memoizedLimit = memoized[word]['limit'];

        // Only return the cached list if it's big enough or if there weren't enough suggestions
        // to fill a smaller limit.
        if (limit <= memoizedLimit || memoized[word]['suggestions'].length < memoizedLimit) {
          return memoized[word]['suggestions'].slice(0, limit);
        }
      }

      if (proc.check(word)) return [];

      // Check the replacement table.
      for (let i = 0, _len = replacementTable.length; i < _len; i++) {
        const replacementEntry = replacementTable[i];

        if (word.indexOf(replacementEntry[0]) !== -1) {
          const correctedWord = word.replace(replacementEntry[0], replacementEntry[1]);

          if (proc.check(correctedWord)) {
            return [ correctedWord ];
          }
        }
      }

      function correct(word: string) {
        const deletions = generateDeletions(word, maxEditDistance);
        deletions.push(word);

        let corrections: string[] = [];
        for (let i = 0; i < deletions.length; i++) {
          resolveDeletion(deletions[i]);
          const words = deletionTable[deletions[i]];
          if (words) {
            for (let k = 0; k < words.length; k++) {
              if (corrections.indexOf(words[k]) === -1) {
                corrections.push(words[k]);
              }
            }
          }
        }

        const sortedCorrections: [string, number][] = <any> corrections.map(c => {
          return [c, damlev(word.toLowerCase(), c.toLowerCase())];
        });
        sortedCorrections.sort((a, b) => a[1] - b[1]);

        const rv: string[] = [];

        let capitalizationScheme = 'lowercase';
        if (word.toUpperCase() === word) {
          capitalizationScheme = 'uppercase';
        }
        else if (word.substr(0, 1).toUpperCase() + word.substr(1).toLowerCase() === word) {
          capitalizationScheme = 'capitalized';
        }

        for (let i = 0, _len = Math.min(limit, sortedCorrections.length); i < _len; i++) {
          if ('uppercase' === capitalizationScheme) {
            sortedCorrections[i][0] = sortedCorrections[i][0].toUpperCase();
          }
          else if ('capitalized' === capitalizationScheme) {
            sortedCorrections[i][0] = sortedCorrections[i][0].substr(0, 1).toUpperCase() + sortedCorrections[i][0].substr(1);
          }

          if (!hasFlag(sortedCorrections[i][0], 'NOSUGGEST')) {
            rv.push(sortedCorrections[i][0]);
          }
        }

        return rv;
      }

      memoized[word] = {
        'suggestions': correct(word),
        'limit': limit
      };

      return memoized[word]['suggestions'];
    },
  };

  return proc;
}

export interface ISetupCommand {
  action: 'setup';
  affData: string;
  wordsData: string;
  lazy: boolean;
}

export interface ICheckCommand {
  action: 'check';
  word: string;
}

export interface ISuggestCommend {
  action: 'suggest';
  word: string;
  limit: number;
}

export type IProcCommand = ISetupCommand
  | ICheckCommand
  | ISuggestCommend;

function entry(data: IProcCommand, proc = prefix()) {
  let result: any;

  switch (data.action) {
  case 'setup':
    proc.setup(data.affData, data.wordsData, data.lazy);
    break;
  case 'check':
    result = proc.check(data.word);
    break;
  case 'suggest':
    result = proc.suggest(data.word, data.limit);
    break;
  default:
    throw new Error(`Unknown action from data: ${JSON.stringify(data)}`);
  }

  postMessage(result, '');
}

export const prefixStr = `var proc = (${prefix})();`;
export const entryStr = `(${entry})(data, proc);`;

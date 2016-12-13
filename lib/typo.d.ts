/**
 * Typo is a JavaScript implementation of a spellchecker using hunspell-style
 * dictionaries.
 */
export default class Typo {
    private affData;
    private wordsData;
    private dictionaryPath;
    private worker;
    constructor(dictionary?: string, settings?: {
        dictionaryPath?: string;
    });
    loadDictionary(dictionary?: string, affData?: string, wordsData?: any): Promise<void>;
    private setup();
    check(word: string): Promise<boolean>;
    suggest(word: string, limit?: number): Promise<boolean>;
    destroy(): void;
}

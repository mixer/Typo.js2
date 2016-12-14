import { InlineWebWorker } from './worker';
import { entryStr, IProcCommand, prefixStr } from './proc';
import { readFile as readLocalFile } from 'fs';

function readFile(path: string): Promise<string> {
  if (typeof fetch !== 'undefined') { // browsers
    return fetch(path).then(res => res.text());
  }

  return new Promise((resolve, reject) => {
    readLocalFile(path, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString());
      }
    });
  });
}

/**
 * Typo is a JavaScript implementation of a spellchecker using hunspell-style
 * dictionaries.
 */
export default class Typo {

  private affData: string;
  private wordsData: string;
  private dictionaryPath: string;
  private worker: InlineWebWorker<IProcCommand, any>;

  constructor(settings: { dictionaryPath?: string } = {}) {
    Object.assign(this, settings);
  }

  public loadDictionary(dictionary?: string, options: {
    affData?: string;
    wordsData?: string;
    lazy?: boolean;
  } = {}): Promise<void> {
    let path: string;
    if (this.dictionaryPath) {
      path = this.dictionaryPath;
    }
    else if (typeof __dirname !== 'undefined') {
      path = `${__dirname}/dictionaries`;
    }
    else {
      path = './dictionaries';
    }

    let promise: Promise<any> = Promise.resolve();
    if (!options.affData) {
      promise = promise
        .then(() => readFile(`${path}/${dictionary}/${dictionary}.aff`))
        .then(data => this.affData = data);
    } else {
      this.affData = options.affData;
    }

    if (!options.wordsData) {
      promise = promise
        .then(() => readFile(`${path}/${dictionary}/${dictionary}.dic`))
        .then(data => this.wordsData = data);
    } else {
      this.wordsData = options.wordsData;
    }

    return promise.then(() => this.setup(options.lazy));
  }

  private setup(lazy: boolean = true): Promise<void> {
    if (this.worker) {
      this.worker.destroy();
    }

    this.worker = new InlineWebWorker<IProcCommand, any>(entryStr, prefixStr);
    return this.worker.run({
      action: 'setup',
      affData: this.affData,
      lazy,
      wordsData: this.wordsData,
    });
  }

  public check(word: string): Promise<boolean> {
    return this.worker.run({
      action: 'check',
      word,
    });
  }

  public suggest(word: string, limit: number = 5): Promise<boolean> {
    return this.worker.run({
      action: 'suggest',
      word,
      limit,
    });
  }

  public destroy() {
    this.worker.destroy();
  }
}

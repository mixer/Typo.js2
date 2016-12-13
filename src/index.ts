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

  public loadDictionary(dictionary?: string, affData?: string, wordsData?: any): Promise<void> {
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
    if (!affData) {
      promise = promise
        .then(() => readFile(`${path}/${dictionary}/${dictionary}.aff`))
        .then(data => this.affData = data);
    }
    if (!wordsData) {
      promise = promise
        .then(() => readFile(`${path}/${dictionary}/${dictionary}.dic`))
        .then(data => this.wordsData = data);
    }

    return promise.then(() => this.setup());
  }

  private setup(): Promise<void> {
    if (this.worker) {
      this.worker.destroy();
    }

    this.worker = new InlineWebWorker<IProcCommand, any>(entryStr, prefixStr);
    return this.worker.run({
      action: 'setup',
      wordsData: this.wordsData,
      affData: this.affData,
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

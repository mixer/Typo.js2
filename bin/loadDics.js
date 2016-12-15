#!/usr/bin/env node

require('any-observable/register/rxjs-all');

const BehaviorSubject = require('rxjs').BehaviorSubject;
const Observable = require('rxjs').Observable;
const Listr = require('listr');

const streamToObservable = require('stream-to-observable');
const parseXML = require('xml2js').parseString;
const figures = require('figures');
const mkdirp = Observable.bindNodeCallback(require('mkdirp'));
const chalk = require('chalk');
const execa = require('execa');
const split = require('split');
const path = require('path');
const glob = Observable.bindNodeCallback(require('glob'));
const fs = require('fs');

const tmpDir = path.join(__dirname, '../_languages');
const target = path.join(__dirname, '../lib/src/dictionaries');
const manifest = path.join(__dirname, '../lib/src/manifest.js');
const remote = 'git://anongit.freedesktop.org/libreoffice/dictionaries';

const exec = (cmd, args, options) => {
  const cp = execa(cmd, args, options);
  const ctrlCode = /[\x00-\x1F\x7F]/g;
  return Observable.merge(
    streamToObservable(cp.stdout.pipe(split(ctrlCode)), { await: cp }),
    streamToObservable(cp.stderr.pipe(split(ctrlCode)), { await: cp })
  );
};

function getAFFSibling(file) {
  return path.join(path.dirname(file), path.basename(file, '.dic')) + '.aff';
}

function getTargetDir(file) {
  return path.join(target, path.basename(file, path.extname(file)));
}

function copyFile(src, dest) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(src)
      .on('error', reject)
      .pipe(fs.createWriteStream(dest))
      .on('close', resolve)
      .on('error', reject);
  });
}

function copyDictionaryFile(file) {
  const dest = path.join(getTargetDir(file), path.basename(file));
  return copyFile(file, dest).then(() => file);
}

function getLicenseFiles(file) {
  const base = path.relative(tmpDir, file).split(path.sep).shift();
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(tmpDir, base, 'description.xml'), (err, data) => {
      if (err) {
        return reject(err);
      }

      parseXML(data.toString(), (err, tree) => {
        if (err) {
          return reject(err);
        }

        resolve(tree);
      });
    });
  }).then(tree => {
    let texts;
    try {
      texts = tree.description.registration
        .map(item => item['simple-license']
          .map(item => item['license-text'])
          .reduce((arr, item) => arr.concat(item), [])
        )
        .reduce((arr, item) => arr.concat(item), []);
    } catch (e) {}

    if (!Array.isArray(texts) || !texts.length) {
      return;
    }

    const license = texts.find(entry => entry.$.lang.startsWith('en')) || texts[0];
    return path.join(tmpDir, base, license.$['xlink:href']);
  });
}

const dictionaries = [];
const warnings = [];
const tasks = new Listr([
  {
    title: 'Cloning languages repo',
    task: () => {
      return fs.existsSync(tmpDir)
        ? exec('git', ['pull', '-v'], { cwd: tmpDir })
        : exec(
          'git',
          ['clone', remote, path.basename(tmpDir), '--depth', 1, '--progress'],
          { cwd: path.dirname(tmpDir) }
        );
    },
  },
  {
    title: 'Compiling dictionaries',
    task: () => new Observable(progress =>
      glob(`${tmpDir}/**/*.dic`)
        // flatten the list of files to distinct items in the stream
        .mergeMap(files => Observable.from(files))
        // exclude non-standard hyphenation rules, we don't use them:
        .filter(file => !path.basename(file).startsWith('hyph_'))
        // Copy the dict file
        .mergeMap(file => mkdirp(getTargetDir(file)).map(() => file))
        .do(file => progress.next(`Copying ${path.basename(file)}`))
        .mergeMap(file => copyDictionaryFile(file))
        // Copy the aff file
        .map(file => getAFFSibling(file))
        .do(file => progress.next(`Copying ${path.basename(file)}`))
        .filter(file => {
          if (!fs.existsSync(file)) {
            warnings.push(`Cannot find AFF sibling ${file}`);
            return false;
          }

          return true;
        })
        .mergeMap(file => copyDictionaryFile(file))
        .do(file => dictionaries.push(path.basename(file, path.extname(file))))
        // Copy any licenses over.
        .do(file => progress.next(`Finding license files for ${path.basename(file, '.aff')}`))
        .mergeMap(file => {
          return getLicenseFiles(file).then(license => {
            if (license) {
              return copyFile(license, path.join(getTargetDir(file), path.basename(license)));
            }
          });
        })
        .subscribe(
          () => {},
          err => progress.error(err),
          () => progress.complete()
        )
    ),
  },
  {
    title: 'Writing manifest',
    task: () => fs.writeFileSync(manifest, `
      "use strict";
      exports.dictionaries = ${JSON.stringify(dictionaries)};
    `),
  }
]);

tasks.run()
  .then(() => {
    if (warnings.length === 0) {
      return process.exit(0);
    }

    console.log(chalk.yellow('Loading completed, but with warnings:'));
    warnings.forEach(warn => console.log(` ${chalk.yellow(figures.warning)} ${warn}`));
  })
  .catch(err => {
    console.error(chalk.red(err.stack || err));
    process.exit(1);
  });

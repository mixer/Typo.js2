"use strict";
var worker_1 = require('./worker');
var proc_1 = require('./proc');
var fs_1 = require('fs');
function readFile(path) {
    if (typeof fetch !== 'undefined') {
        return fetch(path).then(function (res) { return res.text(); });
    }
    return new Promise(function (resolve, reject) {
        fs_1.readFile(path, function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data.toString());
            }
        });
    });
}
/**
 * Typo is a JavaScript implementation of a spellchecker using hunspell-style
 * dictionaries.
 */
var Typo = (function () {
    function Typo(dictionary, settings) {
        if (settings === void 0) { settings = {}; }
        if (dictionary) {
            this.loadDictionary(dictionary);
        }
        Object.assign(this, settings);
    }
    Typo.prototype.loadDictionary = function (dictionary, affData, wordsData) {
        var _this = this;
        var path;
        if (this.dictionaryPath) {
            path = this.dictionaryPath;
        }
        else if (typeof __dirname !== 'undefined') {
            path = __dirname + "/dictionaries";
        }
        else {
            path = './dictionaries';
        }
        var promise = Promise.resolve();
        if (!affData) {
            promise = promise
                .then(function () { return readFile(path + "/" + dictionary + "/" + dictionary + ".aff"); })
                .then(function (data) { return _this.affData = data; });
        }
        if (!wordsData) {
            promise = promise
                .then(function () { return readFile(path + "/" + dictionary + "/" + dictionary + ".dic"); })
                .then(function (data) { return _this.wordsData = data; });
        }
        return promise.then(function () { return _this.setup(); });
    };
    Typo.prototype.setup = function () {
        if (this.worker) {
            this.worker.destroy();
        }
        this.worker = new worker_1.InlineWebWorker(proc_1.entryStr, proc_1.prefixStr);
        return this.worker.run({
            action: 'setup',
            wordsData: this.wordsData,
            affData: this.affData,
        });
    };
    Typo.prototype.check = function (word) {
        return this.worker.run({
            action: 'check',
            word: word,
        });
    };
    Typo.prototype.suggest = function (word, limit) {
        if (limit === void 0) { limit = 5; }
        return this.worker.run({
            action: 'suggest',
            word: word,
            limit: limit,
        });
    };
    Typo.prototype.destroy = function () {
        this.worker.destroy();
    };
    return Typo;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Typo;

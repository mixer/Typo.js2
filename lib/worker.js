"use strict";
/**
 * InlineWebWorker is a shim that takes a function script and creates
 * a webworker for it which can be called almost like a normal function.
 * This is created so that 1) we can bundle for browsers easily, 2)
 * so that we can call scripts synchronously when needed, 3) we can easily
 * type what we send to workers, and 4) for promises.
 *
 * A bit of the strategies here have been taken from:
 * https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
 */
var InlineWebWorker = (function () {
    function InlineWebWorker(script, prefix) {
        if (prefix === void 0) { prefix = ''; }
        this.rpcIncr = 0;
        this.syncFn = new Function('data', 'postMessage', prefix + ";" + script);
        var blob = new Blob([("\n      var postMessageSrc = postMessage;\n      " + prefix + "\n      onmessage = function (e) {\n        var rpcCallbackId = e.data.rpcId;\n        var data = e.data.data;\n        var postMessage = function (result) {\n           postMessageSrc({ rpcId: rpcCallbackId, data: result });\n        };\n\n        try {\n           " + script + "\n        } catch (e) {\n          // Send the stack, not the Error; Errors cannot be copied\n          // and trying to send them will cause a different error!\n          postMessageSrc({ rpcId: rpcCallbackId, err: String(e.stack) });\n        }\n      };\n    ")]);
        if (typeof Worker !== undefined) {
            this.workerBlobUrl = URL.createObjectURL(blob);
            this.worker = new Worker(this.workerBlobUrl);
        }
    }
    /**
     * Runs the underlying worker and returns a promise resolved when the
     * operation is complete.
     */
    InlineWebWorker.prototype.run = function (data) {
        var _this = this;
        if (!this.worker) {
            return Promise.resolve(this.sync(data));
        }
        return new Promise(function (resolve, reject) {
            var rpcId = _this.rpcIncr++;
            var start = performance.now();
            var callback = function (e) {
                var result = e.data;
                if (result.rpcId !== rpcId) {
                    return;
                }
                if (result.err) {
                    return reject(new Error("Error from webworker: " + result.err));
                }
                _this.worker.removeEventListener('message', callback);
                resolve(result.data);
            };
            _this.worker.addEventListener('message', callback);
            _this.worker.postMessage({ data: data, rpcId: rpcId });
        });
    };
    /**
     * sync runs the webwork function synchronously and returns its result.
     * Note that the input to this function MAY be mutated!
     */
    InlineWebWorker.prototype.sync = function (data) {
        var output;
        var invoked = false;
        this.syncFn(data, function (result) {
            output = result;
            invoked = true;
        });
        if (!invoked) {
            throw new Error('Expected worker to synchronously return data');
        }
        return output;
    };
    /**
     * Frees resources associated with the worker. The worker itself will
     * terminate at some point after all ongoing requests finish.
     */
    InlineWebWorker.prototype.destroy = function () {
        URL.revokeObjectURL(this.workerBlobUrl);
    };
    return InlineWebWorker;
}());
exports.InlineWebWorker = InlineWebWorker;

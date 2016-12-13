type SyncFn<T, R> = ((data: T, postData: (result: R) => void) => void);

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
export class InlineWebWorker<T, R> {
  private syncFn: SyncFn<T, R>;
  private worker: Worker;
  private workerBlobUrl: string;
  private rpcIncr = 0;

  constructor(script: string, prefix: string = '') {
    this.syncFn = <SyncFn<T, R>>(new Function('data', 'postMessage', `
      ${prefix};
      return function (data, postMessage) {
        ${script}
      };
    `)());

    if (typeof Worker !== undefined) { // disable web workers on old browsers or Node
      return;
    }

    const blob = new Blob([`
      var postMessageSrc = postMessage;
      ${prefix}
      onmessage = function (e) {
        var rpcCallbackId = e.data.rpcId;
        var data = e.data.data;
        var postMessage = function (result) {
           postMessageSrc({ rpcId: rpcCallbackId, data: result });
        };

        try {
           ${script}
        } catch (e) {
          // Send the stack, not the Error; Errors cannot be copied
          // and trying to send them will cause a different error!
          postMessageSrc({ rpcId: rpcCallbackId, err: String(e.stack) });
        }
      };
    `]);

    this.workerBlobUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerBlobUrl);
  }

  /**
   * Runs the underlying worker and returns a promise resolved when the
   * operation is complete.
   */
  public run(data: T): Promise<R> {
    if (!this.worker) {
      return Promise.resolve(this.sync(data));
    }

    return new Promise((resolve, reject) => {
      const rpcId = this.rpcIncr++;
      const start = performance.now();
      const callback = (e: MessageEvent) => {
        const result: { rpcId: number, data?: R, err: string } = e.data;
        if (result.rpcId !== rpcId) {
           return;
        }
        if (result.err) {
           return reject(new Error(`Error from webworker: ${result.err}`));
        }

        this.worker.removeEventListener('message', callback);
        resolve(result.data);
      };

      this.worker.addEventListener('message', callback);
      this.worker.postMessage({ data, rpcId });
    });
  }

  /**
   * sync runs the webwork function synchronously and returns its result.
   * Note that the input to this function MAY be mutated!
   */
  public sync(data: T): R {
    let output: R;
    let invoked = false;
    this.syncFn(data, result => {
        output = result;
        invoked = true;
    });

    if (!invoked) {
      throw new Error('Expected worker to synchronously return data');
    }

    return output;
  }

  /**
   * Frees resources associated with the worker. The worker itself will
   * terminate at some point after all ongoing requests finish.
   */
  public destroy() {
     URL.revokeObjectURL(this.workerBlobUrl);
  }
}

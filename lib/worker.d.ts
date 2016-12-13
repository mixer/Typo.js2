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
export declare class InlineWebWorker<T, R> {
    private syncFn;
    private worker;
    private workerBlobUrl;
    private rpcIncr;
    constructor(script: string, prefix?: string);
    /**
     * Runs the underlying worker and returns a promise resolved when the
     * operation is complete.
     */
    run(data: T): Promise<R>;
    /**
     * sync runs the webwork function synchronously and returns its result.
     * Note that the input to this function MAY be mutated!
     */
    sync(data: T): R;
    /**
     * Frees resources associated with the worker. The worker itself will
     * terminate at some point after all ongoing requests finish.
     */
    destroy(): void;
}

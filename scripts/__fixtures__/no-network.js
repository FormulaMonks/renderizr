/**
 * Preloaded into the CLI's child process (via `--import`) so that a build of
 * the fixture workspace proves it needs no network, instead of merely not
 * happening to use one on the machine the suite runs on.
 */

globalThis.fetch = (url) => {
    throw new Error(
        `the build reached the network for ${url}; the fixture build must be offline`,
    );
};

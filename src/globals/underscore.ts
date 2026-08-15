import lodash from "lodash";

// Must be on `window` before dagre's browser build evaluates: it resolves its
// own lodash through the global rather than bundling a second copy.
window._ = lodash;

export default lodash;

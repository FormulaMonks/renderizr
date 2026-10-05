/**
 * The diagram contract (spec section 3): what the page may reach of the
 * engine. React types never cross it (ADR 3).
 */

export { type Engine, isAbortError } from "./contract";
export { mountEngine } from "./react-flow";

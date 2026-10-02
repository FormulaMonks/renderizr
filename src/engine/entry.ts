import type { WorkspaceSummary } from "../components/navigation";
import type Page from "../pages/_page";

/**
 * What an engine hands the app at boot. The build picks exactly one engine
 * (`--engine`, ADR 12) by resolving `virtual:renderizr-engine` to its entry
 * module, so the other never reaches the bundle.
 */
export type EngineEntry = {
    workspace: WorkspaceSummary;
    DiagramsPage: new (container: HTMLElement | null, name: string) => Page;
    /** Footer credit for whatever draws the diagrams, as HTML. */
    credit: string;
};

import type { View } from "./structurizr-workspace";

export type Diagram = {
    animationStarted(): boolean;
    autoPageSize(): void;
    changeView(key: string): void;
    currentViewHasAnimation(): boolean;
    currentViewIsDynamic(): boolean;
    exportCurrentDiagramToPNG(
        includeDiagramMetadata: boolean,
        crop: boolean,
        callback?: (png: string) => void,
    ): string;
    /**
     * `undefined` until a view has actually been rendered — the diagram is
     * constructed empty and only gets a view when `changeView()` runs. Several
     * of the methods below dereference it without checking (`stopAnimation()`
     * reaches `currentView.type` through `currentViewIsDynamic()`), so callers
     * that can run before the first render must guard on this.
     */
    getCurrentView(): View | undefined;
    getWidth(): number;
    getHeight(): number;
    isDarkMode(): boolean;
    zoomIn(event?: Event): void;
    zoomOut(event?: Event): void;
    zoomTo(scale: number): void;
    scrollToCenter(): void;
    onAnimationStarted(callback: () => void): void;
    onAnimationStopped(callback: () => void): void;
    onElementDoubleClicked(
        callback: (event: Event, elementId: string) => void,
    ): void;
    onViewChanged(callback: (view: string) => void): void;
    resize(): void;
    setDarkMode(enabled: boolean): void;
    setNavigationEnabled(enabled: boolean): void;
    startAnimation(autoPlay: boolean): void;
    stepBackwardInAnimation(): void;
    stepForwardInAnimation(): void;
    stopAnimation(): void;
    toggleDescription(): void;
    toggleMetadata(): void;
    zoomToWidthOrHeight(): void;
    zoomFitContent(): void;
    getAspectRatio(): number;
    currentViewIsImage(): boolean;
    setEmbedded(embedded: boolean): void;
};

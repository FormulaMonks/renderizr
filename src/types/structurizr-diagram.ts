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
    getCurrentView(): View;
    getWidth(): number;
    getHeight(): number;
    isDarkMode(): boolean;
    zoomIn(event?: Event): void;
    zoomOut(event?: Event): void;
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
    runDagre(
        rankDirection: "TopBottom" | "BottomTop" | "LeftRight" | "RightLeft",
        rankSeparation: number,
        nodeSeparation: number,
        edgeSeparation: number,
        linkVertices: boolean,
        margin: number,
        resize: boolean,
    ): void;
};

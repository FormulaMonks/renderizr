import type { View } from "./structurizr-workspace";

export type Diagram = {
    setNavigationEnabled(enabled: boolean): void;
    resize(): void;
    zoomToWidthOrHeight(): void;
    changeView(key: string): void;
    onViewChanged(callback: (view: string) => void): void;
    setDarkMode(enabled: boolean): void;
    exportCurrentDiagramToPNG(
        includeDiagramMetadata: boolean,
        crop: boolean,
        callback?: (png: string) => void,
    ): string;
    onElementDoubleClicked(
        callback: (event: Event, elementId: string) => void,
    ): void;
    getCurrentView(): View;
};

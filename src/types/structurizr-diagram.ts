export type Diagram = {
    setNavigationEnabled(enabled: boolean): void;
    resize(): void;
    zoomToWidthOrHeight(): void;
    changeView(key: string): void;
    onViewChanged(callback: (view: string) => void): void;
    exportCurrentDiagramToPNG(
        includeDiagramMetadata: boolean,
        crop: boolean,
        callback?: (png: string) => void,
    ): string;
};

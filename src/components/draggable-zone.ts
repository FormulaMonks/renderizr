import Panzoom, {
    type PanzoomObject,
    type PanzoomEventDetail,
} from "@panzoom/panzoom";

export default class DraggableZone {
    #panzoom: PanzoomObject | null = null;
    #el: HTMLElement | null = null;

    constructor(element: HTMLElement | null) {
        this.#el = element;
        this.resetZoom();
    }

    resetZoom() {
        if (this.#panzoom) {
            this.#panzoom.destroy();
        }

        if (!this.#el) return;

        this.#panzoom = Panzoom(this.#el, {
            canvas: true,
            panOnlyWhenZoomed: true,
            minScale: 1,
        });

        this.#el.addEventListener("panzoomzoom", (event: Event) => {
            const detail: PanzoomEventDetail = (event as CustomEvent).detail;

            if (detail.scale <= 1.03) {
                this.#panzoom?.reset();
            }
        });

        const handleWheel = (event: WheelEvent) => {
            event.stopPropagation();
            event.preventDefault();

            // Snippet from here:
            // https://github.com/bensmithett/structurizr-mini/blob/8f95c703ee468f6fa5013b4a530a8c6c630119ec/modules/Router.js#L84
            const delta =
                event.deltaY === 0 && event.deltaX
                    ? event.deltaX
                    : event.deltaY;
            const scale = this.#panzoom?.getScale() ?? 0;
            const toScale = scale * Math.exp((delta * 0.3 * -1) / 300);
            this.#panzoom?.zoomToPoint(toScale, event);
        };

        this.#el.parentElement?.addEventListener("wheel", handleWheel);
    }
}

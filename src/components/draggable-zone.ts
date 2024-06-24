import Panzoom, {
    type PanzoomObject,
    type PanzoomEventDetail,
} from "@panzoom/panzoom";
import Component from "./_component";

export default class DraggableZone extends Component {
    #panzoom: PanzoomObject | null = null;
    #el: HTMLElement | null = null;

    constructor(element: HTMLElement | null) {
        super();
        this.#el = element;
        this.render();
    }

    #panzoomZoomHandler = (event: Event) => {
        const detail: PanzoomEventDetail = (event as CustomEvent).detail;

        if (detail.scale <= 1.03) {
            this.#panzoom?.reset();
        }
    };

    #handleWheel = (event: WheelEvent) => {
        event.stopPropagation();
        event.preventDefault();

        // Snippet from here:
        // https://github.com/bensmithett/structurizr-mini/blob/8f95c703ee468f6fa5013b4a530a8c6c630119ec/modules/Router.js#L84
        const delta =
            event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
        const scale = this.#panzoom?.getScale() ?? 0;
        const toScale = scale * Math.exp((delta * 0.3 * -1) / 300);
        this.#panzoom?.zoomToPoint(toScale, event);
    };

    render() {
        if (this.#panzoom) {
            this.#panzoom.destroy();
        }

        if (!this.#el) return;

        this.#panzoom = Panzoom(this.#el, {
            canvas: true,
            panOnlyWhenZoomed: true,
            minScale: 1,
        });

        this.#el.addEventListener("panzoomzoom", this.#panzoomZoomHandler);
        this.#el.parentElement?.addEventListener("wheel", this.#handleWheel);
    }

    clear() {
        this.#el?.removeEventListener("panzoomzoom", this.#panzoomZoomHandler);
        this.#el?.parentElement?.addEventListener("wheel", this.#handleWheel);
        if (this.#panzoom) {
            this.#panzoom.destroy();
        }
    }
}

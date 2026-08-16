import Component from "./_component";

type ScrollSpyOptions = {
    /** Elements to track, in document order. */
    targets: HTMLElement[];
    onChange: (id: string | null) => void;
};

/** Fraction of the viewport, measured up from the bottom, that is out of play. */
const BAND_BOTTOM = 0.65;

/** Smallest observation band worth having, in pixels. */
const MIN_BAND = 72;

/** Breathing room between the sticky header and the top of the band. */
const HEADER_GAP = 8;

/**
 * Tracks which of `targets` the reader is currently on and reports its `id`.
 *
 * The document owns the scroll, so the observation root is the viewport rather
 * than any container, and the band it watches starts below the sticky
 * `.workspace-header` — a heading tucked under that header is not the heading
 * the reader is looking at.
 */
export default class ScrollSpy extends Component {
    #targets: HTMLElement[];
    #onChange: (id: string | null) => void;
    #observer: IntersectionObserver | null = null;
    #intersecting = new Set<HTMLElement>();
    #activeId: string | null = null;
    #scrollFrame = 0;
    #resizeFrame = 0;

    constructor(options: ScrollSpyOptions) {
        // There is nothing to render into: the viewport is the scroll
        // container, and the targets already live in the document.
        super(null);
        this.#targets = options.targets;
        this.#onChange = options.onChange;
    }

    /**
     * The header's live height, the same measurement `trackHeaderHeight()`
     * publishes as `--header-height`. Read from the element rather than the
     * custom property because the property's declared fallback is in `rem`.
     */
    #headerHeight() {
        const header = document.querySelector(".workspace-header");
        return header ? Math.round(header.getBoundingClientRect().height) : 0;
    }

    #onIntersect = (entries: IntersectionObserverEntry[]) => {
        for (const entry of entries) {
            const target = entry.target as HTMLElement;

            if (entry.isIntersecting) this.#intersecting.add(target);
            else this.#intersecting.delete(target);
        }

        this.#update();
    };

    /**
     * The observer alone cannot see the end of the content: over the last
     * stretch of scrolling no heading crosses the band, so no callback fires.
     * A coalesced scroll listener covers that; `#update()` bails out when the
     * result is unchanged, so this stays cheap.
     */
    #onScroll = () => {
        if (this.#scrollFrame) return;

        this.#scrollFrame = window.requestAnimationFrame(() => {
            this.#scrollFrame = 0;
            this.#update();
        });
    };

    /** The band is measured in pixels, so it has to be rebuilt on resize. */
    #onResize = () => {
        if (this.#resizeFrame) return;

        this.#resizeFrame = window.requestAnimationFrame(() => {
            this.#resizeFrame = 0;
            this.#connect();
            this.#update();
        });
    };

    #atEnd() {
        const { scrollHeight } = document.documentElement;
        const viewport = window.innerHeight;

        // Nothing to scroll: no target can be "the one at the bottom".
        if (scrollHeight - viewport <= 4) return false;

        return window.scrollY + viewport >= scrollHeight - 2;
    }

    #currentTarget(): HTMLElement | null {
        if (!this.#targets.length) return null;

        // Bottom of the document: the last target wins, even when it never
        // reaches the observation band.
        if (this.#atEnd()) {
            return this.#targets[this.#targets.length - 1];
        }

        // Topmost target inside the observation band.
        for (const target of this.#targets) {
            if (this.#intersecting.has(target)) return target;
        }

        // Nothing in the band: the last target that scrolled above it, falling
        // back to the first one when the reader sits above every target.
        const ceiling = this.#headerHeight() + HEADER_GAP;
        let above: HTMLElement | null = null;

        for (const target of this.#targets) {
            if (target.getBoundingClientRect().top - ceiling > 1) break;
            above = target;
        }

        return above ?? this.#targets[0];
    }

    #update() {
        const id = this.#currentTarget()?.id ?? null;

        if (id === this.#activeId) return;

        this.#activeId = id;
        this.#onChange(id);
    }

    #connect() {
        this.#disconnect();

        if (!this.#targets.length) return;

        const top = this.#headerHeight() + HEADER_GAP;
        // Keep the band from collapsing on short viewports, where the header
        // alone can eat most of the screen.
        const bottom = Math.min(
            Math.round(window.innerHeight * BAND_BOTTOM),
            Math.max(window.innerHeight - top - MIN_BAND, 0),
        );

        this.#observer = new IntersectionObserver(this.#onIntersect, {
            root: null,
            rootMargin: `${-top}px 0px ${-bottom}px 0px`,
            threshold: 0,
        });

        for (const target of this.#targets) {
            this.#observer.observe(target);
        }
    }

    #disconnect() {
        this.#observer?.disconnect();
        this.#observer = null;
        this.#intersecting.clear();
    }

    render() {
        this.clear();

        if (!this.#targets.length) {
            this.#onChange(null);
            return;
        }

        this.#connect();

        window.addEventListener("scroll", this.#onScroll, { passive: true });
        window.addEventListener("resize", this.#onResize, { passive: true });

        this.#update();
    }

    clear() {
        this.#disconnect();

        window.removeEventListener("scroll", this.#onScroll);
        window.removeEventListener("resize", this.#onResize);

        if (this.#scrollFrame) {
            window.cancelAnimationFrame(this.#scrollFrame);
            this.#scrollFrame = 0;
        }

        if (this.#resizeFrame) {
            window.cancelAnimationFrame(this.#resizeFrame);
            this.#resizeFrame = 0;
        }

        this.#activeId = null;
    }
}

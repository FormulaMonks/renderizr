import type { Location } from "history";
import type Page from "../pages/_page";
import Component from "./_component";
import history from "history/hash";

export default class Router extends Component {
    #pageContainer: HTMLElement;
    #pages: Map<string, Page> = new Map();
    #currentPage: Page | null = null;

    constructor(element: HTMLElement, pages: Page[]) {
        super(element);
        this.#pageContainer = element;
        this.#pages = new Map(
            pages.map((pageInstance) => [
                pageInstance.name.toLowerCase(),
                pageInstance.setContainer(this.#pageContainer),
            ]),
        );

        const search = new URLSearchParams(history.location.search);
        const page = search.get("page");

        history.listen((update) => {
            const currentPageName = this.#currentPage?.name.toLowerCase();
            const search = new URLSearchParams(update.location.search);
            const page = search.get("page");

            // Arriving from Back, Forward, or a pasted link: the URL already
            // says where we are, so record nothing.
            if (page && currentPageName !== page) {
                this.navigateTo(page, update.location.search, true);
            }
        });

        const [firstPage] = this.#pages.keys();
        // The first render only fills in what the URL left out.
        this.navigateTo(page ?? firstPage, history.location.search, true);
    }

    /**
     * @param replace Rewrite the current history entry instead of adding one.
     * Filling in a default, following the URL, and redirecting away from an
     * unknown page are all corrections to where the reader already is — pushing
     * for those is what made the Back button need two presses per navigation.
     */
    navigateTo(
        pageName: string,
        search: Location["search"] = "",
        replace = false,
    ): void {
        if (this.#currentPage) this.#currentPage.clear();

        if (!this.#pages.has(pageName)) {
            const [firstPage] = this.#pages.keys();
            this.navigateTo(firstPage, search, true);
            return;
        }

        this.#currentPage = this.#pages.get(pageName)!;
        // Lets the page decide how much room the shared header may take.
        document.documentElement.dataset.page = pageName;

        const newSearch = new URLSearchParams(search);
        newSearch.set("page", pageName);

        const next = {
            search: newSearch.toString(),
            hash: history.location.hash,
        };

        // `URLSearchParams.toString()` has no leading "?" and
        // `history.location.search` does, so comparing them directly never
        // matched and re-navigating to the page already open pushed a second
        // identical entry — one more Back press to leave the page.
        const currentSearch = history.location.search.replace(/^\?/, "");

        if (replace || newSearch.toString() === currentSearch) {
            history.replace(next);
        } else {
            history.push(next);
        }

        this.render();
    }

    render() {
        this.#currentPage!.render();
    }

    clear() {
        this.#currentPage!.clear();
    }
}

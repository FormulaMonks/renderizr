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

            if (page && currentPageName !== page) this.navigateTo(page);
        });

        if (!page) {
            const [firstPage] = this.#pages.keys();
            this.navigateTo(firstPage, history.location.search);
        } else {
            this.navigateTo(page, history.location.search);
        }
    }

    navigateTo(pageName: string, search: Location["search"] = ""): void {
        if (this.#currentPage) this.#currentPage.clear();
        if (!this.#pages.has(pageName)) {
            console.warn(
                `Page ${pageName} not found. Redirecting to first page.`,
            );
            const [firstPage] = this.#pages.keys();
            this.navigateTo(firstPage);
            return;
        }

        this.#currentPage = this.#pages.get(pageName)!;
        const newSearch = new URLSearchParams(search);
        newSearch.set("page", pageName);
        history.push({
            search: newSearch.toString(),
            hash: history.location.hash,
        });
        this.render();
    }

    render() {
        this.#currentPage!.render();
    }
    clear() {
        this.#currentPage!.clear();
    }
}

import type { Location } from "history";
import type Page from "../pages/_page";
import Component from "./_component";
import history from "history/browser";

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

        const pageName = history.location.pathname.replace(/\/([^/]+).*/, "$1");

        history.listen((update) => {
            const currentPageName = this.#currentPage?.name.toLowerCase();
            const pageName = update.location.pathname.replace(
                /\/([^/]+).*/,
                "$1",
            );

            if (currentPageName !== pageName) this.navigateTo(pageName);
        });

        if (pageName === "/") {
            const [firstPage] = this.#pages.keys();
            this.navigateTo(firstPage, history.location.search);
        } else {
            this.navigateTo(pageName, history.location.search);
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
        history.push(`/${pageName}${search}`);
        this.render();
    }

    render() {
        this.#currentPage!.render();
    }
    clear() {
        this.#currentPage!.clear();
    }
}

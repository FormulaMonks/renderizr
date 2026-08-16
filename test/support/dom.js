/**
 * A DOM small enough to read and large enough to run this application.
 *
 * The product is a browser SPA. Its router, menu, and three page controllers
 * are the parts that break, and none of them can be exercised without a
 * document to write into. Node has no DOM, and adding jsdom would add a
 * dependency (and 3MB) for the sake of the test suite alone — so this is the
 * subset the application actually uses, written out: parsing, serializing,
 * selectors, events, and the handful of window APIs the components reach for.
 *
 * It is deliberately not a DOM implementation. It has no layout, no CSS
 * cascade, and no HTML parse-error recovery. It is checked against its own
 * behavior in `test/dom.test.js`, so a test that passes here is resting on
 * something that has itself been tested.
 *
 * Design notes for anyone extending it:
 *
 *   - Timers and animation frames on `window` are *fake*. Nothing runs until a
 *     test calls `runTimers()`. That is what makes the page tests
 *     deterministic — `pages/adrs.ts` defers its first paint by 100ms and the
 *     suite never sleeps.
 *   - `installDOM()` returns the same window every time it is called in a
 *     process. It has to: `history/hash` captures `document.defaultView` when
 *     it is first imported, and a second window would leave that singleton
 *     pointing at a document nobody can see. Use `dom.reset()` between tests.
 *   - `parseSelector()` **throws** on any selector syntax it does not
 *     implement rather than silently matching nothing. That is deliberate — it
 *     is how a `button:last-child` that had quietly stopped matching was
 *     caught — but it means perfectly valid CSS a component ships can fail
 *     here and nowhere else. The escape hatch is to extend the engine
 *     (`SIMPLE_PATTERN` and `matchesCompound`) and add a case to
 *     `test/dom.test.js`. It is never to rewrite the component's selector into
 *     something this file happens to understand: the component's selector is
 *     the product, this file is the instrument.
 */

const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

/** Elements whose content is text, not markup. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/** Attribute-backed properties, so `a.href` and `img.src` behave. */
const REFLECTED = ["href", "src", "alt", "title", "type", "name", "id"];

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
    hellip: "\u2026",
    mdash: "\u2014",
    ndash: "\u2013",
    rsquo: "\u2019",
    lsquo: "\u2018",
    ldquo: "\u201c",
    rdquo: "\u201d",
};

export function decodeEntities(value) {
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
        if (body[0] === "#") {
            const code =
                body[1] === "x" || body[1] === "X"
                    ? Number.parseInt(body.slice(2), 16)
                    : Number.parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });
}

const escapeText = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const camelCase = (name) =>
    name.replace(/-([a-z])/g, (__, letter) => letter.toUpperCase());

const kebabCase = (name) =>
    name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export class DOMEvent {
    constructor(type, { bubbles = false, cancelable = true } = {}) {
        this.type = type;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.defaultPrevented = false;
        this.target = null;
        this.currentTarget = null;
        this._stopped = false;
    }

    preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
    }

    stopPropagation() {
        this._stopped = true;
    }

    stopImmediatePropagation() {
        this._stopped = true;
    }
}

class DOMEventTarget {
    #listeners = new Map();

    addEventListener(type, handler) {
        if (!handler) return;
        const forType = this.#listeners.get(type) ?? [];
        if (!forType.includes(handler)) forType.push(handler);
        this.#listeners.set(type, forType);
    }

    removeEventListener(type, handler) {
        const forType = this.#listeners.get(type);
        if (!forType) return;
        this.#listeners.set(
            type,
            forType.filter((entry) => entry !== handler),
        );
    }

    /** Everything registered for `type`, in registration order. */
    listenersFor(type) {
        return [...(this.#listeners.get(type) ?? [])];
    }

    /**
     * Window listeners outlive a test — `history/hash` registers `popstate`
     * and `hashchange` when it is imported, and a component that leaks one
     * would otherwise keep firing in the next test. `reset()` restores the
     * snapshot taken before the first test ran, which keeps the library's
     * subscriptions and drops everything else.
     */
    snapshotListeners() {
        return new Map(
            [...this.#listeners].map(([type, handlers]) => [
                type,
                [...handlers],
            ]),
        );
    }

    restoreListeners(snapshot) {
        this.#listeners = new Map(
            [...snapshot].map(([type, handlers]) => [type, [...handlers]]),
        );
    }

    dispatchEvent(event) {
        event.target ??= this;

        // Bubbling is the reason `pages/adrs.ts` can delegate a click on a
        // decision link to the page container, so the path is walked for real.
        const path = [this];
        if (event.bubbles) {
            let node = this.parentNode;
            while (node) {
                path.push(node);
                node = node.parentNode ?? node.defaultView ?? null;
            }
        }

        for (const node of path) {
            if (event._stopped) break;
            event.currentTarget = node;
            for (const handler of node.listenersFor(event.type)) {
                if (event._stopped) break;
                handler.call(node, event);
            }
        }

        event.currentTarget = null;
        return !event.defaultPrevented;
    }
}

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

export class DOMNode extends DOMEventTarget {
    parentNode = null;
    childNodes = [];

    get parentElement() {
        return this.parentNode instanceof DOMElement ? this.parentNode : null;
    }

    get children() {
        return this.childNodes.filter((node) => node instanceof DOMElement);
    }

    get firstChild() {
        return this.childNodes[0] ?? null;
    }

    get nextSibling() {
        const siblings = this.parentNode?.childNodes ?? [];
        return siblings[siblings.indexOf(this) + 1] ?? null;
    }

    appendChild(node) {
        node.remove();
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    insertBefore(node, reference) {
        if (!reference) return this.appendChild(node);
        node.remove();
        node.parentNode = this;
        this.childNodes.splice(this.childNodes.indexOf(reference), 0, node);
        return node;
    }

    removeChild(node) {
        const index = this.childNodes.indexOf(node);
        if (index >= 0) this.childNodes.splice(index, 1);
        node.parentNode = null;
        return node;
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    replaceWith(node) {
        const parent = this.parentNode;
        if (!parent) return;
        parent.childNodes[parent.childNodes.indexOf(this)] = node;
        node.parentNode = parent;
        this.parentNode = null;
    }

    /** Depth-first, self excluded. */
    *descendants() {
        for (const child of [...this.childNodes]) {
            yield child;
            yield* child.descendants();
        }
    }
}

export class DOMText extends DOMNode {
    nodeType = 3;

    constructor(data) {
        super();
        this.data = data;
    }

    get textContent() {
        return this.data;
    }

    set textContent(value) {
        this.data = String(value);
    }

    get outerHTML() {
        return escapeText(this.data);
    }
}

class ClassList {
    constructor(element) {
        this.element = element;
    }

    #read() {
        return (this.element.getAttribute("class") ?? "")
            .split(/\s+/)
            .filter(Boolean);
    }

    #write(names) {
        if (names.length) this.element.setAttribute("class", names.join(" "));
        else this.element.removeAttribute("class");
    }

    add(...names) {
        const current = this.#read();
        for (const name of names) {
            if (name && !current.includes(name)) current.push(name);
        }
        this.#write(current);
    }

    remove(...names) {
        this.#write(this.#read().filter((name) => !names.includes(name)));
    }

    contains(name) {
        return this.#read().includes(name);
    }

    toggle(name, force) {
        const on = force === undefined ? !this.contains(name) : force;
        if (on) this.add(name);
        else this.remove(name);
        return on;
    }

    get length() {
        return this.#read().length;
    }

    get value() {
        return this.#read().join(" ");
    }

    [Symbol.iterator]() {
        return this.#read()[Symbol.iterator]();
    }
}

/** `style.height = "10px"` and `style.setProperty(...)`, written straight back
 * to the `style` attribute so assertions can read them. */
function createStyle(element) {
    const declarations = new Map();

    const write = () => {
        const text = [...declarations]
            .map(([name, value]) => `${name}: ${value}`)
            .join("; ");
        if (text) element.setAttribute("style", text);
        else element.removeAttribute("style");
    };

    return new Proxy(
        {
            setProperty(name, value) {
                declarations.set(name, String(value));
                write();
            },
            removeProperty(name) {
                declarations.delete(name);
                write();
            },
            getPropertyValue: (name) => declarations.get(name) ?? "",
        },
        {
            get(target, key) {
                if (key in target) return target[key];
                if (typeof key !== "string") return undefined;
                return declarations.get(kebabCase(key)) ?? "";
            },
            set(target, key, value) {
                declarations.set(kebabCase(key), String(value));
                write();
                return true;
            },
        },
    );
}

export class DOMElement extends DOMNode {
    nodeType = 1;

    constructor(tagName, ownerDocument) {
        super();
        this.localName = String(tagName).toLowerCase();
        this.tagName = this.localName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.attributeMap = new Map();
        this.classList = new ClassList(this);
        this.style = createStyle(this);

        // Layout is not simulated. Tests that need a size set these directly;
        // everything else sees a zero-sized box, exactly as an unrendered
        // document would.
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientWidth = 0;
        this.clientHeight = 0;
        this.offsetHeight = 0;
        this.rect = { top: 0, left: 0, width: 0, height: 0 };

        this.dataset = new Proxy(
            {},
            {
                get: (__, key) =>
                    typeof key === "string"
                        ? this.getAttribute(`data-${kebabCase(key)}`) ??
                          undefined
                        : undefined,
                set: (__, key, value) => {
                    this.setAttribute(`data-${kebabCase(key)}`, String(value));
                    return true;
                },
                has: (__, key) =>
                    this.attributeMap.has(`data-${kebabCase(String(key))}`),
                deleteProperty: (__, key) => {
                    this.removeAttribute(`data-${kebabCase(String(key))}`);
                    return true;
                },
                ownKeys: () =>
                    [...this.attributeMap.keys()]
                        .filter((name) => name.startsWith("data-"))
                        .map((name) => camelCase(name.slice(5))),
                getOwnPropertyDescriptor: () => ({
                    enumerable: true,
                    configurable: true,
                }),
            },
        );
    }

    /* --- attributes --- */

    getAttribute(name) {
        return this.attributeMap.get(name.toLowerCase()) ?? null;
    }

    setAttribute(name, value) {
        this.attributeMap.set(name.toLowerCase(), String(value));
    }

    removeAttribute(name) {
        this.attributeMap.delete(name.toLowerCase());
    }

    hasAttribute(name) {
        return this.attributeMap.has(name.toLowerCase());
    }

    /** Array-shaped, which is what `Array.from(element.attributes)` wants. */
    get attributes() {
        return [...this.attributeMap].map(([name, value]) => ({ name, value }));
    }

    get className() {
        return this.getAttribute("class") ?? "";
    }

    set className(value) {
        this.setAttribute("class", value);
    }

    /* --- content --- */

    get textContent() {
        return this.childNodes.map((node) => node.textContent).join("");
    }

    set textContent(value) {
        this.childNodes = [];
        if (value !== "") this.appendChild(new DOMText(String(value)));
    }

    get innerHTML() {
        if (RAW_TEXT_ELEMENTS.has(this.localName)) {
            return this.childNodes.map((node) => node.data ?? "").join("");
        }
        return this.childNodes.map((node) => node.outerHTML).join("");
    }

    set innerHTML(html) {
        for (const child of this.childNodes) child.parentNode = null;
        this.childNodes = [];
        if (RAW_TEXT_ELEMENTS.has(this.localName)) {
            this.appendChild(new DOMText(String(html)));
            return;
        }
        for (const node of parseNodes(String(html), this.ownerDocument)) {
            this.appendChild(node);
        }
    }

    get outerHTML() {
        const attributes = [...this.attributeMap]
            .map(([name, value]) =>
                value === ""
                    ? ` ${name}`
                    : ` ${name}="${escapeAttribute(value)}"`,
            )
            .join("");

        if (VOID_ELEMENTS.has(this.localName)) {
            return `<${this.localName}${attributes}>`;
        }

        return `<${this.localName}${attributes}>${this.innerHTML}</${this.localName}>`;
    }

    /* --- queries --- */

    matches(selector) {
        return parseSelector(selector).some((chain) =>
            matchesChain(this, chain),
        );
    }

    closest(selector) {
        let node = this;
        while (node instanceof DOMElement) {
            if (node.matches(selector)) return node;
            node = node.parentNode;
        }
        return null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    querySelectorAll(selector) {
        const chains = parseSelector(selector);
        const found = [];
        for (const node of this.descendants()) {
            if (!(node instanceof DOMElement)) continue;
            if (chains.some((chain) => matchesChain(node, chain, this))) {
                found.push(node);
            }
        }
        return found;
    }

    /* --- behavior the components use --- */

    click() {
        this.dispatchEvent(new DOMEvent("click", { bubbles: true }));
    }

    getBoundingClientRect() {
        const { top, left, width, height } = this.rect;
        return {
            top,
            left,
            width,
            height,
            right: left + width,
            bottom: top + height,
        };
    }

    scrollIntoView(options) {
        this.ownerDocument?.scrolledIntoView.push({
            id: this.getAttribute("id"),
            element: this,
            options,
        });
    }

    focus() {}
}

for (const property of REFLECTED) {
    Object.defineProperty(DOMElement.prototype, property, {
        get() {
            return this.getAttribute(property) ?? "";
        },
        set(value) {
            this.setAttribute(property, value);
        },
        configurable: true,
    });
}

/**
 * `<select>` keeps a value of its own; every other element reflects the
 * attribute. The menu's narrow mode depends on both halves.
 */
Object.defineProperty(DOMElement.prototype, "value", {
    get() {
        if (this.localName !== "select")
            return this.getAttribute("value") ?? "";
        if (this.selectedValue !== undefined) return this.selectedValue;
        const [first] = this.querySelectorAll("option");
        return first?.getAttribute("value") ?? "";
    },
    set(value) {
        if (this.localName === "select") this.selectedValue = String(value);
        else this.setAttribute("value", value);
    },
    configurable: true,
});

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

const ATTRIBUTE_PATTERN =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** The index just past the `>` that closes the tag starting at `start`. */
function findTagEnd(html, start) {
    let quote = null;
    for (let index = start; index < html.length; index += 1) {
        const character = html[index];
        if (quote) {
            if (character === quote) quote = null;
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === ">") {
            return index;
        }
    }
    return html.length;
}

/**
 * Parse `html` into a list of nodes.
 *
 * Well-formed input only: the markup here is either written by the application
 * or emitted by markdown-it, and neither produces implied end tags. A stray
 * closing tag unwinds to the nearest matching ancestor and is otherwise
 * ignored, which is enough to keep a typo from throwing.
 */
export function parseNodes(html, ownerDocument) {
    const root = new DOMNode();
    const stack = [root];
    const top = () => stack[stack.length - 1];
    let index = 0;

    const addText = (text) => {
        if (text) top().appendChild(new DOMText(decodeEntities(text)));
    };

    while (index < html.length) {
        const lt = html.indexOf("<", index);

        if (lt < 0) {
            addText(html.slice(index));
            break;
        }

        addText(html.slice(index, lt));

        if (html.startsWith("<!--", lt)) {
            const end = html.indexOf("-->", lt);
            index = end < 0 ? html.length : end + 3;
            continue;
        }

        if (html.startsWith("<!", lt)) {
            index = findTagEnd(html, lt) + 1;
            continue;
        }

        if (html.startsWith("</", lt)) {
            const end = findTagEnd(html, lt);
            const name = html
                .slice(lt + 2, end)
                .trim()
                .toLowerCase();
            for (let depth = stack.length - 1; depth > 0; depth -= 1) {
                if (stack[depth].localName === name) {
                    stack.length = depth;
                    break;
                }
            }
            index = end + 1;
            continue;
        }

        const end = findTagEnd(html, lt);
        const source = html.slice(lt + 1, end);
        const [, name] = source.match(/^([^\s/>]+)/) ?? [];

        if (!name) {
            addText(html.slice(lt, end + 1));
            index = end + 1;
            continue;
        }

        const element = new DOMElement(name, ownerDocument);
        ATTRIBUTE_PATTERN.lastIndex = 0;
        for (const match of source
            .slice(name.length)
            .matchAll(ATTRIBUTE_PATTERN)) {
            const [, attribute, quoted, single, bare] = match;
            if (attribute === "/") continue;
            element.setAttribute(
                attribute,
                decodeEntities(quoted ?? single ?? bare ?? ""),
            );
        }

        top().appendChild(element);
        index = end + 1;

        const selfClosing =
            source.trimEnd().endsWith("/") ||
            VOID_ELEMENTS.has(element.localName);

        if (selfClosing) continue;

        if (RAW_TEXT_ELEMENTS.has(element.localName)) {
            const close = html
                .toLowerCase()
                .indexOf(`</${element.localName}`, index);
            const text = html.slice(index, close < 0 ? html.length : close);
            if (text) element.appendChild(new DOMText(text));
            index = close < 0 ? html.length : findTagEnd(html, close) + 1;
            continue;
        }

        stack.push(element);
    }

    const nodes = [...root.childNodes];
    for (const node of nodes) node.parentNode = null;
    root.childNodes = [];
    return nodes;
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                   */
/* -------------------------------------------------------------------------- */

const SIMPLE_PATTERN =
    /([a-z][\w-]*)|#([\w:.-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)"?([^\]"]*)"?)?\]|(\*)/giy;

const selectorCache = new Map();

/** `"a, ul > li"` -> two chains of `{ compound, combinator }` steps. */
export function parseSelector(selector) {
    const cached = selectorCache.get(selector);
    if (cached) return cached;

    const chains = selector.split(",").map((group) => {
        const steps = [];
        let combinator = " ";

        for (const token of group.trim().split(/\s+/)) {
            if (token === ">") {
                combinator = ">";
                continue;
            }

            const compound = [];
            SIMPLE_PATTERN.lastIndex = 0;
            let consumed = 0;
            let match = SIMPLE_PATTERN.exec(token);
            while (match) {
                consumed = SIMPLE_PATTERN.lastIndex;
                const [, tag, id, className, attribute, operator, value] =
                    match;
                if (tag)
                    compound.push({ type: "tag", value: tag.toLowerCase() });
                else if (id) compound.push({ type: "id", value: id });
                else if (className)
                    compound.push({ type: "class", value: className });
                else if (attribute)
                    compound.push({
                        type: "attribute",
                        name: attribute,
                        operator,
                        value,
                    });
                match = SIMPLE_PATTERN.exec(token);
            }

            // Refusing what it cannot parse is the whole point: a selector
            // quietly reduced to a prefix ("button:last-child" -> "button")
            // makes an assertion pass against the wrong element.
            if (consumed !== token.length) {
                throw new Error(
                    `Unsupported selector: "${selector}". The test DOM handles tag, #id, .class and [attribute] only.`,
                );
            }

            steps.push({ compound, combinator });
            combinator = " ";
        }

        return steps;
    });

    selectorCache.set(selector, chains);
    return chains;
}

function matchesCompound(element, compound) {
    return compound.every((part) => {
        switch (part.type) {
            case "tag":
                return element.localName === part.value;
            case "id":
                return element.getAttribute("id") === part.value;
            case "class":
                return element.classList.contains(part.value);
            case "attribute": {
                const actual = element.getAttribute(part.name);
                if (actual === null) return false;
                if (!part.operator) return true;
                if (part.operator === "=") return actual === part.value;
                if (part.operator === "^=")
                    return actual.startsWith(part.value);
                if (part.operator === "$=") return actual.endsWith(part.value);
                if (part.operator === "*=") return actual.includes(part.value);
                if (part.operator === "~=")
                    return actual.split(/\s+/).includes(part.value);
                return false;
            }
            default:
                return true;
        }
    });
}

/** Right to left, which is how a selector is cheapest to reject. */
function matchesChain(element, steps, scope = null) {
    const last = steps[steps.length - 1];
    if (!last || !matchesCompound(element, last.compound)) return false;

    let node = element;
    for (let index = steps.length - 2; index >= 0; index -= 1) {
        const step = steps[index];
        const nextCombinator = steps[index + 1].combinator;

        if (nextCombinator === ">") {
            node = node.parentNode;
            if (
                !(node instanceof DOMElement) ||
                node === scope ||
                !matchesCompound(node, step.compound)
            ) {
                return false;
            }
            continue;
        }

        node = node.parentNode;
        while (node instanceof DOMElement && node !== scope) {
            if (matchesCompound(node, step.compound)) break;
            node = node.parentNode;
        }
        if (!(node instanceof DOMElement) || node === scope) return false;
    }

    return true;
}

/* -------------------------------------------------------------------------- */
/* Document and window                                                         */
/* -------------------------------------------------------------------------- */

class DOMDocument extends DOMEventTarget {
    constructor() {
        super();
        this.scrolledIntoView = [];
        this.documentElement = new DOMElement("html", this);
        this.head = new DOMElement("head", this);
        this.body = new DOMElement("body", this);
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this.parentNode = null;
    }

    get title() {
        return this.head.querySelector("title")?.textContent ?? "";
    }

    set title(value) {
        const existing = this.head.querySelector("title");
        const node = existing ?? this.createElement("title");
        node.textContent = value;
        if (!existing) this.head.appendChild(node);
    }

    createElement(tagName) {
        return new DOMElement(tagName, this);
    }

    createTextNode(data) {
        return new DOMText(String(data));
    }

    getElementById(id) {
        return this.documentElement.querySelector(`[id="${id}"]`);
    }

    querySelector(selector) {
        return this.documentElement.matches(selector)
            ? this.documentElement
            : this.documentElement.querySelector(selector);
    }

    querySelectorAll(selector) {
        const found = this.documentElement.querySelectorAll(selector);
        return this.documentElement.matches(selector)
            ? [this.documentElement, ...found]
            : found;
    }
}

/** A location that keeps `href`, `search` and `hash` in step. */
class DOMLocation {
    constructor(window, href) {
        this.window = window;
        this.url = new URL(href);
    }

    /** Change the URL without announcing it — what pushState does. */
    silentlySet(href) {
        this.url = new URL(href, this.url);
    }

    get href() {
        return this.url.href;
    }

    set href(value) {
        this.assign(value);
    }

    get origin() {
        return this.url.origin;
    }

    get pathname() {
        return this.url.pathname;
    }

    get search() {
        return this.url.search;
    }

    get hash() {
        return this.url.hash;
    }

    /**
     * Setting the hash is how a pasted link or a Back button arrives, so this
     * fires `hashchange` — which is what `history/hash` listens for.
     */
    set hash(value) {
        const previous = this.url.href;
        this.url.hash = value;
        if (this.url.href !== previous) {
            this.window.dispatchEvent(new DOMEvent("hashchange"));
        }
    }

    assign(value) {
        this.silentlySet(value);
    }

    replace(value) {
        this.silentlySet(value);
    }

    toString() {
        return this.url.href;
    }
}

/** Just enough session history for `history/hash` to sit on top of. */
class DOMHistory {
    constructor(window) {
        this.window = window;
        this.entries = [{ state: null, href: window.location.href }];
        this.index = 0;
    }

    get length() {
        return this.entries.length;
    }

    get state() {
        return this.entries[this.index].state;
    }

    pushState(state, __, url) {
        const href = new URL(
            url ?? this.window.location.href,
            this.window.location.href,
        ).href;
        this.entries.length = this.index + 1;
        this.entries.push({ state, href });
        this.index += 1;
        this.window.location.silentlySet(href);
    }

    replaceState(state, __, url) {
        const href = new URL(
            url ?? this.window.location.href,
            this.window.location.href,
        ).href;
        this.entries[this.index] = { state, href };
        this.window.location.silentlySet(href);
    }

    go(delta) {
        const next = this.index + delta;
        if (next < 0 || next >= this.entries.length) return;
        this.index = next;
        this.window.location.silentlySet(this.entries[next].href);
        this.window.dispatchEvent(new DOMEvent("popstate"));
    }

    back() {
        this.go(-1);
    }

    forward() {
        this.go(1);
    }
}

class MediaQueryList extends DOMEventTarget {
    constructor(window, media) {
        super();
        this.window = window;
        this.media = media;
        this.matches = false;
    }

    /** Legacy alias; `history` and older libraries still use it. */
    addListener(handler) {
        this.addEventListener("change", handler);
    }

    removeListener(handler) {
        this.removeEventListener("change", handler);
    }
}

class DOMWindow extends DOMEventTarget {
    constructor(href) {
        super();
        this.location = new DOMLocation(this, href);
        this.history = new DOMHistory(this);
        this.innerWidth = 1280;
        this.innerHeight = 800;
        this.scrollY = 0;
        this.colorScheme = "light";
        this.scrollCalls = [];
        this.mediaQueries = new Set();
        this.timers = [];
        this.frames = [];
        this.nextTimerId = 1;
    }

    matchMedia(media) {
        const list = new MediaQueryList(this, media);
        this.mediaQueries.add(list);
        this.evaluateMedia(list);
        return list;
    }

    /**
     * Only the two queries the application asks: a width breakpoint and the
     * color-scheme preference.
     */
    evaluateMedia(list) {
        const width = list.media.match(/\(\s*(min|max)-width:\s*(\d+)px\s*\)/);
        if (width) {
            const value = Number(width[2]);
            list.matches =
                width[1] === "min"
                    ? this.innerWidth >= value
                    : this.innerWidth <= value;
            return;
        }

        const scheme = list.media.match(/prefers-color-scheme:\s*(\w+)/);
        if (scheme) list.matches = this.colorScheme === scheme[1];
    }

    scrollTo(options) {
        this.scrollCalls.push(options);
        this.scrollY = typeof options === "object" ? options?.top ?? 0 : 0;
    }

    /* Fake timers: nothing runs until a test says so. */

    setTimeout(handler, delay = 0) {
        const id = this.nextTimerId++;
        this.timers.push({ id, handler, delay });
        return id;
    }

    clearTimeout(id) {
        this.timers = this.timers.filter((timer) => timer.id !== id);
    }

    setInterval(handler, delay) {
        return this.setTimeout(handler, delay);
    }

    clearInterval(id) {
        this.clearTimeout(id);
    }

    requestAnimationFrame(handler) {
        const id = this.nextTimerId++;
        this.frames.push({ id, handler });
        return id;
    }

    cancelAnimationFrame(id) {
        this.frames = this.frames.filter((frame) => frame.id !== id);
    }

    getComputedStyle(element) {
        return element.style;
    }
}

/* -------------------------------------------------------------------------- */
/* Installation                                                                */
/* -------------------------------------------------------------------------- */

const BASE_URL = "https://renderizr.test/index.html";

let installed = null;

/**
 * Install the DOM on `globalThis` and hand back the handle the tests drive.
 *
 * Idempotent on purpose — see the note at the top of the file.
 */
export function installDOM() {
    if (installed) return installed;

    const window = new DOMWindow(BASE_URL);
    const document = new DOMDocument();

    window.document = document;
    document.defaultView = window;
    window.window = window;
    window.self = window;

    const observers = { resize: new Set(), intersection: new Set() };

    class ResizeObserver {
        constructor(callback) {
            this.callback = callback;
            this.targets = new Set();
            observers.resize.add(this);
        }
        observe(target) {
            this.targets.add(target);
        }
        unobserve(target) {
            this.targets.delete(target);
        }
        disconnect() {
            this.targets.clear();
            observers.resize.delete(this);
        }
    }

    class IntersectionObserver {
        constructor(callback, options = {}) {
            this.callback = callback;
            this.options = options;
            this.targets = new Set();
            observers.intersection.add(this);
        }
        observe(target) {
            this.targets.add(target);
        }
        unobserve(target) {
            this.targets.delete(target);
        }
        disconnect() {
            this.targets.clear();
            observers.intersection.delete(this);
        }
        takeRecords() {
            return [];
        }
    }

    /**
     * The window listeners in place before the first test ran — see
     * `snapshotListeners`.
     */
    let baselineListeners = null;

    const storage = new Map();
    const localStorage = {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key),
        clear: () => storage.clear(),
        get length() {
            return storage.size;
        },
    };

    window.ResizeObserver = ResizeObserver;
    window.IntersectionObserver = IntersectionObserver;
    window.localStorage = localStorage;

    Object.assign(globalThis, {
        window,
        document,
        localStorage,
        ResizeObserver,
        IntersectionObserver,
        Element: DOMElement,
        HTMLElement: DOMElement,
        Node: DOMNode,
        Text: DOMText,
        // `markdown-renderer.ts` builds an id selector with it.
        CSS: { escape: (value) => String(value).replace(/["\\]/g, "\\$&") },
        // Both are Vite `define` substitutions in a real build, so they are
        // free identifiers here and have to exist before `src/` is imported.
        __RENDERIZR_LOGO__: null,
        __RENDERIZR_FONT__: null,
        structurizr: { workspace: { name: "" } },
    });

    installed = {
        window,
        document,
        localStorage,
        observers,

        /** Put the document back to an empty page with an `#app` in it. */
        reset() {
            baselineListeners ??= window.snapshotListeners();
            window.restoreListeners(baselineListeners);
            document.documentElement.attributeMap.clear();
            document.head.childNodes = [];
            document.body.childNodes = [];
            document.scrolledIntoView.length = 0;
            window.scrollCalls.length = 0;
            window.timers.length = 0;
            window.frames.length = 0;
            window.innerWidth = 1280;
            window.innerHeight = 800;
            window.scrollY = 0;
            window.colorScheme = "light";
            document.documentElement.scrollHeight = 0;
            document.documentElement.scrollTop = 0;
            storage.clear();
            observers.resize.clear();
            observers.intersection.clear();
            globalThis.__RENDERIZR_LOGO__ = null;
            globalThis.structurizr = { workspace: { name: "" } };
            return this;
        },

        /** Append a `<div id="...">` to the body and return it. */
        mount(id = "app") {
            const element = document.createElement("div");
            element.setAttribute("id", id);
            document.body.appendChild(element);
            return element;
        },

        /** Run every pending `window.setTimeout`, soonest first. */
        runTimers() {
            for (let pass = 0; pass < 20 && window.timers.length; pass += 1) {
                const pending = [...window.timers].sort(
                    (a, b) => a.delay - b.delay || a.id - b.id,
                );
                window.timers.length = 0;
                for (const timer of pending) timer.handler();
            }
        },

        /** Run every pending animation-frame callback. */
        runFrames() {
            for (let pass = 0; pass < 20 && window.frames.length; pass += 1) {
                const pending = [...window.frames];
                window.frames.length = 0;
                for (const frame of pending) frame.handler();
            }
        },

        /** Resize the viewport and notify anything watching a media query. */
        setViewportWidth(width) {
            window.innerWidth = width;
            for (const list of window.mediaQueries) {
                const before = list.matches;
                window.evaluateMedia(list);
                if (before !== list.matches) {
                    list.dispatchEvent(new DOMEvent("change"));
                }
            }
            for (const observer of observers.resize) {
                observer.callback(
                    [...observer.targets].map(entryFor),
                    observer,
                );
            }
        },

        /** Flip the OS color-scheme preference and fire the media change. */
        setColorScheme(scheme) {
            window.colorScheme = scheme;
            for (const list of window.mediaQueries) {
                const before = list.matches;
                window.evaluateMedia(list);
                if (before !== list.matches) {
                    list.dispatchEvent(new DOMEvent("change"));
                }
            }
        },

        /** Report `elements` as intersecting (or not) to every scroll spy. */
        intersect(elements, isIntersecting = true) {
            for (const observer of observers.intersection) {
                const entries = elements
                    .filter((element) => observer.targets.has(element))
                    .map((target) => ({ target, isIntersecting }));
                if (entries.length) observer.callback(entries, observer);
            }
        },
    };

    return installed;
}

/**
 * Installed as a side effect of importing this module, not on first use.
 *
 * `history/hash` builds its singleton while it is being evaluated and reads
 * `document.defaultView` to do it, so the globals have to exist before any
 * import of it is evaluated. Importing this module first is what guarantees
 * that — see `support/history.js`.
 */
installDOM();

const entryFor = (target) => ({
    target,
    contentRect: target.getBoundingClientRect(),
});

/** Parse a standalone HTML document — used on the headless-browser dump. */
export function parseDocument(html) {
    const document = new DOMDocument();
    const nodes = parseNodes(html, document);
    const html5 = nodes.find((node) => node.localName === "html");

    if (html5) {
        document.documentElement = html5;
        document.head =
            html5.querySelector("head") ?? new DOMElement("head", document);
        document.body =
            html5.querySelector("body") ?? new DOMElement("body", document);
        return document;
    }

    for (const node of nodes) document.body.appendChild(node);
    return document;
}

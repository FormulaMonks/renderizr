import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkspace, prepareWorkspace, readWorkspace } from "./assets.js";
import { errorMessage } from "./dsl-pipeline.js";
import {
    checkTools,
    exportToolsMessage,
    runTools,
    toolsCommand,
} from "./structurizr-tools.js";

/**
 * The set loader (ADR 26), which `renderizr` and `pnpm dev` share: it turns
 * the positionals into a set, one landscape scoped workspace and the
 * software system scoped workspaces it maps, ready for the site.
 *
 *     const set = await loadSet(["landscape.json", "teams/"]);
 *
 * - **Positionals** are `workspace.json` and `workspace.dsl` files, URLs
 *   and folders, in any order. A folder gives its `*workspace.json` and
 *   `*workspace.dsl` files, without recursing.
 * - **Element links** on the software systems of every workspace in the set
 *   are followed when they are an absolute `http(s)://` or `file:///` URL
 *   whose path ends in `workspace.json` or `workspace.dsl`, until a pass
 *   adds nothing. A link to a URL already loaded, or to a software system
 *   that already has its workspace, is skipped; a positional beats a link,
 *   and `notices` says so.
 * - **A `workspace.dsl`** goes through the author's Structurizr tools,
 *   `export -format json`, from an empty temporary folder. A followed DSL
 *   goes to them as its URL. A `workspace.json` runs no tools.
 * - **A lone workspace**, one positional whose links lead nowhere, comes out
 *   as `loadWorkspace` gives it, whatever its scope, with no checks, no
 *   crossings and no warnings.
 *
 * A set that breaks the rules throws an Error naming the files, elements and
 * URLs involved. What the site can still render right comes back in
 * `warnings`.
 */

/**
 * @typedef {object} Crossing
 *   An element or relationship of one workspace that leads into another
 *   workspace of the set.
 * @property {string} element The id of the element or relationship that
 *   carries the link, in the workspace that holds it.
 * @property {string} slug The slug of the workspace it leads into.
 * @property {"workspace-link" | "followed-link" | "name"} via What leads
 *   there: a `{workspace:N}/…` element link, an element link the loader
 *   followed, or a software system name that matches the workspace's.
 * @property {string} [url] The element link, for the two link kinds.
 *
 * @typedef {object} SetMember
 * @property {string} source Where the workspace came from: the positional
 *   as written, a folder member as `folder/name`, a followed `file:///`
 *   link as its path, and a URL as itself.
 * @property {object} workspace The workspace JSON, ready for the site.
 * @property {string | null} slug The slug of the software system the
 *   workspace is scoped to, which names it in the workspace trail; `null`
 *   for the landscape scoped workspace and a lone workspace.
 * @property {{ id: string, name: string } | null} system The software
 *   system the workspace is scoped to; `null` where `slug` is.
 * @property {Crossing[]} crossings The elements of this workspace that lead
 *   into another workspace of the set, at most one per element and target,
 *   in element order.
 *
 * @typedef {object} WorkspaceSet
 * @property {SetMember} landscape The landscape scoped workspace, where the
 *   reader lands; for a lone workspace, that workspace.
 * @property {SetMember[]} workspaces The software system scoped workspaces,
 *   positionals first, then followed links in the order they were read.
 * @property {string[]} warnings `{workspace:N}` links that match no
 *   workspace, and crossings to a view or page the target lacks.
 * @property {string[]} notices The links a positional or an earlier link
 *   beat.
 */

/** The `configuration.scope` of a landscape scoped workspace. */
const LANDSCAPE = "Landscape";

/** The `configuration.scope` of a software system scoped workspace. */
const SOFTWARE_SYSTEM = "SoftwareSystem";

/** The file names a folder positional expands to. */
export const WORKSPACE_FILE = /workspace\.(json|dsl)$/;

/** Structurizr's link into the workspace with server id `N`. */
const WORKSPACE_LINK = /^\{workspace:(\d+)\}/;

/** The model's lists of top-level elements. */
const MODEL_ELEMENTS = [
    "people",
    "softwareSystems",
    "customElements",
    "deploymentNodes",
];

/** The lists an element nests its child elements in. */
const NESTED_ELEMENTS = [
    "containers",
    "components",
    "children",
    "infrastructureNodes",
    "softwareSystemInstances",
    "containerInstances",
];

/**
 * Why a `workspace.dsl` didn't load: Structurizr's tools refused it.
 * `source` names the file as messages do, `detail` is what the tools said.
 */
export class DslError extends Error {
    constructor(source, detail) {
        super(`Structurizr's tools couldn't read ${source}:\n${detail}`);
        this.name = "DslError";
        this.source = source;
        this.detail = detail;
    }
}

/**
 * Load the set the `positionals` name. `cwd` resolves relative paths, `env`
 * names the Structurizr tools and `output` takes what the tools print.
 *
 * `pnpm dev` reloads the set on every change (spec 264), and two options
 * serve it: `exports`, a `Map` of each DSL's export by its path or URL,
 * which the load reuses and fills, so a DSL goes to the tools only when the
 * map lacks it; and `onRead`, which hears the path of each local file the
 * load reads, as it reads it, even when the load then fails.
 *
 * @param {string[]} positionals
 * @param {{ cwd?: string, env?: object, output?: object, exports?: Map<string, Promise<string>>, onRead?: (path: string) => void }} [options]
 * @returns {Promise<WorkspaceSet>}
 */
export async function loadSet(
    positionals,
    {
        cwd = process.cwd(),
        env = process.env,
        output = process.stderr,
        exports = new Map(),
        onRead = () => {},
    } = {},
) {
    const context = {
        cwd,
        command: toolsCommand(env),
        output,
        exports,
        onRead,
    };
    const locations = await expand(positionals, cwd);
    const members = await Promise.all(
        locations.map(async (location) =>
            member(
                location,
                await prepareWorkspace(await readJson(location, context)),
            ),
        ),
    );
    const notices = await follow(members, context);

    if (members.length === 1) {
        const [{ source, workspace }] = members;
        return {
            landscape: {
                source,
                workspace,
                slug: null,
                system: null,
                crossings: [],
            },
            workspaces: [],
            // The page gives its `{workspace:N}` links no target, so the
            // warning is their one trace.
            warnings: matchCrossings(members, null),
            notices,
        };
    }

    const landscape = checkSet(members);
    const warnings = matchCrossings(members, landscape);
    const result = ({ source, workspace, slug, system, crossings }) => ({
        source,
        workspace,
        slug,
        system,
        crossings,
    });
    return {
        landscape: { ...result(landscape), slug: null, system: null },
        workspaces: members.filter((other) => other !== landscape).map(result),
        warnings,
        notices,
    };
}

/**
 * Write the `notices` and `warnings` of `set`, as `loadSet` gives it, to
 * `output`, one a line, each warning marked as one.
 */
export function writeSetMessages(set, output) {
    for (const notice of set.notices) output.write(`${notice}\n`);
    for (const warning of set.warnings) output.write(`warning: ${warning}\n`);
}

/**
 * A slug of `name`, the name of the software system a workspace is scoped
 * to: kebab case, accents dropped, everything outside a-z and 0-9 left out.
 */
export const slugOf = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/* -------------------------------------------------------------- locations */

/**
 * Where a workspace lives: `source` as messages name it, a local `path` or
 * a web `url`, and the `key` that tells two spellings of one place apart.
 */
function locate(value, cwd) {
    if (/^https?:\/\//i.test(value)) {
        const url = new URL(value).href;
        return { source: value, url, key: url };
    }
    if (/^file:/i.test(value)) {
        const path = fileURLToPath(value);
        return { source: path, path, key: path };
    }
    const path = resolve(cwd, value);
    return { source: value, path, key: path };
}

/** The positionals as locations, each folder expanded, each place once. */
async function expand(positionals, cwd) {
    const locations = [];
    for (const positional of positionals) {
        const location = locate(positional, cwd);
        const folder =
            location.path &&
            (await stat(location.path).catch(() => null))?.isDirectory();
        if (!folder) {
            locations.push(location);
            continue;
        }
        const names = (await readdir(location.path))
            .filter((name) => WORKSPACE_FILE.test(name))
            .sort();
        if (names.length === 0) {
            throw new Error(
                `${positional} holds no *workspace.json or *workspace.dsl file.`,
            );
        }
        for (const name of names) {
            locations.push(locate(join(location.source, name), cwd));
        }
    }
    const seen = new Set();
    return locations.filter(
        ({ key }) => !seen.has(key) && seen.add(key) !== undefined,
    );
}

/** Whether `location` is a `workspace.dsl`, which only the tools read. */
const isDsl = ({ path, url }) =>
    (path ?? new URL(url).pathname).endsWith(".dsl");

/** The workspace JSON at `location`, parsed. */
async function readJson(location, context) {
    if (location.path) context.onRead(location.path);
    const text = isDsl(location)
        ? await exported(location, context)
        : await readWorkspace(location.url ?? location.source, {
              cwd: context.cwd,
          });
    return parseWorkspace(text, location.source);
}

/**
 * The export of the DSL at `location`: the one `exports` holds, else a new
 * one, which `exports` holds from then on unless it fails.
 */
function exported(location, { exports, command, output }) {
    const held = exports.get(location.key);
    if (held) return held;
    const running = exportDsl(location, { command, output });
    exports.set(location.key, running);
    running.catch(() => {
        if (exports.get(location.key) === running) exports.delete(location.key);
    });
    return running;
}

/**
 * The workspace JSON Structurizr's tools export from the DSL at `location`,
 * run from an empty temporary folder (ADR 26). A local DSL goes to them as
 * its absolute path, a followed one as its URL, so a relative `!include`
 * in a DSL fetched over the web fails with the tools' own message.
 */
async function exportDsl(location, { command, output }) {
    const folder = await mkdtemp(join(tmpdir(), "renderizr-export-"));
    try {
        const result = await runTools(
            command,
            [
                "export",
                "-workspace",
                location.url ?? location.path,
                "-format",
                "json",
                "-output",
                folder,
            ],
            { cwd: folder, output },
        );
        const [produced] = (await readdir(folder)).filter((name) =>
            name.endsWith(".json"),
        );
        if (result.code === 0 && produced) {
            return await readFile(join(folder, produced), "utf8");
        }
        if (!checkTools(command, { cwd: folder }).ok) {
            throw new Error(exportToolsMessage(location.source, command));
        }
        throw new DslError(
            location.source,
            errorMessage(result.output, result.code),
        );
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
}

/* ---------------------------------------------------------------- members */

/** The software systems of `workspace`. */
const softwareSystems = (workspace) => workspace?.model?.softwareSystems ?? [];

/** The `configuration.scope` of `workspace`, or `undefined`. */
const scopeOf = (workspace) => workspace?.configuration?.scope;

/**
 * The software systems a software system scoped workspace may be scoped
 * to. Structurizr's rule for the scope: the workspace details exactly one
 * software system, the one software system in its model with containers.
 */
const detailedSystems = (workspace) =>
    softwareSystems(workspace).filter(
        (system) => (system.containers ?? []).length > 0,
    );

/**
 * The software system `workspace` is scoped to, or `null` when it isn't
 * software system scoped or doesn't detail exactly one.
 */
function scopedSystem(workspace) {
    if (scopeOf(workspace) !== SOFTWARE_SYSTEM) return null;
    const detailed = detailedSystems(workspace);
    return detailed.length === 1
        ? { id: String(detailed[0].id), name: detailed[0].name }
        : null;
}

/** A member of the set, from `location` and its `workspace`. */
function member(location, workspace) {
    const system = scopedSystem(workspace);
    return {
        key: location.key,
        source: location.source,
        workspace,
        system,
        slug: system && slugOf(system.name),
        crossings: [],
    };
}

/** Why software system scoped `workspace` has no one software system. */
function detailProblem(workspace) {
    const detailed = detailedSystems(workspace);
    return detailed.length === 0
        ? "no software system in it has containers"
        : `${detailed.length} software systems in it have containers: ${detailed.map((system) => system.name).join(", ")}`;
}

/** `items` as prose: "a", "a and b", "a, b and c". */
const list = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/* ---------------------------------------------------------------- follow */

/**
 * The element link `url` when the loader follows it: an absolute
 * `http(s)://` or `file:///` URL whose path ends in `workspace.json` or
 * `workspace.dsl`. `undefined` for every other link.
 */
function followable(url) {
    const link = typeof url === "string" ? url.trim() : "";
    if (!/^(https?:\/\/|file:\/\/\/)/i.test(link)) return undefined;
    try {
        return WORKSPACE_FILE.test(new URL(link).pathname) ? link : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Follow the element links of `members`, adding each workspace they lead
 * to, pass by pass, until a pass adds nothing. Returns the notices for the
 * links it skipped.
 */
async function follow(members, context) {
    const notices = [];
    const loaded = new Set(members.map(({ key }) => key));
    let pass = members;
    while (pass.length > 0) {
        const bySlug = new Map(
            members
                .filter(({ slug }) => slug)
                .map((present) => [present.slug, present.source]),
        );
        const reported = new Set();
        const links = [];
        for (const carrier of pass) {
            for (const element of softwareSystems(carrier.workspace)) {
                const link = followable(element.url);
                if (!link) continue;
                const location = locate(link, context.cwd);
                if (loaded.has(location.key)) continue;
                const slug = slugOf(element.name);
                // A team's own published file, linked from its own system.
                if (slug === carrier.slug) continue;
                const present = bySlug.get(slug);
                if (present) {
                    if (!reported.has(location.key)) {
                        reported.add(location.key);
                        notices.push(
                            `Skipped ${link}, the element link of ${element.name} in ${carrier.source}, because ${present} is already the workspace scoped to ${element.name}.`,
                        );
                    }
                    continue;
                }
                loaded.add(location.key);
                bySlug.set(slug, location.source);
                links.push({ location, element, carrier, link });
            }
        }
        pass = await Promise.all(
            links.map((followed) => followLink(followed, context)),
        );
        members.push(...pass);
    }
    return notices;
}

/**
 * The member a followed element link leads to. Throws, naming the element,
 * its workspace and the URL, when the link fails to load or leads anywhere
 * but the workspace scoped to the element's software system.
 */
async function followLink({ location, element, carrier, link }, context) {
    const failure = (why, cause) =>
        new Error(
            `The element link of ${element.name} in ${carrier.source} leads to ${link}, ${why}`,
            { cause },
        );
    let workspace;
    try {
        workspace = await readJson(location, context);
    } catch (error) {
        throw failure(`which Renderizr couldn't load: ${error.message}`, error);
    }
    if (
        !workspace ||
        typeof workspace !== "object" ||
        Array.isArray(workspace) ||
        typeof workspace.model !== "object"
    ) {
        throw failure("which holds no Structurizr workspace.");
    }
    const scope = scopeOf(workspace);
    if (scope !== SOFTWARE_SYSTEM) {
        const what =
            scope === LANDSCAPE
                ? "is landscape scoped"
                : scope
                  ? `has the workspace scope ${scope}`
                  : "sets no workspace scope";
        throw failure(
            `which ${what}; a followed element link must lead to a software system scoped workspace.`,
        );
    }
    const system = scopedSystem(workspace);
    if (!system) {
        throw failure(
            `which is software system scoped, but ${detailProblem(workspace)}.`,
        );
    }
    if (system.name !== element.name) {
        throw failure(
            `which is scoped to ${system.name}, a different software system than ${element.name}.`,
        );
    }
    return member(location, await prepareWorkspace(workspace));
}

/* ------------------------------------------------------------------ check */

/**
 * The landscape scoped workspace of `members`, a set of two or more. Throws
 * when the set breaks a rule of ADR 26.
 */
function checkSet(members) {
    for (const { source, workspace } of members) {
        const scope = scopeOf(workspace);
        if (scope === LANDSCAPE || scope === SOFTWARE_SYSTEM) continue;
        throw new Error(
            `${source} ${scope ? `has the workspace scope ${scope}` : "sets no workspace scope"}; in a set, every workspace beside the landscape scoped one is software system scoped.`,
        );
    }

    const landscapes = members.filter(
        ({ workspace }) => scopeOf(workspace) === LANDSCAPE,
    );
    if (landscapes.length === 0) {
        throw new Error(
            `The set has no landscape scoped workspace among ${list(members.map(({ source }) => source))}; a set has exactly one.`,
        );
    }
    if (landscapes.length > 1) {
        throw new Error(
            `${list(landscapes.map(({ source }) => source))} are ${landscapes.length === 2 ? "both" : "all"} landscape scoped; a set has exactly one landscape scoped workspace.`,
        );
    }
    const [landscape] = landscapes;

    const bySlug = new Map();
    for (const scoped of members) {
        if (scoped === landscape) continue;
        if (!scoped.system) {
            throw new Error(
                `${scoped.source} is software system scoped, but ${detailProblem(scoped.workspace)}; Structurizr scopes such a workspace to its one software system with containers.`,
            );
        }
        const twin = bySlug.get(scoped.slug);
        if (twin) {
            throw new Error(
                twin.system.name === scoped.system.name
                    ? `${twin.source} and ${scoped.source} are both scoped to ${scoped.system.name}; a set holds one workspace for each software system.`
                    : `${twin.source} and ${scoped.source} are scoped to ${twin.system.name} and ${scoped.system.name}, which share the slug ${scoped.slug}; rename one of them.`,
            );
        }
        bySlug.set(scoped.slug, scoped);
    }

    const named = new Set(
        softwareSystems(landscape.workspace).map(({ name }) => name),
    );
    for (const scoped of members) {
        if (scoped === landscape || named.has(scoped.system.name)) continue;
        throw new Error(
            `${scoped.source} is scoped to ${scoped.system.name}, which ${landscape.source} doesn't name; add the software system to the landscape scoped workspace.`,
        );
    }

    return landscape;
}

/* ------------------------------------------------------------------ match */

/** Every view key `workspace` holds. */
const viewKeys = (workspace) =>
    new Set(
        Object.values(workspace.views ?? {})
            .filter(Array.isArray)
            .flat()
            .map((view) => view.key),
    );

/**
 * Why the crossing `url` can't land where it says in `target`, or `null`.
 * The path after `{workspace:N}` reads against the target the way an
 * element link reads against its own workspace: `/diagrams#key` names a
 * view, `/documentation` and `/decisions` name those pages.
 */
function missingLanding(url, target) {
    const rest = url.replace(WORKSPACE_LINK, "");
    const hashAt = rest.indexOf("#");
    const path = (hashAt >= 0 ? rest.slice(0, hashAt) : rest).split("?")[0];
    const fragment =
        hashAt >= 0 ? decodeURIComponent(rest.slice(hashAt + 1)) : "";
    const segments = path.split("/").filter(Boolean);
    const { workspace } = target;
    if (segments.at(-1) === "diagrams") {
        return fragment && !viewKeys(workspace).has(fragment)
            ? `no view ${fragment}`
            : null;
    }
    for (const page of ["documentation", "decisions"]) {
        if (!segments.includes(page)) continue;
        const ids = page === "documentation" ? "sections" : "decisions";
        return (workspace.documentation?.[ids] ?? []).length === 0
            ? `no ${page}`
            : null;
    }
    return null;
}

/**
 * Every element of `workspace` that can carry an element link, nested ones
 * included, in model order: people, software systems with their containers
 * and components, custom elements, then deployment nodes with everything
 * they hold.
 */
function elementsOf(workspace) {
    const model = workspace?.model ?? {};
    const found = [];
    const visit = (element) => {
        found.push(element);
        for (const key of NESTED_ELEMENTS) {
            for (const child of element[key] ?? []) visit(child);
        }
    };
    for (const key of MODEL_ELEMENTS) {
        for (const element of model[key] ?? []) visit(element);
    }
    return found;
}

/**
 * Every element and relationship of `workspace` that can carry a link, as
 * `{ id, label, url, system }`: `label` names it in a warning, and
 * `system` says it is a software system, which alone matches a workspace
 * by its name.
 */
function linkCarriers(workspace) {
    const elements = elementsOf(workspace);
    const systems = new Set(softwareSystems(workspace));
    const names = new Map(
        elements.map((element) => [String(element.id), element.name]),
    );
    const nameOf = (id) => names.get(String(id)) ?? id;
    const carriers = elements.map((element) => ({
        id: String(element.id),
        label: element.name,
        url: element.url,
        system: systems.has(element),
    }));
    for (const element of elements) {
        for (const relationship of element.relationships ?? []) {
            carriers.push({
                id: String(relationship.id),
                label: `the relationship from ${nameOf(relationship.sourceId)} to ${nameOf(relationship.destinationId)}`,
                url: relationship.url,
                system: false,
            });
        }
    }
    return carriers;
}

/**
 * Record the crossings of every member of `members`, and return the
 * warnings for `{workspace:N}` links that match no workspace and for
 * crossings to a view or page the target lacks. `landscape` is the set's
 * landscape scoped workspace, or `null` for a lone workspace, none of whose
 * `{workspace:N}` links match anything.
 *
 * A `{workspace:N}` link, on any element or relationship, matches the
 * workspace scoped to the software system of the same name as the software
 * system carrying it, then the one software system scoped workspace whose
 * id is `N` when `N` is nonzero. The landscape scoped workspace is never a
 * match by `N`. A software system never crosses into the workspace scoped
 * to it.
 */
function matchCrossings(members, landscape) {
    const warnings = [];
    const byName = new Map(
        members
            .filter(({ system }) => system)
            .map((scoped) => [scoped.system.name, scoped]),
    );
    const byId = new Map();
    for (const candidate of members) {
        const id = Number(candidate.workspace.id);
        if (!id || !landscape || candidate === landscape) continue;
        byId.set(id, byId.has(id) ? null : candidate);
    }

    for (const carrier of members) {
        for (const { id, label, url: written, system } of linkCarriers(
            carrier.workspace,
        )) {
            if (system && carrier.system && id === carrier.system.id) continue;
            const url = typeof written === "string" ? written.trim() : "";
            const named = system ? byName.get(label) : undefined;
            const sameName = named && named !== carrier ? named : undefined;
            const crossings = [];

            const token = WORKSPACE_LINK.exec(url);
            if (token) {
                const target = sameName ?? byId.get(Number(token[1]));
                if (target && target !== carrier) {
                    crossings.push({
                        element: id,
                        slug: target.slug,
                        via: "workspace-link",
                        url,
                    });
                    const missing = missingLanding(url, target);
                    if (missing) {
                        warnings.push(
                            `${carrier.source}: ${label} links ${url}, but ${target.workspace.name} has ${missing}, so the crossing lands on its default view.`,
                        );
                    }
                } else {
                    warnings.push(
                        `${carrier.source}: ${label} links ${url}, which matches no workspace Renderizr loaded, so the page gives it no target.`,
                    );
                }
            } else if (sameName && followable(url)) {
                crossings.push({
                    element: id,
                    slug: sameName.slug,
                    via: "followed-link",
                    url,
                });
            }

            if (
                sameName &&
                !crossings.some(({ slug }) => slug === sameName.slug)
            ) {
                crossings.push({
                    element: id,
                    slug: sameName.slug,
                    via: "name",
                });
            }
            carrier.crossings.push(...crossings);
        }
    }
    return warnings;
}

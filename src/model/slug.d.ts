/**
 * The types of `slug.js`, the one slug rule (ADR 30). The rule stays plain
 * JavaScript so the set loader in `scripts/` runs the same copy as the page;
 * this file lets the page's TypeScript import it.
 */

/** The slug of `name` by the one slug rule (ADR 30). */
export declare const slugOf: (name: unknown) => string;

/** The slugs of sibling `names` in model order, colliding ones suffixed. */
export declare function siblingSlugs(names: readonly unknown[]): string[];

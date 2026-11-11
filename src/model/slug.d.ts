/** The slug of `name` by the one slug rule (ADR 30). */
export declare const slugOf: (name: unknown) => string;

/** The slugs of sibling `names` in model order, colliding ones suffixed. */
export declare function siblingSlugs(names: readonly unknown[]): string[];

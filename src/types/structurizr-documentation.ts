type Item = {
    id: string;
    title: string;
    items?: Item[];
};

export type Decision = Item & {
    content: string;
    format: "Markdown";
    date: string;
    status: string;
    links: { id: string; description: string }[];
};

export type DocumentationSection = Item & {
    content: string;
    filename: string;
    format: "Markdown";
    order: number;
};

/**
 * An image a documentation file or a decision references, which
 * Structurizr's importers embed: `name` is its path relative to the folder,
 * `content` its bytes as base64.
 */
export type DocumentationImage = {
    name: string;
    type: string;
    content: string;
};

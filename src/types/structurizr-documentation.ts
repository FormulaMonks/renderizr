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

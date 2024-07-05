export type Decision = {
    content: string;
    format: "Markdown";
    id: string;
    title: string;
    date: string;
    status: string;
    links: { id: string; description: string }[];
};

export type DocumentationSection = {
    id: string;
    content: string;
    filename: string;
    format: "Markdown";
    order: number;
    title: string;
};

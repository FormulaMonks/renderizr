export type Decision = {
    content: string;
    format: "Markdown";
    id: string;
    title: string;
    date: string;
    status: string;
    links: { id: string; description: string }[];
};

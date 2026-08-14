export type Document = {
    id: string;
    url: string;
    title: string;
    text: string;
    etag?: string;
    lastModified?: string;
    lastCrawledAt?: number;
    statusCode?: number;
    category?: string;
};

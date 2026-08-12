export function normalizeUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    url.hash = "";
    if (url.protocol === "https" && url.port === "443") {
        url.port = "";
    }
    if (url.protocol === "http" && url.port === "80") {
        url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.slice(0, -1);
    }
    if (url.pathname.endsWith("/index.html")) {
        url.pathname = url.pathname.slice(0, -"/index.html".length);
    }
    url.searchParams.sort();
    return url.toString();
}
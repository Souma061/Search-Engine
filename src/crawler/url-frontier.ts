import { normalizeUrl } from "./url.ts";

export class URLFrontier {
    private readonly scheduled = new Set<string>();

    add(rawUrl: string): boolean {
        const url = normalizeUrl(rawUrl);

        if (this.scheduled.has(url)) {
            return false;
        }

        this.scheduled.add(url);
        return true;
    }

    has(url: string): boolean {
        return this.scheduled.has(normalizeUrl(url));
    }

    get size(): number {
        return this.scheduled.size;
    }
}

import type { Index } from "../indexer/inverted-index.ts";

export type SearchMode = "AND" | "OR";

export function retrieveDocuments(index: Index, words: string[], mode: SearchMode): string[] {
    if (words.length === 0) return [];

    const postings = words.map((word) => index[word]?.postings);

    if (mode === "AND") {
        if (postings.some((p) => !p)) return [];
        return Object.keys(postings[0]).filter((file) => postings.every((p) => p[file]));
    }

    const docSet = new Set<string>();
    for (const posting of postings) {
        if (!posting) {
            continue;
        }
        for (const file of Object.keys(posting)) docSet.add(file);
    }
    return [...docSet];
}

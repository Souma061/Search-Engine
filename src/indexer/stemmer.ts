// Reserved technical terms that should not be stemmed
const PRESERVED_WORDS = new Set([
    "express",
    "process",
    "status",
    "class",
    "async",
    "await",
    "less",
    "css",
    "pass",
    "cross",
]);

export function stem(word: string): string {
    if (word.length <= 2 || PRESERVED_WORDS.has(word.toLowerCase())) {
        return word;
    }

    let w = word.toLowerCase();

    // Step 1a: Plurals and suffixes
    if (w.endsWith("sses")) {
        w = w.slice(0, -2);
    } else if (w.endsWith("ies") && w.length > 4) {
        w = w.slice(0, -2);
    } else if (w.endsWith("ss")) {
        // preserve ss (e.g. express, process)
    } else if (w.endsWith("s") && !w.endsWith("us") && !w.endsWith("is")) {
        w = w.slice(0, -1);
    }

    // Step 1b: Common verbal and adjectival suffixes
    if (w.endsWith("ing") && w.length > 5) {
        w = w.slice(0, -3);
    } else if (w.endsWith("ed") && w.length > 4) {
        w = w.slice(0, -2);
    } else if (w.endsWith("ly") && w.length > 4) {
        w = w.slice(0, -2);
    } else if (w.endsWith("ment") && w.length > 6) {
        w = w.slice(0, -4);
    } else if (w.endsWith("able") && w.length > 6) {
        w = w.slice(0, -4);
    } else if (w.endsWith("ation") && w.length > 9) {
        // installation→install, documentation→document, configuration→configur
        w = w.slice(0, -5);
    } else if (w.endsWith("tion") && w.length > 6) {
        w = w.slice(0, -4);
    }

    return w;
}

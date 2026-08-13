import { stem } from "./stemmer.ts";

const STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "with",
]);

// Split into parts on camelCase / digit boundaries, preserving original casing.
// e.g. "useState" → ["use", "State"], "readFile" → ["read", "File"],
//      "v20" → ["v", "20"], "URLSearchParams" → ["URLSearch", "Params"].
function splitCamel(word: string): string[] {
    const parts: string[] = [];
    let current = "";
    let previous: "lower" | "upper" | "digit" | "other" | null = null;

    for (const char of word) {
        const type = /\d/.test(char) ? "digit"
            : /[a-z]/.test(char) ? "lower"
            : /[A-Z]/.test(char) ? "upper"
            : "other";

        if (current &&
            ((type === "upper" && previous !== "upper") ||
             type !== previous && (type === "digit" || previous === "digit"))
        ) {
            parts.push(current);
            current = "";
        }

        current += char;
        previous = type;
    }

    if (current) {
        parts.push(current);
    }
    return parts;
}

export function tokenize(text: string): string[] {
    const tokens: string[] = [];

    for (const segment of text.split(/\s+/)) {
        if (!segment) {
            continue;
        }

        const emitted = new Set<string>();
        const add = (term: string): void => {
            if (!term || STOP_WORDS.has(term)) {
                return;
            }
            const stemmed = stem(term);
            if (!emitted.has(term)) {
                emitted.add(term);
                tokens.push(term);
            }
            if (stemmed !== term && !emitted.has(stemmed)) {
                emitted.add(stemmed);
                tokens.push(stemmed);
            }
        };

        const raw = segment.match(/[A-Za-z0-9]+(?:\+\+)?/g) ?? [];

        for (const word of raw) {
            // keep c++ as its own form alongside the stripped base
            const lower = word.toLowerCase();
            add(lower);
            add(lower.replace(/\+\+$/, ""));

            const split = splitCamel(word);
            if (split.length > 1) {
                for (const part of split) {
                    add(part.toLowerCase());
                }
            }
        }

        // Note: punctuation-delimited parts (e.g. fs.readFile → "fs", "readFile")
        // are already handled by the [A-Za-z0-9]+ regex match above.
        // No glue token needed — it would only produce noise like "fsreadfile".
    }

    return tokens;
}
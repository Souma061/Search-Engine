export function generateSnippet(text: string, words: string[], maxLength = 160): string {
    if (!text || words.length === 0) {
        return text ? text.slice(0, maxLength) + "..." : "";
    }
    const lowerText = text.toLowerCase();

    // find the position of the firt matching query term

    let firstMatchIndex = -1;
    for (const word of words) {
        const index = lowerText.indexOf(word.toLocaleLowerCase());
        if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
            firstMatchIndex = index;
        }
    }
    // fallback if no term is found directly in body text
    if (firstMatchIndex === -1) {
        return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
    }
    // compute start and end offsets for a 160 char windows centered around the first match
    let start = Math.max(0, firstMatchIndex - 40);
    let end = Math.min(text.length, start + maxLength);

    // adjust start to avoid cutting off a word in half on the left

    if (start > 0) {
        const spaceIndex = text.indexOf(" ", start);
        if (spaceIndex !== -1 && spaceIndex < firstMatchIndex) {
            start = spaceIndex + 1;
        }
    }
    let snippet = text.slice(start, end).trim();
    if (start > 0) {
        snippet = "... " + snippet;
    }
    if (end < text.length) {
        snippet += " ...";
    }
    // highlight all matched query terms with <mark>
    for (const word of words) {
        if (!word) continue;
        const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
        snippet = snippet.replace(regex, `<mark>$&</mark>`);
    }
    return snippet;

}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

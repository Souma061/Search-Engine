const SYNONYM_MAP: Record<string, string[]> = {
    js: ["javascript"],
    javascript: ["js"],
    ts: ["typescript"],
    typescript: ["ts"],
    react: ["reactjs"],
    reactjs: ["react"],
    node: ["nodejs"],
    nodejs: ["node"],
    express: ["expressjs"],
    expressjs: ["express"],
    k8s: ["kubernetes"],
    kubernetes: ["k8s"],
    py: ["python"],
    python: ["py"],
};

export function expandTokens(tokens: string[]): string[] {
    const expanded = new Set<string>(tokens);
    for (const token of tokens) {
        const synonyms = SYNONYM_MAP[token.toLowerCase()];
        if (synonyms) {
            for (const synonym of synonyms) {
                expanded.add(synonym);
            }
        }
    }
    return Array.from(expanded);
}

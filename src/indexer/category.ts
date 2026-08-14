export type Category = "MDN" | "React" | "Node.js" | "TypeScript" | "Express" | "Next.js" | "General";


export function detectCategory(url: string): Category {
    try {
        const host = new URL(url).hostname.toLocaleLowerCase();

        if (host.includes("developer.mozilla.org")) return "MDN";
        if (host.includes("react.dev")) return "React";
        if (host.includes("nodejs.org")) return "Node.js";
        if (host.includes("typescriptlang.org")) return "TypeScript";
        if (host.includes("expressjs.com")) return "Express";
        if (host.includes("nextjs.org")) return "Next.js";

        return "General";
    } catch (error) {
        console.error(`Failed to detect category for ${url}`);
        console.error(error);
        return "General";
    }
}

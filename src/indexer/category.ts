export type Category = 
    | "MDN" 
    | "React" 
    | "Angular"
    | "Vue"
    | "Node.js" 
    | "TypeScript" 
    | "Python"
    | "Express" 
    | "Next.js" 
    | "Tailwind"
    | "Docker"
    | "General";

export function detectCategory(url: string): Category {
    try {
        const host = new URL(url).hostname.toLowerCase();

        if (host.includes("developer.mozilla.org")) return "MDN";
        if (host.includes("react.dev")) return "React";
        if (host.includes("angular.dev") || host.includes("angular.io")) return "Angular";
        if (host.includes("vuejs.org")) return "Vue";
        if (host.includes("nodejs.org")) return "Node.js";
        if (host.includes("typescriptlang.org")) return "TypeScript";
        if (host.includes("python.org")) return "Python";
        if (host.includes("expressjs.com")) return "Express";
        if (host.includes("nextjs.org")) return "Next.js";
        if (host.includes("tailwindcss.com")) return "Tailwind";
        if (host.includes("docker.com")) return "Docker";

        return "General";
    } catch (error) {
        console.error(`Failed to detect category for ${url}`);
        console.error(error);
        return "General";
    }
}

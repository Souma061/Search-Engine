export type Category =
    | "AI / ML"
    | "React"
    | "Next.js"
    | "Angular"
    | "Vue"
    | "MDN"
    | "TypeScript"
    | "Node.js"
    | "Python"
    | "Rust"
    | "Go"
    | "Express"
    | "FastAPI"
    | "Tailwind"
    | "Docker"
    | "Kubernetes"
    | "Databases"
    | "General";

export function detectCategory(url: string): Category {
    try {
        const host = new URL(url).hostname.toLowerCase();
        const path = new URL(url).pathname.toLowerCase();

        // AI / Machine Learning
        if (
            host.includes("huggingface.co") ||
            host.includes("pytorch.org") ||
            host.includes("langchain.com") ||
            host.includes("openai.com") ||
            host.includes("anthropic.com") ||
            host.includes("tensorflow.org") ||
            host.includes("scikit-learn.org") ||
            path.includes("/ai") ||
            path.includes("/machine-learning")
        ) {
            return "AI / ML";
        }

        // Frontend Frameworks
        if (host.includes("react.dev")) return "React";
        if (host.includes("nextjs.org")) return "Next.js";
        if (host.includes("angular.dev") || host.includes("angular.io")) return "Angular";
        if (host.includes("vuejs.org")) return "Vue";
        if (host.includes("tailwindcss.com")) return "Tailwind";

        // Web Standards
        if (host.includes("developer.mozilla.org")) return "MDN";

        // Programming Languages & Runtimes
        if (host.includes("typescriptlang.org")) return "TypeScript";
        if (host.includes("nodejs.org")) return "Node.js";
        if (host.includes("python.org")) return "Python";
        if (host.includes("rust-lang.org")) return "Rust";
        if (host.includes("go.dev") || host.includes("golang.org")) return "Go";

        // Backend Frameworks
        if (host.includes("expressjs.com")) return "Express";
        if (host.includes("fastapi.tiangolo.com")) return "FastAPI";

        // DevOps & Infrastructure
        if (host.includes("docker.com")) return "Docker";
        if (host.includes("kubernetes.io")) return "Kubernetes";

        // Databases
        if (
            host.includes("postgresql.org") ||
            host.includes("redis.io") ||
            host.includes("mongodb.com") ||
            host.includes("sqlite.org") ||
            host.includes("turso.tech")
        ) {
            return "Databases";
        }

        return "General";
    } catch (error) {
        console.error(`Failed to detect category for ${url}`);
        console.error(error);
        return "General";
    }
}

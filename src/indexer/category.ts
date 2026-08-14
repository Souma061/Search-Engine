export type Category = string;

const BRAND_NAME_MAP: Record<string, string> = {
    "developer.mozilla.org": "MDN",
    "react.dev": "React",
    "nextjs.org": "Next.js",
    "angular.dev": "Angular",
    "angular.io": "Angular",
    "vuejs.org": "Vue",
    "nodejs.org": "Node.js",
    "typescriptlang.org": "TypeScript",
    "python.org": "Python",
    "pytorch.org": "PyTorch",
    "huggingface.co": "Hugging Face",
    "langchain.com": "LangChain",
    "fastapi.tiangolo.com": "FastAPI",
    "expressjs.com": "Express",
    "tailwindcss.com": "Tailwind",
    "docker.com": "Docker",
    "kubernetes.io": "Kubernetes",
    "postgresql.org": "PostgreSQL",
    "redis.io": "Redis",
    "mongodb.com": "MongoDB",
};

const GENERIC_HOSTS = new Set(["example.com", "example.org", "localhost", "127.0.0.1"]);

/**
 * Dynamically detects the category / framework name for any URL.
 * Automatically derives brand names from domain names or HTML meta tags
 * without requiring manual code changes for new websites.
 */
export function detectCategory(url: string, siteName?: string): string {
    if (siteName && siteName.length > 1 && siteName.length < 30) {
        return siteName;
    }

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        if (GENERIC_HOSTS.has(host)) {
            return "General";
        }

        // Check common direct mapping
        for (const [domain, name] of Object.entries(BRAND_NAME_MAP)) {
            if (host.includes(domain)) {
                return name;
            }
        }

        // Generic fallback: strip subdomains (docs, dev, www, reference, api) and TLD (.org, .com, .dev, .io)
        const cleanHost = host.replace(/^(www|docs|developer|reference|api|guide)\./, "");
        const brand = cleanHost.split(".")[0];

        if (!brand || brand === "example") return "General";

        // Capitalize first letter (e.g. "svelte" -> "Svelte", "bun" -> "Bun")
        return brand.charAt(0).toUpperCase() + brand.slice(1);
    } catch {
        return "General";
    }
}

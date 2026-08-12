export class RobotsChecker {
    private disallowedPaths = new Set<string>();

    constructor(robotsTxt: string) {
        this.parse(robotsTxt);
    }

    canCrawl(url: string): boolean {
        const pathName = new URL(url).pathname;
        for (const path of this.disallowedPaths) {
            if (pathName.startsWith(path)) {
                return false;
            }
        }
        return true;
    }

    private parse(robotsTxt: string): void {
        let appliesToAll = false;
        for (const rawLine of robotsTxt.split(/\r?\n/)) {
            const line = rawLine.trim();

            if (!line || line.startsWith("#")) {
                continue;
            }
            const [directive, value = ""] = line.split(":", 2);
            const key = directive.trim().toLowerCase();
            const path = value.trim();
            if (key === "user-agent") {
                appliesToAll = path === "*";
                continue;
            }
            if (appliesToAll && key === "disallow" && path) {
                this.disallowedPaths.add(path);
            }
        }
    }

}
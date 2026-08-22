export class RateLimiter {
    private readonly lastRequest = new Map<string, number>();
    private readonly hostTails = new Map<string, Promise<void>>();

    private readonly delayMs: number;

    constructor(delayMs: number) {
        if (delayMs < 0) {
            throw new Error("Rate limit delay cannot be negative");
        }
        this.delayMs = delayMs;
    }

    async wait(url: string): Promise<void> {
        const host = new URL(url).host;

        const previous =
            this.hostTails.get(host) ??
            Promise.resolve();

        let release!: () => void;

        const current = new Promise<void>((resolve) => {
            release = resolve;
        });

        this.hostTails.set(
            host,
            previous.then(() => current),
        );

        await previous;

        const now = Date.now();
        const last = this.lastRequest.get(host) ?? 0;

        const elapsed = now - last;
        const remaining = this.delayMs - elapsed;

        if (remaining > 0) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, remaining);
            });
        }

        this.lastRequest.set(host, Date.now());

        release();
    }
}

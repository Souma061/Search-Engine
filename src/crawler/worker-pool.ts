type Job = () => Promise<void>;

export class WorkerPool {
    private readonly queue: Job[] = [];
    private activeWorkers = 0;

    private doneResolvers: Array<() => void> = [];

    private readonly concurrency: number;

    constructor(concurrency: number) {
        if (concurrency <= 0) {
            throw new Error("Concurrency must be greater than 0");
        }
        this.concurrency = concurrency;
    }

    submit(job: Job): void {
        this.queue.push(job);
        this.drain();
    }

    async done(): Promise<void> {
        if (
            this.queue.length === 0 &&
            this.activeWorkers === 0
        ) {
            return;
        }

        return new Promise((resolve) => {
            this.doneResolvers.push(resolve);
        });
    }

    private drain(): void {
        while (
            this.activeWorkers < this.concurrency &&
            this.queue.length > 0
        ) {
            const job = this.queue.shift()!;
            this.activeWorkers++;

            void this.run(job);
        }
    }

    private async run(job: Job): Promise<void> {
        try {
            await job();
        } catch (error) {
            console.error("Worker job failed:", error);
        } finally {
            this.activeWorkers--;

            this.drain();

            this.resolveDoneIfIdle();
        }
    }

    private resolveDoneIfIdle(): void {
        if (
            this.queue.length !== 0 ||
            this.activeWorkers !== 0
        ) {
            return;
        }

        const resolvers = this.doneResolvers.splice(
            0,
            this.doneResolvers.length,
        );

        for (const resolve of resolvers) {
            resolve();
        }
    }
}

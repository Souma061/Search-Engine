import {RateLimiter} from "../src/crawler/rate-limiter.ts";

const limiter = new RateLimiter(1000);

const start = Date.now();

await limiter.wait("http://localhost:3000/page1");
console.log("request 1:", Date.now() - start, "ms");

await limiter.wait("http://localhost:3000/page2");
console.log("request 2:", Date.now() - start, "ms");

await limiter.wait("http://localhost:3000/page3");
console.log("request 3:", Date.now() - start, "ms");
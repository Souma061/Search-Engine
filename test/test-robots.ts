import {RobotsChecker} from "../src/crawler/robots.ts";

const robotsTxt = `
User-agent: *
Disallow: /search.html
`;

const robots = new RobotsChecker(robotsTxt);

console.log(
    "search:",
    robots.canCrawl("http://localhost:3000/search.html"),
);

console.log(
    "java:",
    robots.canCrawl("http://localhost:3000/java.html"),
);

console.log(
    "backend:",
    robots.canCrawl("http://localhost:3000/backend.html"),
);
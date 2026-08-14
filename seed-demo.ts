import { SqliteDocumentStore } from "./src/store/sqlite-document-store.ts";
import { SqliteIndexStore } from "./src/store/sqlite-index-store.ts";
import { buildIndex } from "./src/indexer/inverted-index.ts";
import { detectCategory } from "./src/indexer/category.ts";
import type { Document } from "./src/indexer/document.ts";

const sampleDocs: Document[] = [
    {
        id: "https://react.dev/reference/react/useState",
        url: "https://react.dev/reference/react/useState",
        title: "useState – React Docs",
        text: "useState is a React Hook that lets you add state variables to functional components. Pass initial state to useState and call setFn to update value.",
        category: "React",
    },
    {
        id: "https://react.dev/reference/react/useMemo",
        url: "https://react.dev/reference/react/useMemo",
        title: "useMemo – React Docs",
        text: "useMemo is a React Hook that lets you cache the result of a calculation between re-renders in functional components.",
        category: "React",
    },
    {
        id: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
        title: "Fetch API - Web APIs | MDN",
        text: "The Fetch API provides a JavaScript interface for accessing and manipulating parts of the HTTP protocol, such as requests and responses with async await.",
        category: "MDN",
    },
    {
        id: "https://nodejs.org/api/fs.html",
        url: "https://nodejs.org/api/fs.html",
        title: "File System | Node.js v20 API Documentation",
        text: "The node:fs module enables interacting with the file system in a way modeled on standard POSIX functions. fs.readFile reads entire file asynchronously.",
        category: "Node.js",
    },
    {
        id: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
        url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
        title: "Documentation - Generics | TypeScript",
        text: "A major part of software engineering is building components that not only have well-defined and consistent APIs, but are also reusable using TypeScript generics.",
        category: "TypeScript",
    },
    {
        id: "https://expressjs.com/en/4x/api.html",
        url: "https://expressjs.com/en/4x/api.html",
        title: "Express 4.x API Reference",
        text: "The app object conventionally denotes the Express application. Create it by calling the top-level express() function exported by the Express module.",
        category: "Express",
    },
    {
        id: "https://nextjs.org/docs/app/building-your-application/routing",
        url: "https://nextjs.org/docs/app/building-your-application/routing",
        title: "Routing: Getting Started | Next.js Docs",
        text: "Next.js uses a file-system based router where folders define routes. Each folder in app directory represents a route segment mapped to URL path.",
        category: "Next.js",
    },
];

console.log("Seeding demo documentation into index.db...");
const docStore = new SqliteDocumentStore("index.db");
docStore.addMany(sampleDocs);

const { index, documentStats } = buildIndex(sampleDocs);
const indexStore = new SqliteIndexStore("index.db");
indexStore.saveIndex(index, documentStats);

console.log(`Successfully seeded ${sampleDocs.length} web dev documentation pages into index.db!`);

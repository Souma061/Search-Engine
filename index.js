import fs from "fs";

const DOCUMENTS_PATH = "./docs";
const files = fs.readdirSync(DOCUMENTS_PATH);

/*
 * Inverted Index
 *
 * Example:
 * {
 *   java: {
 *     "1.txt": 3,
 *     "3.txt": 1
 *   },
 *   backend: {
 *     "3.txt": 2
 *   }
 * }
 */
const index = {};

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/);
}
function rankResults(result) {
  return Object.entries(result).sort((a, b) => b[1] - a[1]);
}

for (const file of files) {
  const content = fs.readFileSync(`${DOCUMENTS_PATH}/${file}`, "utf-8");

  const words = tokenize(content);

  for (const word of words) {
      if(!index[word]) {
          index[word] = {
              documentFrequency : 0,
              postings : {}
          };
      }
      const postings = index[word].postings;
      if(!postings[file]) {
          postings[file] = 0;
          index[word].documentFrequency++;
      }
      postings[file]++;
  }
}

function search(word) {
  const result = index[word.toLowerCase()];

  if (!result) {
    console.log("No results");
    return;
  }
  const sortedResult = rankResults(result.postings);

  console.log(`\nResults for "${word}"`);

  for (const [file, count] of sortedResult) {
    console.log(`${file} -> ${count}`);
  }
}



function searchAND(query) {
  const words = tokenize(query);

  const firstFiles = index[words[0]]?.postings;

  if (!firstFiles) {
    console.log("No results");
    return;
  }

  const result = words.slice(1).reduce(
    (acc, word) => {
      const files = index[word]?.postings;

      if (!files) {
        return {};
      }

      const commonFiles = Object.keys(acc).filter((file) => files[file]);

      const newResult = {};

      for (const file of commonFiles) {
        newResult[file] = acc[file] + files[file];
      }

      return newResult;
    },
    { ...firstFiles },
  );
  const sortedResult = rankResults(result);

  console.log(`\nAND Search: "${query}"`);
  console.table(sortedResult);
}

function searchOR(query) {
  const words = tokenize(query);

  const firstFiles = index[words[0]]?.postings;

  if (!firstFiles) {
    console.log("No results");
    return;
  }

  const result = words.slice(1).reduce(
    (acc, word) => {
      const files = index[word]?.postings;

      if (!files) {
        return acc;
      }

      for (const file in files) {
        acc[file] = (acc[file] || 0) + files[file];
      }

      return acc;
    },
    { ...firstFiles },
  );
  const sortedResult = rankResults(result);

  console.log(`\nOR Search: "${query}"`);
  console.table(sortedResult);
}

function calculateIDF(word) {
    const term = index[word.toLowerCase()];
    if(!term) {
        return 0;
    }
    const  totalDocs = files.length;
    const documentFrequency = term.documentFrequency;
    return Math.log(totalDocs / documentFrequency);
}
console.log(index["java"]);

search("java");

searchAND("java backend");

searchOR("java programming");

console.log("IDF(java):", calculateIDF("java"));
console.log("IDF(backend):", calculateIDF("backend"));
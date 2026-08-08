import fs from "fs";

const files = fs.readdirSync("./docs");
const index = {};

function search(name) {
  //   const result = index[name.toLowerCase()];
  //   if (result) {
  //     console.log(`Found "${name}" in: `);
  //     for (const file of result) {
  //       console.log(file);
  //     }
  //   } else {
  //     console.log("Not found");
  //   }
  // now we have to modify the search function to return the files where the word is found along with the count of occurrences in each file
  const result = index[name.toLowerCase()];
  if (result) {
    console.log(`Found "${name}" in: `);
    for (const file in result) {
      console.log(`${file}: ${result[file]} occurrences`);
    }
  } else {
    console.log("Not found");
  }
}
function searchByWords(query) {
  //   const words = query.toLowerCase().split(" ");

  //   const firstWord = index[words[0]];

  //   if (!firstWord) {
  //     console.log("No results");
  //     return;
  //   }

  //   const result = words.slice(1).reduce(
  //     (acc, word) => {
  //       const files = index[word];

  //       if (!files) {
  //         return [];
  //       }

  //       return acc.filter((file) => files.includes(file));
  //     },
  //     [...firstWord],
  //   );

  //   console.log(result);
  //same as above, we have to modify the searchByWords function to return the files where all the words are found along with the count of occurrences in each file
  const words = query.toLowerCase().split(" ");

  const firstWord = index[words[0]];

  if (!firstWord) {
    console.log("No results");
    return;
  }

  const result = words.slice(1).reduce(
    (acc, word) => {
      const files = index[word];

      if (!files) {
        return {};
      }

      const filteredFiles = Object.keys(acc).filter((file) => files[file]);

      const newResult = {};
      for (const file of filteredFiles) {
        newResult[file] = acc[file] + files[file];
      }

      return newResult;
    },
    { ...firstWord },
  );

  console.log(result);
}

function searchOR(query) {
  //   const words = query.toLowerCase().split(" ");
  //   const firstFiles = index[words[0]];
  //   if (!firstFiles) {
  //     console.log("No results");
  //     return;
  //   }
  //   const result = words.slice(1).reduce(
  //     (acc, word) => {
  //       const files = index[word];
  //       if (!files) {
  //         return acc;
  //       }
  //       return [...new Set([...acc, ...files])]; // Union of files
  //     },
  //     [...firstFiles],
  //   );
  //   console.log(result);
  // same as above, we have to modify the searchOR function to return the files where any of the words are found along with the count of occurrences in each file
  const words = query.toLowerCase().split(" ");
  const firstFiles = index[words[0]];
  if (!firstFiles) {
    console.log("No results");
    return;
  }
  const result = words.slice(1).reduce(
    (acc, word) => {
      const files = index[word];
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
  console.log(result);
}

for (const file of files) {
  const content = fs.readFileSync(`./docs/${file}`, "utf-8");

  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/);

  console.log(words);

  for (const word of words) {
    // // inverted index
    // if (!index[word]) {
    //   index[word] = [];
    // }
    // if (!index[word].includes(file)) {
    //   index[word].push(file);
    // }
    // instead of stroing array, we can store this as an object with the file name as the key and the count of occurrences as the value
    if (!index[word]) {
      index[word] = {};
    }
    // Increment the count of occurrences for the file
    index[word][file] = (index[word][file] || 0) + 1;
    // console.log(index[word][file]);
    console.log(index[word][file]);
  }
}
// search("java"); // Replace "example" with the word you want to search for
// // console.log(index);
// console.log(index["java"]);
// console.log(index["backend"]);
searchByWords("python development"); // Replace "example" with the word you want to search for
searchOR("python java"); // Replace "example" with the word you want to search for

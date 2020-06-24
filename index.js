const Apify = require("apify");
const { parse } = require("url");

const set = new Set();
let [, , url] = process.argv;

if (!url && typeof url !== "string") {
  console.error("Specify an URL to crawl", "node index.js <url>");
  process.exit();
}
url = url.replace(/\/+$/, "");

Apify.main(async () => {
  const requestQueue = await Apify.openRequestQueue();
  await requestQueue.addRequest({ url });
  const pseudoUrls = [new Apify.PseudoUrl(`${url}/[.*]`)];

  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    maxRequestsPerCrawl: Infinity,
    maxConcurrency: 100,
    handlePageFunction: async ({ request, $ }) => {
      console.log("Visiting", request.url);
      set.add(request.url);
      await Apify.utils.enqueueLinks({
        $,
        selector: "a",
        pseudoUrls,
        baseUrl: url,
        requestQueue
      });
    }
  });
  // Run the crawler
  await crawler.run();
});

let analyzed = false;
process.on("SIGINT", () => {
  analyzeUrls(set.values(), set.size);
  analyzed = true;
  process.exit(0);
});

process.on("exit", () => {
  if (!analyzed) {
    analyzeUrls(set.values(), set.size);
  }
});

function getSlugPath(url, depth = 2) {
  const { origin, search, pathname } = url;
  const pathParts = pathname.substring(1).split("/");

  const redactString = ":id";
  const end = "*";
  const specialCharsRegex = /\W|_/g;
  const digitsRegex = /[0-9]/g;
  const lowerCaseRegex = /[a-z]/g;
  const upperCaseRegex = /[A-Z]/g;

  var redactedParts = [];
  var redcatedBefore = false;

  for (let index = 0; index < pathParts.length; index++) {
    const part = pathParts[index];

    if (redcatedBefore || index > depth - 1) {
      if (part) {
        redactedParts.push(end);
      }
      break;
    }

    var numberOfSpecialChars = (part.match(specialCharsRegex) || []).length;
    if (numberOfSpecialChars >= 3) {
      redactedParts.push(redactString);
      redcatedBefore = true;
      continue;
    }

    var numberOfDigits = (part.match(digitsRegex) || []).length;
    if (
      numberOfDigits > 3 ||
      (part.length > 3 && numberOfDigits / part.length >= 0.3)
    ) {
      redactedParts.push(redactString);
      redcatedBefore = true;
      continue;
    }

    var numberofUpperCase = (part.match(upperCaseRegex) || []).length;
    var numberofLowerCase = (part.match(lowerCaseRegex) || []).length;
    var lowerCaseRate = numberofLowerCase / part.length;
    var upperCaseRate = numberofUpperCase / part.length;
    if (
      part.length > 5 &&
      ((upperCaseRate > 0.3 && upperCaseRate < 0.6) ||
        (lowerCaseRate > 0.3 && lowerCaseRate < 0.6))
    ) {
      redactedParts.push(redactString);
      redcatedBefore = true;
      continue;
    }

    part && redactedParts.push(part);
  }

  const redacted =
    (origin ? origin + "/" : "/") +
    (redactedParts.length >= 2
      ? redactedParts.join("/")
      : redactedParts.join("")) +
    (search ? "?{query}" : "");
  return redacted;
}

function getPageUrl(url) {
  let parsed;
  if (typeof window !== "undefined") {
    parsed = new window.URL(url);
  } else {
    parsed = parse(url);
  }
  return getSlugPath(parsed);
}

function analyzeUrls(urlList, size) {
  var datas = [];
  var uniqChange = new Set();

  for (const url of urlList) {
    const changed = getPageUrl(url);
    const prop = {
      before: url,
      after: changed
    };
    uniqChange.add(changed);
    datas.push(prop);
  }

  console.log("carinality before", size, "after", uniqChange.size);
  console.table(datas);
}

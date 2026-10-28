import express, { Router } from "express";
import serverless from "serverless-http";
import cors from "cors";
import axios from "axios";
import { Client } from "@notionhq/client";
import { getLLBuild, getPropertiesObject } from "./ll-utils";

const api = express();
const router = Router();

let run;
let bundle = [];
let cache = { date: null, data: null };
let notion;
const statusOrder = ["playing", "replaying", "queued", "finished", "completed"];

api.use(cors());

api.use("/api/", router);

router.get("/hello", (req, res) => res.send("Hello World!"));

router.get("/gamelist/:id", (req, res) => {
  notion = new Client({
    auth: "secret_bosJYRpBzDUNd9bfqiQ0yWJknYA66G5ebvUhqTiy9E2",
  });
  (async () => {
    const result = await getNotionData(
      req.params.id === "initial" ? undefined : req.params.id
    );

    const trimmedResult = [];
    result.results.forEach((gamedata) => {
      trimmedResult.push(getGameObject(gamedata));
    });
    res.json(trimmedResult);

    // const uniqueTrimmedResult = removeDuplicatesAndSort(trimmedResult, "id");

    // res.json(uniqueTrimmedResult);
  })();
});

router.get("/gamelist", (req, res) => {
  (async () => {
    try {
      notion = new Client({
        auth: "secret_bosJYRpBzDUNd9bfqiQ0yWJknYA66G5ebvUhqTiy9E2",
      });
      run = 1;
      await startNotionLooper(res, undefined, run);
    } catch (error) {
      console.error("Failed to load Gamelist data", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Unable to load Gamelist data." });
      }
    }
  })();
});

// router.get("/artwork", (req, res) => {
//   const headers = {
//     "Client-ID": "m83mbo6r56trenidw05tz7rl0qake9",
//     Authorization: "Bearer mgqzu153x5jc9j006dnu8iv36532td",
//     "Content-Type": "application/json",
//     Accept: "application/json",
//   };

//   axios
//     .post("https://api.igdb.com/v4/games", { fields: "*" }, { headers })
//     .then((response) => {
//       res.json(response);
//     })
//     .catch((err) => {
//       res.json(err);
//     });
// });

async function startNotionLooper(res, next_cursor = undefined, run = 1) {
  let result = await getNotionData(next_cursor);

  if (run === 1) {
    if (result.results[0].last_edited_time === cache.date) {
      // nothing changed, return cache
      console.log("cache hit");
      return res.json(cache.data);
    } else {
      // set cache date and keep going
      cache.date = result.results[0].last_edited_time;
    }
  }

  // on response, add result to bundle
  bundle = [...bundle, ...result.results];

  if (result.has_more) {
    // if this is not all, do it again using the new next_cursor
    next_cursor = result.next_cursor;
    console.log("requesting new data using", next_cursor);
    run = run + 1;
    await startNotionLooper(res, next_cursor, run);
  } else {
    const trimmedResult = [];

    bundle.forEach((gamedata) => {
      trimmedResult.push(getGameObject(gamedata));
    });

    const uniqueTrimmedResult = removeDuplicatesAndSort(trimmedResult, "id");

    bundle.splice(0, bundle.length);

    // set final as cache
    cache.data = uniqueTrimmedResult;

    // once done, return the bundle
    res.json(uniqueTrimmedResult);
  }
}

async function getNotionData(next_cursor) {
  const result = await notion.databases.query({
    database_id: "1f41efa65d6e47eebe88b6313a2f9889",
    start_cursor: next_cursor,
    sorts: [
      {
        timestamp: "last_edited_time",
        direction: "descending",
      },
    ],
  });

  return result;
}

export const handler = serverless(api);

function removeDuplicatesAndSort(arr, prop) {
  const seen = new Map();
  arr.filter((item) => {
    const value = item[prop];
    if (!seen.has(value)) {
      seen.set(value, true);
      return true;
    }
    return false;
  });

  const groupedByStatus = arr.reduce((acc, obj) => {
    const status = statusOrder.find((value) => obj.status.includes(value));
    if (!status) return acc;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(obj);
    return acc;
  }, {});

  for (const status in groupedByStatus) {
    if (groupedByStatus.hasOwnProperty(status)) {
      groupedByStatus[status].sort((a, b) => {
        // Sort by rating (high to low)
        if (b.rating !== a.rating) {
          return b.rating - a.rating;
        }
        // If rating is the same, sort by name (alphabetically)
        return a.name.localeCompare(b.name);
      });
    }
  }

  const result = [];

  for (const status of statusOrder) {
    if (groupedByStatus[status]) {
      result.push(...groupedByStatus[status]);
    }
  }

  return result;
}

function getGameObject(gamedata) {
  const statusProperty = gamedata.properties?.status;
  return {
    id: gamedata.id,
    status: statusProperty?.multi_select?.map((tag) => tag.name) ||
      [statusProperty?.status?.name || statusProperty?.select?.name].filter(Boolean),
    rating: gamedata.properties?.rating?.select?.name || "",
    image: gamedata.properties?.cover?.files?.[0]?.name || "",
    name: gamedata.properties?.title?.title?.[0]?.plain_text || "",
    platform: gamedata.properties?.platform?.multi_select?.[0]?.name || "",
    completed: gamedata.properties?.completed?.checkbox || false,
  };
}

/**
 * LL STUFF
 */

//get data based on userid
router.get("/ll/:userid", (req, res) => {
  notion = new Client({
    auth: "secret_3Chdy721CTWbWAqsfwox0pCiVedTyLVXIIl58D7joY3",
  });
  (async () => {
    const data = await getNotionLLData();
    const trimmedResult = [];
    const userId = req.params.userid;
    data.results.forEach((entry) => {
      if (
        entry.properties.userid.rich_text[0].plain_text === userId ||
        userId === "all"
      ) {
        trimmedResult.push(getLLBuild(entry));
      }
    });
    res.json(trimmedResult);
  })();
});

//add / update
router.post("/ll/add/", (req, res) => {
  notion = new Client({
    auth: "secret_3Chdy721CTWbWAqsfwox0pCiVedTyLVXIIl58D7joY3",
  });

  const requestBody = JSON.parse(req.body);

  (async () => {
    const data = await getNotionLLData();
    const userIdToLookFor = requestBody.userid;
    const nameToLookFor = requestBody.name;
    let foundId = null;
    data.results.forEach((page) => {
      if (
        page.properties.userid.rich_text[0].plain_text === userIdToLookFor &&
        page.properties.name.title[0].plain_text === nameToLookFor
      ) {
        foundId = page.id;
      }
    });
    let response;
    if (foundId) {
      console.log(
        nameToLookFor,
        "is found in NOTION! please update using:",
        foundId
      );
      response = await notion.pages.update({
        page_id: foundId,
        properties: getPropertiesObject(requestBody),
      });
    } else {
      console.log(nameToLookFor, "is not found in NOTION!");
      response = await notion.pages.create({
        parent: {
          type: "database_id",
          database_id: "1166b583229a80f4a431e9b43908ff61",
        },
        properties: getPropertiesObject(requestBody),
      });
    }

    console.log(response);

    res.send({
      message: "New user was added to the list",
    });
  })();
});

// delete
router.get("/ll/delete/:userid/:name", (req, res) => {
  notion = new Client({
    auth: "secret_3Chdy721CTWbWAqsfwox0pCiVedTyLVXIIl58D7joY3",
  });

  (async () => {
    const data = await getNotionLLData();
    const userIdToLookFor = req.params.userid;
    const nameToLookFor = req.params.name;
    let foundId = null;
    data.results.forEach((page) => {
      if (
        page.properties.userid.rich_text[0].plain_text === userIdToLookFor &&
        page.properties.name.title[0].plain_text === nameToLookFor
      ) {
        foundId = page.id;
      }
    });
    if (foundId) {
      console.log(nameToLookFor, "is found in NOTION! will delete!", foundId);
      const response = await notion.pages.update({
        page_id: foundId,
        in_trash: true,
      });

      if (response.in_trash && response.in_trash) {
        res.send({
          message: `${response.properties.name.title[0].plain_text} has been removed from ${response.properties.userid.rich_text[0].plain_text}`,
        });
      } else {
        res.send({
          message: `Something went wrong when deleting ${nameToLookFor}, nothing deleted...`,
        });
      }
    } else {
      res.send({
        message: `${nameToLookFor} was not found, nothing to delete!`,
      });
    }
  })();
});

async function getNotionLLData() {
  const result = await notion.databases.query({
    database_id: "1166b583229a80f4a431e9b43908ff61",
    sorts: [],
  });

  return result;
}

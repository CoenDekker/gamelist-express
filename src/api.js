import express, { Router } from "express";
import serverless from "serverless-http";
import cors from "cors";
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

router.get("/gamelist/search", async (req, res) => {
  const name = req.query.name;
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required." });
  }
  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist access is not configured." });
  }

  try {
    const client = new Client({ auth: process.env.NOTION_GAMELIST_TOKEN });
    const matches = [];
    let cursor;
    do {
      const result = await client.databases.query({
        database_id: "1f41efa65d6e47eebe88b6313a2f9889",
        filter: { property: "title", title: { contains: name.trim() } },
        sorts: [{ property: "title", direction: "ascending" }],
        page_size: 100,
        start_cursor: cursor,
      });
      matches.push(...result.results.map(getGameObject));
      cursor = result.next_cursor;
    } while (cursor);
    res.json(matches);
  } catch (error) {
    console.error("Failed to search Gamelist", error);
    res.status(500).json({ error: "Unable to search Gamelist." });
  }
});

router.get("/gamelist/game/:id", async (req, res) => {
  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist access is not configured." });
  }

  try {
    const client = new Client({ auth: process.env.NOTION_GAMELIST_TOKEN });
    const page = await client.pages.retrieve({ page_id: req.params.id });
    if (page.parent?.database_id?.replace(/-/g, "") !== "1f41efa65d6e47eebe88b6313a2f9889" || page.archived) {
      return res.status(404).json({ error: "Game not found." });
    }
    res.json(getGameObject(page));
  } catch (error) {
    if (error.code === "object_not_found" || error.code === "validation_error") {
      return res.status(404).json({ error: "Game not found." });
    }
    console.error("Failed to load game", error);
    res.status(500).json({ error: "Unable to load game." });
  }
});

router.patch("/gamelist/game/:id", express.json(), async (req, res) => {
  if (!process.env.GAMELIST_WRITE_KEY || req.get("x-api-key") !== process.env.GAMELIST_WRITE_KEY) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const changes = req.body;
  const fields = ["name", "coverUrl", "platform", "status", "rating"];
  if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
    !Object.keys(changes).length || Object.keys(changes).some((field) => !fields.includes(field))) {
    return res.status(400).json({ error: `Provide one or more of: ${fields.join(", ")}.` });
  }

  const properties = {};
  let statusChange;
  for (const [field, value] of Object.entries(changes)) {
    if (typeof value !== "string" || (field !== "rating" && !value.trim())) {
      return res.status(400).json({ error: `${field} must be a non-empty string.` });
    }
    if (field === "name") {
      properties.title = { title: [{ text: { content: value.trim() } }] };
    } else if (field === "coverUrl") {
      let cover;
      try {
        cover = new URL(value);
      } catch {
        return res.status(400).json({ error: "coverUrl must be an HTTP(S) URL." });
      }
      if (!["http:", "https:"].includes(cover.protocol)) {
        return res.status(400).json({ error: "coverUrl must be an HTTP(S) URL." });
      }
      properties.cover = { files: [{ name: cover.href, type: "external", external: { url: cover.href } }] };
    } else if (field === "platform") {
      properties.platform = { multi_select: [{ name: value.trim() }] };
    } else if (field === "status") {
      if (!statusOrder.includes(value)) {
        return res.status(400).json({ error: `status must be one of: ${statusOrder.join(", ")}.` });
      }
      statusChange = value;
    } else if (field === "rating") {
      properties.rating = { select: value.trim() ? { name: value.trim() } : null };
    }
  }

  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist write access is not configured." });
  }

  try {
    const client = new Client({ auth: process.env.NOTION_GAMELIST_TOKEN });
    const existing = await client.pages.retrieve({ page_id: req.params.id });
    if (existing.parent?.database_id?.replace(/-/g, "") !== "1f41efa65d6e47eebe88b6313a2f9889" || existing.archived) {
      return res.status(404).json({ error: "Game not found." });
    }
    if (statusChange) {
      properties.status = makeStatusProperty(existing.properties?.status?.type, statusChange);
    }
    const page = await client.pages.update({ page_id: req.params.id, properties });
    cache = { date: null, data: null };
    res.json(getGameObject(page));
  } catch (error) {
    if (error.code === "object_not_found") {
      return res.status(404).json({ error: "Game not found." });
    }
    if (error.code === "validation_error") {
      console.error("Notion rejected Gamelist update:", error.message);
      return res.status(400).json({ error: "Invalid game update.", details: error.message });
    }
    console.error("Failed to update game", error);
    res.status(500).json({ error: "Unable to update game." });
  }
});

router.get("/gamelist/:id", (req, res) => {
  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist access is not configured." });
  }
  notion = new Client({
    auth: process.env.NOTION_GAMELIST_TOKEN,
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
  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist access is not configured." });
  }
  (async () => {
    try {
      notion = new Client({
        auth: process.env.NOTION_GAMELIST_TOKEN,
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

router.post("/gamelist", express.json(), async (req, res) => {
  if (!process.env.GAMELIST_WRITE_KEY || req.get("x-api-key") !== process.env.GAMELIST_WRITE_KEY) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { name, coverUrl, platform, status } = req.body || {};
  const required = { name, coverUrl, platform, status };
  const missing = Object.entries(required)
    .filter(([, value]) => typeof value !== "string" || !value.trim())
    .map(([field]) => field);

  if (missing.length) {
    return res.status(400).json({ error: "Missing or invalid required fields.", fields: missing });
  }

  let cover;
  try {
    cover = new URL(coverUrl);
  } catch {
    return res.status(400).json({ error: "coverUrl must be an HTTP(S) URL." });
  }
  if (!["http:", "https:"].includes(cover.protocol)) {
    return res.status(400).json({ error: "coverUrl must be an HTTP(S) URL." });
  }
  if (!statusOrder.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${statusOrder.join(", ")}.` });
  }

  if (!process.env.NOTION_GAMELIST_TOKEN) {
    return res.status(503).json({ error: "Gamelist write access is not configured." });
  }

  try {
    const client = new Client({ auth: process.env.NOTION_GAMELIST_TOKEN });
    const database = await client.databases.retrieve({
      database_id: "1f41efa65d6e47eebe88b6313a2f9889",
    });
    const page = await client.pages.create({
      parent: { database_id: "1f41efa65d6e47eebe88b6313a2f9889" },
      properties: {
        title: { title: [{ text: { content: name.trim() } }] },
        cover: { files: [{ name: cover.href, type: "external", external: { url: cover.href } }] },
        platform: { multi_select: [{ name: platform.trim() }] },
        status: makeStatusProperty(database.properties?.status?.type, status),
      },
    });
    cache = { date: null, data: null };
    res.status(201).json(getGameObject(page));
  } catch (error) {
    console.error("Failed to add game", error);
    if (error.code === "validation_error") {
      return res.status(400).json({ error: "Invalid game details.", details: error.message });
    }
    res.status(500).json({ error: "Unable to add game." });
  }
});

function makeStatusProperty(type, name) {
  if (type === "status") return { status: { name } };
  if (type === "multi_select") return { multi_select: [{ name }] };
  if (type === "select") return { select: { name } };
  throw new Error(`Unsupported Notion status property type: ${type || "missing"}.`);
}

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

router.use("/ll", (req, res, next) => {
  if (!process.env.NOTION_LL_TOKEN) {
    return res.status(503).json({ error: "LL access is not configured." });
  }
  next();
});

//get data based on userid
router.get("/ll/:userid", (req, res) => {
  notion = new Client({
    auth: process.env.NOTION_LL_TOKEN,
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
    auth: process.env.NOTION_LL_TOKEN,
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
    auth: process.env.NOTION_LL_TOKEN,
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

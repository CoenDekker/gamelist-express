# Install

npm install -g netlify-cli

npm install

This question has more than 30 answers, most suggesting to either downgrade Node.js to pre v17 or to use the legacy SSL provider. Both of those solutions are hacks that leave your builds open to security threats.

Reason For The Error
In Node.js v17, the Node.js developers closed a security hole in the SSL provider. This fix was a breaking change that corresponded with similar breaking changes in the SSL packages in NPM. When you attempt to use SSL in Node.js v17 or later without also upgrading those SSL packages in your package.json, then you will see this error.

The Correct (safe) Solution (for npm users)
Use an up-to-date version of Node.js, and also use packages that are up-to-date with security fixes.

You can first try an update to see if that solves the problem:

npm update
If that is not enough, for many people, the following command will fix the issue:

npm audit fix --force
However, be aware that, for complex builds, the above command will pull in breaking security fixes that can potentially break your build.

Note for Yarn users
Yarn users can use yarn-audit-fix which can be run without installing as a dependency via

npm_config_yes=true npx yarn-audit-fix
or windows powershell:

$env:npm_config_yes = 1; npx yarn-audit-fix
A less heavy-handed (also correct) solution for Webpack
In your Webpack config, set either of the following: (See the ouput.hashFunction docs)

A. (Webpack v5) Set output.hashFunction = 'xxhash64'.
B. (Webpack v4) This will depend on what hash algorithms nodejs supports on your system. Some common options you can try are output.hashFunction = 'sha512' or output.hashFunction = 'sha256'.

# deploy

npm run build
npm run deploy

# Netlify environment variables

Add these three variables to the site's environment variables in Netlify for
the deployed Functions (including the production environment):

| Variable | Value | Used by |
| --- | --- | --- |
| `NOTION_GAMELIST_TOKEN` | Notion integration secret with access to the gamelist database | Read and add games |
| `NOTION_LL_TOKEN` | Notion integration secret with access to the LL database | Read, add, update, and delete LL builds |
| `GAMELIST_WRITE_KEY` | A new random private key, for example generated with `openssl rand -hex 32` | Authorize adding games via `x-api-key` |

Generate the integration secrets in Notion, then store them in Netlify. One
Notion integration token may be used for both variables if that integration has
access to both databases. Do not put these secrets in browser code. Previously
committed Notion and Twitch/IGDB secrets should be rotated, since removing them
from the current files does not remove them from Git history.

The inactive IGDB example does not need Netlify variables. To run its local
requests in `src/igdb.http`, set `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in
your local environment; `IGDB_ACCESS_TOKEN` is a short-lived Twitch access
token obtained from the first request. The Notion HTTP examples use the local
`NOTION_GAMELIST_TOKEN` environment variable.

# Add a game

Send a JSON request to `POST /api/gamelist` with `GAMELIST_WRITE_KEY` in the
`x-api-key` header. Keep the key on the server; do not expose it in a browser.

Required fields: `name`, `coverUrl` (an HTTP or HTTPS URL), `platform`, and
`status` (`playing`, `replaying`, `queued`, `finished`, or `completed`).

```sh
curl -X POST http://localhost:8888/api/gamelist \
	-H "Content-Type: application/json" \
	-H "x-api-key: $GAMELIST_WRITE_KEY" \
	-d '{"name":"Example Game","coverUrl":"https://example.com/cover.jpg","platform":"PC","status":"queued"}'
```

Successful requests return `201` and the created game. Missing or invalid fields
return `400`; missing or incorrect API keys return `401`.

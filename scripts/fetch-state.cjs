"use strict";

/**
 * fetch-state.cjs — Build-time fetch of GitHub Releases for the 3 repos.
 * Writes src/data/state.json. The Astro /state page imports it.
 *
 * Uses GITHUB_TOKEN env (Actions-scoped during CI) for rate-limit headroom.
 * Falls back to anonymous fetch with reduced reliability if no token.
 * Always writes some JSON so the build never breaks on a failed fetch.
 */

var fs = require("fs");
var path = require("path");
var https = require("https");

var OUT = path.resolve(__dirname, "..", "src", "data", "state.json");

var REPOS = [
  { owner: "volivarii", repo: "actian-ds-knowledge", label: "Knowledge" },
  { owner: "volivarii", repo: "Actian-DS-Claude-plugin", label: "Plugin" },
  { owner: "volivarii", repo: "actian-ds-docs", label: "Docs" },
];

function ghFetch(url) {
  return new Promise(function (resolve, reject) {
    var headers = {
      "User-Agent": "actian-ds-docs-fetch-state",
      "Accept": "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = "Bearer " + process.env.GITHUB_TOKEN;
    }
    https.get(url, { headers: headers }, function (res) {
      var body = "";
      res.on("data", function (chunk) { body += chunk; });
      res.on("end", function () {
        if (res.statusCode >= 400) {
          reject(new Error("GitHub API " + res.statusCode + ": " + body.slice(0, 200)));
        } else {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        }
      });
    }).on("error", reject);
  });
}

function fetchReleases(owner, repo) {
  return ghFetch("https://api.github.com/repos/" + owner + "/" + repo + "/releases?per_page=10");
}

function fetchTags(owner, repo) {
  return ghFetch("https://api.github.com/repos/" + owner + "/" + repo + "/tags?per_page=10");
}

function writeOut(payload) {
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
}

function main() {
  var promises = REPOS.map(function (r) {
    return Promise.all([
      fetchReleases(r.owner, r.repo).catch(function () { return []; }),
      fetchTags(r.owner, r.repo).catch(function () { return []; }),
    ]).then(function (results) {
      var releases = results[0] || [];
      var tags = results[1] || [];
      return {
        label: r.label,
        owner: r.owner,
        repo: r.repo,
        latest_tag: tags[0] ? tags[0].name : null,
        recent_releases: releases.slice(0, 5).map(function (rel) {
          return {
            tag_name: rel.tag_name,
            name: rel.name,
            published_at: rel.published_at,
            html_url: rel.html_url,
          };
        }),
      };
    });
  });

  Promise.all(promises)
    .then(function (repos) {
      writeOut({ repos: repos, fetched_at: new Date().toISOString() });
      console.log("fetch-state: wrote " + OUT);
    })
    .catch(function (err) {
      console.error("fetch-state: WARNING — " + err.message);
      // Still emit something so the build doesn't error on missing import.
      writeOut({ repos: [], fetched_at: new Date().toISOString(), error: err.message });
    });
}

if (require.main === module) {
  main();
}

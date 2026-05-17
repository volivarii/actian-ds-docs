"use strict";

/**
 * constants.cjs — Shared constants for build-time scripts.
 *
 * Centralizes federation-sensitive strings so a future knowledge-repo
 * transfer (volivarii/* → actian-org/*) is a one-line change here.
 */

var KNOWLEDGE_REPO = "volivarii/actian-ds-knowledge";
var KNOWLEDGE_REPO_URL = "https://github.com/" + KNOWLEDGE_REPO;

module.exports = {
  KNOWLEDGE_REPO: KNOWLEDGE_REPO,
  KNOWLEDGE_REPO_URL: KNOWLEDGE_REPO_URL,
};

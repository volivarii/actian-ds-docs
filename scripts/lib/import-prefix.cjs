"use strict";

const path = require("node:path");

/**
 * Compute the relative `../...` path from an emitted file's directory to
 * an import target directory. Always returns POSIX separators (MDX
 * imports must use forward slashes regardless of build OS).
 *
 * Replaces magic numbers like `"../".repeat(5 + nestDepth) + "components"`
 * with a computed value derived from actual file paths — the original
 * formulation was fragile because `5` was untested and `5 + nestDepth`
 * could silently break if the emit-path structure changed.
 *
 * @param {string} emitFilePath - absolute path of the file being emitted
 * @param {string} importTargetDir - absolute path of the import target dir
 * @returns {string} relative path, e.g. "../../../components"
 */
function computeImportPrefix(emitFilePath, importTargetDir) {
  const emitDir = path.dirname(emitFilePath);
  const rel = path.relative(emitDir, importTargetDir);
  // Normalize to POSIX (path.relative uses platform separator on Windows).
  return rel.split(path.sep).join("/");
}

module.exports = { computeImportPrefix };

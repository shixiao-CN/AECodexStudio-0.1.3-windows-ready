"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var readline = require("readline");
var CodexClient = require("../js/codex-client.js").CodexClient;

function findFile(root, fileName) {
  var entries = fs.readdirSync(root, { withFileTypes: true });
  for (var i = 0; i < entries.length; i += 1) {
    var fullPath = path.join(root, entries[i].name);
    if (entries[i].isFile() && entries[i].name.toLowerCase() === fileName.toLowerCase()) { return fullPath; }
    if (entries[i].isDirectory()) {
      var nested = findFile(fullPath, fileName);
      if (nested) { return nested; }
    }
  }
  return null;
}

async function main() {
  var pluginRoot = path.resolve(__dirname, "..");
  var pnpmRoot = path.join(pluginRoot, "node_modules", ".pnpm");
  var codexPath = findFile(pnpmRoot, process.platform === "win32" ? "codex.exe" : "codex");
  if (!codexPath) { throw new Error("Bundled Codex binary was not found."); }

  var client = new CodexClient({
    childProcess: childProcess,
    readline: readline,
    codexPath: codexPath,
    cwd: pluginRoot,
    platform: process.platform
  });
  client.on("diagnostic", function (message) { process.stderr.write(message + "\n"); });
  var timeout = setTimeout(function () {
    client.stop();
    process.stderr.write("App Server smoke test timed out.\n");
    process.exitCode = 1;
  }, 20000);

  await client.start();
  clearTimeout(timeout);
  console.log("App Server initialized; thread/start accepted: " + client.threadId);
  client.stop();
}

main().catch(function (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

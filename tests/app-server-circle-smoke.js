"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var readline = require("readline");
var CodexClient = require("../js/codex-client.js").CodexClient;
var protocol = require("../js/protocol.js");

function findFile(root, fileName) {
  if (!fs.existsSync(root)) { return null; }
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
  var codexPath = findFile(path.join(pluginRoot, "node_modules", ".pnpm"), process.platform === "win32" ? "codex.exe" : "codex");
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
    process.stderr.write("Circle Structured Output smoke test timed out.\n");
    process.exitCode = 1;
  }, 120000);

  try {
    var snapshot = {
      aeVersion: "24.0",
      projectName: "Circle Smoke Test",
      activeComp: { name: "Circle Test", width: 1920, height: 1080, duration: 10, frameRate: 30, time: 0, numLayers: 0, selectedLayers: [] }
    };
    var prompt = protocol.buildPrompt("创建一个圆形", snapshot, "$ae-dev");
    var skillItems = [{ type: "skill", name: "ae-dev", path: path.join(pluginRoot, "skills", "ae-dev", "SKILL.md") }];
    var responseText = await client.runTurn(prompt, skillItems, protocol.createOutputSchema([], "创建一个圆形"));
    var response = protocol.parseResult(responseText);
    if (response.actions.length !== 1 || response.actions[0].op !== "create_ellipse") {
      throw new Error("Expected one create_ellipse action, received: " + JSON.stringify(response));
    }
    if (response.actions[0].size[0] !== response.actions[0].size[1]) {
      throw new Error("Ellipse action is not a circle: " + JSON.stringify(response.actions[0].size));
    }
    console.log(JSON.stringify(response));
  } finally {
    clearTimeout(timeout);
    client.stop();
  }
}

main().catch(function (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

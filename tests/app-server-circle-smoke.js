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
    if (entries[i].isDirectory()) { var nested = findFile(fullPath, fileName); if (nested) { return nested; } }
  }
  return null;
}

async function main() {
  var pluginRoot = path.resolve(__dirname, "..");
  var codexPath = findFile(path.join(pluginRoot, "node_modules", ".pnpm"), process.platform === "win32" ? "codex.exe" : "codex");
  if (!codexPath) { throw new Error("Bundled Codex binary was not found."); }
  var client = new CodexClient({ childProcess: childProcess, readline: readline, codexPath: codexPath, cwd: pluginRoot, platform: process.platform });
  client.on("diagnostic", function (message) { process.stderr.write(message + "\n"); });
  var timeout = setTimeout(function () { client.stop(); process.stderr.write("0.2.0 Structured Output smoke test timed out.\n"); process.exitCode = 1; }, 120000);
  try {
    var snapshot = { aeVersion: "24.0", projectName: "Schema Test", activeComp: { name: "Main", width: 1920, height: 1080, duration: 10, frameRate: 30, time: 0, numLayers: 0, selectedLayers: [], layers: [] }, effectCatalogHint: [{ displayName: "Fast Box Blur", matchName: "ADBE Box Blur2" }] };
    var userText = "Create one editable circle in the center of the active composition.";
    var prompt = protocol.buildPrompt(userText, snapshot, "$ae-dev $auto-motion");
    var skillItems = [
      { type: "skill", name: "ae-dev", path: path.join(pluginRoot, "skills", "ae-dev", "SKILL.md") },
      { type: "skill", name: "auto-motion", path: path.join(pluginRoot, "tests", "fixtures", "skills", "auto-motion", "SKILL.md") }
    ];
    var response = protocol.validateForSnapshot(protocol.parseResult(await client.runTurn(prompt, skillItems, protocol.createOutputSchema([], userText))), snapshot);
    var createAction = response.actions.filter(function (action) { return action.op === "create_shape"; })[0];
    if (!createAction || createAction.shapeType !== "ellipse" || createAction.size[0] !== createAction.size[1]) {
      throw new Error("Expected a create_shape circle action, received: " + JSON.stringify(response));
    }
    console.log(JSON.stringify({ skillCount: skillItems.length, response: response }));
  } finally { clearTimeout(timeout); client.stop(); }
}

main().catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });

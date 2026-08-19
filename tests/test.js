"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var os = require("os");
var protocol = require("../js/protocol.js");
var cepBridge = require("../js/cep-bridge.js");
var SkillRegistry = require("../js/skill-registry.js").Registry;

function testAppServerCompatibility() {
  var source = fs.readFileSync(path.join(__dirname, "..", "js", "codex-client.js"), "utf8");
  assert.ok(source.indexOf('sandbox: "read-only"') >= 0);
  assert.ok(source.indexOf('sandboxPolicy: { type: "readOnly"') >= 0);
}

function testProtocol() {
  var parsed = protocol.parseResult(JSON.stringify({
    message: "Animate", actions: [{ op: "set_keyframes", target: "selected:0", property: "opacity", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }], easeInfluence: 72 }], needsConfirmation: false
  }));
  assert.strictEqual(parsed.actions[0].op, "set_keyframes");
  assert.throws(function () { protocol.parseResult("{}"); }, /does not match/);
  var prompt = protocol.buildPrompt("create", { activeComp: { name: "Main" } }, "$ae-dev $auto-motion");
  assert.ok(prompt.indexOf("$ae-dev $auto-motion") >= 0);
  assert.ok(prompt.indexOf("create_shape") >= 0);
  assert.ok(prompt.indexOf("create_solid") >= 0);
  assert.ok(prompt.indexOf("ADBE 4ColorGradient") >= 0);
  var schemaText = JSON.stringify(protocol.outputSchema);
  assert.strictEqual(schemaText.indexOf('"oneOf"'), -1);
  assert.strictEqual(schemaText.indexOf('"const"'), -1);
  ["create_solid", "create_shape", "add_mask", "add_effect", "set_effect_property", "duplicate_layers", "split_layer", "precompose_layers", "run_jsx"].forEach(function (op) {
    assert.ok(protocol.outputSchema.properties.actions.items.anyOf.some(function (schema) {
      return schema.properties && schema.properties.op && schema.properties.op.enum && schema.properties.op.enum[0] === op;
    }), op + " action missing");
  });
  var confirmed = protocol.parseResult(JSON.stringify({ message: "Run", actions: [{ op: "run_jsx", code: "1", reason: "test" }], needsConfirmation: false }));
  assert.strictEqual(confirmed.needsConfirmation, true);
  var circleSchema = protocol.createOutputSchema([], "Create a circle");
  assert.strictEqual(circleSchema.properties.actions.items.anyOf.length, 1);
  assert.strictEqual(circleSchema.properties.actions.items.anyOf[0].properties.op.enum[0], "create_shape");
  var complexOps = protocol.routedOperations("创建一个五边形，添加四色渐变和快速方框模糊并预合成");
  ["create_shape", "add_effect", "precompose_layers"].forEach(function (op) { assert.ok(complexOps.indexOf(op) >= 0); });
  assert.throws(function () {
    protocol.validateForSnapshot({ actions: [{ op: "set_property", target: "selected:0" }] }, { activeComp: { selectedLayers: [] } });
  }, /does not exist/);
}

function testCepPaths() {
  assert.strictEqual(cepBridge.normalizeSystemPath("file:///C:/Adobe/AE%20Codex", "Win32"), "C:/Adobe/AE Codex");
  assert.strictEqual(cepBridge.normalizeSystemPath("/C:/Adobe/AE", "Win32"), "C:/Adobe/AE");
  assert.strictEqual(cepBridge.normalizeSystemPath("file:///Users/me/AE%20Codex", "MacIntel"), "/Users/me/AE Codex");
}

function testSkillRegistry() {
  var fixtureRoot = path.join(__dirname, "fixtures", "skills");
  var registry = new SkillRegistry({ fs: fs, path: path, os: os, extensionRoot: path.join(__dirname, "fixtures"), extraRoots: [fixtureRoot], requiredAutoSkills: ["ae-dev"], activeSkillNames: ["auto-motion"] });
  registry.scan();
  assert.ok(registry.autoSkills().some(function (skill) { return skill.name === "ae-dev"; }));
  assert.ok(registry.autoSkills().some(function (skill) { return skill.name === "auto-motion"; }));
  assert.strictEqual(registry.inputItems().length, 2);
  assert.strictEqual(registry.actionSchemas().length, 1);
  var extendedSchema = protocol.createOutputSchema(registry.actionSchemas());
  assert.strictEqual(JSON.stringify(extendedSchema).indexOf('"oneOf"'), -1);
  assert.strictEqual(JSON.stringify(extendedSchema).indexOf('"const"'), -1);
}

function testHostOperations() {
  var source = fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8");
  ["create_solid", "create_shape", "add_mask", "add_effect", "set_effect_property", "duplicate_layers", "split_layer", "precompose_layers", "run_jsx"].forEach(function (op) {
    assert.ok(source.indexOf('registerOperation("' + op + '"') >= 0, "host missing " + op);
  });
  assert.ok(source.indexOf("effectCatalogHint") >= 0);
  assert.ok(source.indexOf("sourceSummary") >= 0);
}

testProtocol();
testCepPaths();
testSkillRegistry();
testAppServerCompatibility();
testHostOperations();
console.log("AE Codex Studio tests passed.");

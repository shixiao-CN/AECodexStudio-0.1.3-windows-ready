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
  assert.ok(source.indexOf('sandbox: "read-only"') >= 0, "thread/start must use legacy kebab-case sandbox mode");
  assert.ok(source.indexOf('sandboxPolicy: { type: "readOnly"') >= 0, "turn/start must use v2 camel-case sandbox policy type");
}

function testProtocol() {
  var parsed = protocol.parseResult(JSON.stringify({
    message: "Animate the title",
    actions: [{ op: "set_keyframes", target: "selected:0", property: "opacity", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }], easeInfluence: 72 }],
    needsConfirmation: false
  }));
  assert.strictEqual(parsed.actions.length, 1);
  assert.strictEqual(parsed.actions[0].op, "set_keyframes");
  assert.throws(function () { protocol.parseResult("{}"); }, /不符合/);

  var prompt = protocol.buildPrompt("淡入", { activeComp: { name: "Main" } }, "$ae-dev");
  assert.ok(prompt.indexOf("$ae-dev") >= 0);
  assert.ok(prompt.indexOf("CURRENT_AE_SNAPSHOT") >= 0);
  assert.ok(prompt.indexOf("create_ellipse") >= 0);
  assert.ok(prompt.indexOf("Creation requests must create a new layer") >= 0);

  var schemaText = JSON.stringify(protocol.outputSchema);
  assert.strictEqual(schemaText.indexOf('"oneOf"'), -1, "Structured Output schema must not contain oneOf");
  assert.strictEqual(schemaText.indexOf('"const"'), -1, "Structured Output schema must use enum instead of const");
  assert.ok(protocol.outputSchema.properties.actions.items.anyOf.some(function (schema) {
    return schema.properties && schema.properties.op && schema.properties.op.enum && schema.properties.op.enum[0] === "create_ellipse";
  }), "create_ellipse action must be exposed to Codex");

  var circleSchema = protocol.createOutputSchema([], "创建一个圆形");
  assert.strictEqual(circleSchema.properties.actions.items.anyOf.length, 1, "circle creation must only expose create_ellipse");
  assert.strictEqual(circleSchema.properties.actions.items.anyOf[0].properties.op.enum[0], "create_ellipse");
  assert.strictEqual(circleSchema.properties.actions.minItems, 1);
  assert.strictEqual(circleSchema.properties.actions.maxItems, 1);
}

function testCepPaths() {
  assert.strictEqual(cepBridge.normalizeSystemPath("file:///C:/Adobe/AE%20Codex", "Win32"), "C:/Adobe/AE Codex");
  assert.strictEqual(cepBridge.normalizeSystemPath("/C:/Adobe/AE", "Win32"), "C:/Adobe/AE");
  assert.strictEqual(cepBridge.normalizeSystemPath("file:///Users/me/AE%20Codex", "MacIntel"), "/Users/me/AE Codex");
  assert.strictEqual(cepBridge.normalizeSystemPath("C:\\Adobe\\AE", "Win32"), "C:\\Adobe\\AE");
}

function testSkillRegistry() {
  var fixtureRoot = path.join(__dirname, "fixtures", "skills");
  var registry = new SkillRegistry({
    fs: fs,
    path: path,
    os: os,
    extensionRoot: path.join(__dirname, "fixtures"),
    extraRoots: [fixtureRoot],
    requiredAutoSkills: ["ae-dev"]
  });
  var skills = registry.scan();
  assert.ok(skills.some(function (skill) { return skill.name === "ae-dev"; }));
  assert.ok(registry.autoSkills().some(function (skill) { return skill.name === "ae-dev"; }), "ae-dev must always auto invoke");
  assert.ok(registry.autoSkills().some(function (skill) { return skill.name === "auto-motion"; }));
  assert.ok(registry.inputItems().every(function (item) { return item.type === "skill" && /SKILL\.md$/.test(item.path); }));
  assert.strictEqual(registry.actionSchemas().length, 1);
  assert.strictEqual(registry.actionSchemas()[0].properties.op.const, "fixture_motion");
  var extendedSchema = protocol.createOutputSchema(registry.actionSchemas());
  assert.ok(extendedSchema.properties.actions.items.anyOf.length > protocol.outputSchema.properties.actions.items.anyOf.length);
  assert.strictEqual(JSON.stringify(extendedSchema).indexOf('"oneOf"'), -1, "skill schemas must be normalized for Structured Outputs");
  assert.strictEqual(JSON.stringify(extendedSchema).indexOf('"const"'), -1, "skill const values must be normalized to enum");
}

testProtocol();
testCepPaths();
testSkillRegistry();
testAppServerCompatibility();
assert.ok(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8").indexOf('registerOperation("create_ellipse"') >= 0);
console.log("AE Codex Studio tests passed.");

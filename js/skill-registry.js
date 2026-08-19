(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.AESkillRegistry = api; }
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function safeReadJson(fs, filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (err) { return {}; }
  }

  function unique(values) {
    var seen = {};
    return values.filter(function (value) {
      var key = String(value || "").toLowerCase();
      if (!key || seen[key]) { return false; }
      seen[key] = true;
      return true;
    });
  }

  function Registry(options) {
    this.fs = options.fs;
    this.path = options.path;
    this.os = options.os;
    this.extensionRoot = options.extensionRoot;
    this.extraRoots = options.extraRoots || [];
    this.requiredAutoSkills = options.requiredAutoSkills || ["ae-dev"];
    this.activeSkillNames = options.activeSkillNames || [];
    this.skills = [];
  }

  Registry.prototype.defaultRoots = function () {
    var home = this.os.homedir();
    return unique([
      this.path.join(home, ".agents", "skills"),
      this.path.join(home, ".codex", "skills"),
      this.path.join(this.extensionRoot, "skills")
    ].concat(this.extraRoots));
  };

  Registry.prototype.scan = function () {
    var fs = this.fs;
    var path = this.path;
    var found = {};
    var ordered = [];
    this.defaultRoots().forEach(function (rootDir) {
      if (!fs.existsSync(rootDir)) { return; }
      fs.readdirSync(rootDir, { withFileTypes: true }).forEach(function (entry) {
        if (!entry.isDirectory() || entry.name.charAt(0) === "_") { return; }
        var dir = path.join(rootDir, entry.name);
        var skillPath = path.join(dir, "SKILL.md");
        if (!fs.existsSync(skillPath)) { return; }
        var manifestPath = path.join(dir, "SKILL.json");
        var manifest = safeReadJson(fs, manifestPath);
        var name = manifest.name || entry.name;
        var key = name.toLowerCase();
        if (found[key]) { return; }
        var aeConfig = manifest.aeCodex || {};
        var skill = {
          name: name,
          displayName: (manifest.interface && manifest.interface.displayName) || name,
          description: (manifest.interface && manifest.interface.shortDescription) || "",
          path: skillPath,
          root: dir,
          enabled: manifest.enabled !== false,
          autoInvoke: aeConfig.autoInvoke === true,
          hostEntry: aeConfig.hostEntry ? path.resolve(dir, aeConfig.hostEntry) : null,
          actionSchemaPath: aeConfig.actionSchema ? path.resolve(dir, aeConfig.actionSchema) : null,
          actionSchemas: []
        };
        if (skill.actionSchemaPath && fs.existsSync(skill.actionSchemaPath)) {
          var loadedSchema = safeReadJson(fs, skill.actionSchemaPath);
          skill.actionSchemas = loadedSchema instanceof Array ? loadedSchema : [loadedSchema];
          skill.actionSchemas = skill.actionSchemas.filter(function (schema) { return schema && schema.type === "object"; });
        }
        found[key] = skill;
        ordered.push(skill);
      });
    });

    var required = this.requiredAutoSkills.concat(this.activeSkillNames).map(function (name) { return name.toLowerCase(); });
    ordered.forEach(function (skill) {
      if (required.indexOf(skill.name.toLowerCase()) !== -1) { skill.autoInvoke = true; }
    });
    this.skills = ordered.filter(function (skill) { return skill.enabled; });
    return this.skills.slice();
  };

  Registry.prototype.autoSkills = function () {
    return this.skills.filter(function (skill) { return skill.autoInvoke; });
  };

  Registry.prototype.isBezierPathRequest = function (userText) {
    var text = String(userText || "");
    var spatialPath = /(蒙版|遮罩|形状|轮廓|路径|曲面|波浪|描边|孔洞|开口|控制点|切线|顶点|mask|shape|silhouette|contour|path|s[ -]?curve|wave|vertex|tangent)/i.test(text);
    var genericCurve = /(曲线|curve|spline)/i.test(text);
    var bezier = /(贝塞尔|bezier|inTangents|outTangents)/i.test(text);
    var temporalOnly = /(贝塞尔缓动|速度图表|速度曲线|时间曲线|关键帧插值|temporal easing|speed graph)/i.test(text);
    if (temporalOnly && !spatialPath) { return false; }
    return spatialPath || genericCurve || bezier;
  };

  Registry.prototype.requestSkills = function (userText) {
    var selected = this.autoSkills().slice();
    var selectedNames = {};
    selected.forEach(function (skill) { selectedNames[skill.name.toLowerCase()] = true; });
    var conditionalNames = this.isBezierPathRequest(userText) ? ["ae-bezier-paths", "curves-and-paths"] : [];
    this.skills.forEach(function (skill) {
      var key = skill.name.toLowerCase();
      if (conditionalNames.indexOf(key) >= 0 && !selectedNames[key]) {
        selectedNames[key] = true;
        selected.push(skill);
      }
    });
    return selected;
  };

  Registry.prototype.inputItems = function (userText) {
    return this.requestSkills(userText).map(function (skill) {
      return { type: "skill", name: skill.name, path: skill.path };
    });
  };

  Registry.prototype.markers = function (userText) {
    return this.requestSkills(userText).map(function (skill) { return "$" + skill.name; }).join(" ");
  };

  Registry.prototype.hostModules = function (userText) {
    var fs = this.fs;
    return this.requestSkills(userText).filter(function (skill) {
      return skill.hostEntry && fs.existsSync(skill.hostEntry);
    });
  };

  Registry.prototype.actionSchemas = function (userText) {
    var result = [];
    this.requestSkills(userText).forEach(function (skill) {
      result = result.concat(skill.actionSchemas || []);
    });
    return result;
  };

  return { Registry: Registry };
}));

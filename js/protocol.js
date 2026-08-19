(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.AEProtocol = api; }
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var numberArray = { type: "array", items: { type: "number" }, minItems: 1, maxItems: 16 };
  var pointArray = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 3 };
  var colorArray = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 4 };
  var anyValue = { anyOf: [{ type: "number" }, { type: "string" }, { type: "boolean" }, numberArray] };
  var numberOrArray = { anyOf: [{ type: "number" }, numberArray] };
  var points = { type: "array", items: pointArray };
  var targetSchema = { type: "string", description: "selected:0, index:1, id:123, or name:Layer Name" };
  var targetsSchema = { type: "array", minItems: 1, items: targetSchema };
  var propertySchema = { type: "string", enum: ["position", "scale", "rotation", "opacity", "anchorPoint"] };
  var parameterSchema = {
    type: "object",
    properties: {
      path: { type: "array", minItems: 1, items: { type: "string" }, description: "Effect child property match-name/name path." },
      value: anyValue
    },
    required: ["path", "value"], additionalProperties: false
  };

  var actionSchemas = [
    {
      type: "object",
      properties: { op: { enum: ["set_property"] }, target: targetSchema, property: propertySchema, value: numberOrArray },
      required: ["op", "target", "property", "value"], additionalProperties: false
    },
    {
      type: "object",
      properties: {
        op: { enum: ["set_keyframes"] }, target: targetSchema, property: propertySchema,
        keyframes: { type: "array", minItems: 1, items: { type: "object", properties: { time: { type: "number" }, value: numberOrArray }, required: ["time", "value"], additionalProperties: false } },
        easeInfluence: { type: "number", minimum: 0.1, maximum: 100 }
      },
      required: ["op", "target", "property", "keyframes", "easeInfluence"], additionalProperties: false
    },
    {
      type: "object",
      properties: {
        op: { enum: ["create_text"] }, name: { type: "string" }, text: { type: "string" }, fontSize: { type: "number" },
        color: colorArray, position: pointArray
      },
      required: ["op", "name", "text", "fontSize", "color", "position"], additionalProperties: false
    },
    {
      type: "object",
      description: "Create a solid layer, normally comp-sized.",
      properties: {
        op: { enum: ["create_solid"] }, name: { type: "string" }, color: colorArray,
        width: { type: "number", minimum: 1 }, height: { type: "number", minimum: 1 },
        pixelAspect: { type: "number", minimum: 0.1 }, duration: { type: "number", minimum: 0.01 }, position: pointArray
      },
      required: ["op", "name", "color", "width", "height", "pixelAspect", "duration", "position"], additionalProperties: false
    },
    {
      type: "object",
      description: "Create any editable parametric shape or Bezier path. For path, vertices/tangents are required; for parametric shapes, provide harmless empty arrays.",
      properties: {
        op: { enum: ["create_shape"] }, name: { type: "string" },
        shapeType: { type: "string", enum: ["rectangle", "ellipse", "star", "polygon", "path"] },
        position: pointArray, size: pointArray,
        vertices: points, inTangents: points, outTangents: points, closed: { type: "boolean" },
        fillColor: colorArray, fillOpacity: { type: "number", minimum: 0, maximum: 100 },
        strokeColor: colorArray, strokeOpacity: { type: "number", minimum: 0, maximum: 100 }, strokeWidth: { type: "number", minimum: 0 },
        points: { type: "number", minimum: 2 }, innerRadius: { type: "number", minimum: 0 }, outerRadius: { type: "number", minimum: 0 },
        rotation: { type: "number" }, roundness: { type: "number", minimum: 0 }
      },
      required: ["op", "name", "shapeType", "position", "size", "vertices", "inTangents", "outTangents", "closed", "fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth", "points", "innerRadius", "outerRadius", "rotation", "roundness"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        op: { enum: ["add_mask"] }, target: targetSchema, name: { type: "string" },
        vertices: points, inTangents: points, outTangents: points, closed: { type: "boolean" },
        mode: { type: "string", enum: ["add", "subtract", "intersect", "lighten", "darken", "difference", "none"] },
        inverted: { type: "boolean" }, opacity: { type: "number", minimum: 0, maximum: 100 }, feather: pointArray, expansion: { type: "number" }
      },
      required: ["op", "target", "name", "vertices", "inTangents", "outTangents", "closed", "mode", "inverted", "opacity", "feather", "expansion"],
      additionalProperties: false
    },
    {
      type: "object",
      description: "Add any installed AE effect by match name, then set known child properties by match-name/name paths.",
      properties: { op: { enum: ["add_effect"] }, target: targetSchema, matchName: { type: "string" }, displayName: { type: "string" }, parameters: { type: "array", items: parameterSchema } },
      required: ["op", "target", "matchName", "displayName", "parameters"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["set_effect_property"] }, target: targetSchema, effect: { type: "string", description: "Effect match name or display name." }, path: { type: "array", minItems: 1, items: { type: "string" } }, value: anyValue },
      required: ["op", "target", "effect", "path", "value"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["set_expression"] }, target: targetSchema, property: propertySchema, expression: { type: "string" } },
      required: ["op", "target", "property", "expression"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["duplicate_layers"] }, targets: targetsSchema, copies: { type: "number", minimum: 1, maximum: 100 } },
      required: ["op", "targets", "copies"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["split_layer"] }, target: targetSchema, time: { type: "number" } },
      required: ["op", "target", "time"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["precompose_layers"] }, targets: targetsSchema, name: { type: "string" }, moveAllAttributes: { type: "boolean" } },
      required: ["op", "targets", "name", "moveAllAttributes"], additionalProperties: false
    },
    {
      type: "object",
      description: "Run arbitrary ExtendScript in AE. Always requires explicit user confirmation. The code runs inside the panel undo group and must not access files/network unless the user explicitly requested it.",
      properties: { op: { enum: ["run_jsx"] }, code: { type: "string" }, reason: { type: "string" } },
      required: ["op", "code", "reason"], additionalProperties: false
    }
  ];

  function normalizeSchema(value) {
    if (value instanceof Array) { return value.map(function (item) { return normalizeSchema(item); }); }
    if (!value || typeof value !== "object") { return value; }
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (key === "oneOf") { result.anyOf = normalizeSchema(value[key]); }
      else if (key === "const") { result.enum = [normalizeSchema(value[key])]; }
      else { result[key] = normalizeSchema(value[key]); }
    });
    return result;
  }

  function operationName(schema) {
    var op = schema && schema.properties && schema.properties.op;
    if (!op) { return ""; }
    if (typeof op.const === "string") { return op.const; }
    if (op.enum instanceof Array && op.enum.length === 1) { return op.enum[0]; }
    return "";
  }

  function routedOperations(userText) {
    var text = String(userText || "");
    var createIntent = /(创建|新建|添加|画|绘制|create|add|draw)/i.test(text);
    if (!createIntent) { return null; }
    var allowed = [];
    if (/(形状|圆|椭圆|矩形|方形|多边形|五边形|六边形|星形|路径|贝塞尔|bezier|shape|circle|ellipse|rectangle|polygon|pentagon|star|path)/i.test(text)) { allowed.push("create_shape"); }
    if (/(纯色|固态|solid)/i.test(text)) { allowed.push("create_solid"); }
    if (/(文字|文本|标题|text|title)/i.test(text)) { allowed.push("create_text"); }
    if (/(蒙版|遮罩|mask)/i.test(text)) { allowed.push("add_mask"); }
    if (/(效果|特效|模糊|渐变|effect|blur|gradient)/i.test(text)) { allowed.push("add_effect", "set_effect_property"); }
    if (/(预合成|预组|precomp|pre-compose|precompose)/i.test(text)) { allowed.push("precompose_layers"); }
    if (/(脚本|jsx|extendscript|script)/i.test(text)) { allowed.push("run_jsx"); }
    return allowed.length ? allowed : null;
  }

  function createOutputSchema(extraActionSchemas, userText) {
    var schemas = actionSchemas.concat(extraActionSchemas || []);
    var allowed = routedOperations(userText);
    if (allowed) {
      schemas = schemas.filter(function (schema) { return allowed.indexOf(operationName(schema)) >= 0; });
    }
    var actions = { type: "array", maxItems: 32, items: { anyOf: normalizeSchema(schemas) } };
    if (allowed) { actions.minItems = 1; }
    return {
      type: "object",
      properties: {
        message: { type: "string" },
        actions: actions,
        needsConfirmation: { type: "boolean" }
      },
      required: ["message", "actions", "needsConfirmation"], additionalProperties: false
    };
  }

  function actionRequiresConfirmation(action) {
    return !!action && (action.op === "run_jsx" || action.op === "precompose_layers");
  }

  function resultRequiresConfirmation(result) {
    if (!result || !result.actions) { return false; }
    for (var i = 0; i < result.actions.length; i += 1) {
      if (actionRequiresConfirmation(result.actions[i])) { return true; }
    }
    return false;
  }

  function buildPrompt(userText, snapshot, markers) {
    return [
      markers || "$ae-dev",
      "You control After Effects through structured actions. Follow every loaded skill on every turn.",
      "Inspect CURRENT_AE_SNAPSHOT before acting. Use AE match names, seconds, normalized RGB(A), and editable layers.",
      "RGB(A) color channels use 0..1, but opacity fields use percentages 0..100; use 100 for fully visible fills, strokes and masks.",
      "Use create_shape for rectangles, ellipses, stars, polygons and arbitrary Bezier paths. Equal ellipse dimensions make a circle.",
      "Use create_solid for solid layers; normally copy width, height, pixelAspect and duration from the active composition.",
      "Use add_mask for masks. Tangents are relative to vertices and arrays must have matching lengths.",
      "Use add_effect with an installed effect matchName. Only set effect child paths present in the snapshot; otherwise add it with an empty parameters list so the next snapshot can reveal its properties.",
      "Common installed effects: 4-Color Gradient is ADBE 4ColorGradient; Fast Box Blur is ADBE Box Blur2.",
      "AE 2024 4-Color Gradient paths: points are ADBE 4ColorGradient-0001/0003/0005/0007 and colors are ADBE 4ColorGradient-0002/0004/0006/0008. Fast Box Blur radius is ADBE Box Blur2-0001, iterations 0002, direction 0003, repeat-edge 0004.",
      "Use run_jsx only when registered actions cannot express the request. It always requires confirmation; do not access files, network, shell or save projects unless explicitly asked.",
      "Use selected:N only for an existing zero-based selected layer. Preserve current work and set needsConfirmation for run_jsx and precomposition.",
      "Return only the requested structured result. If required data is unavailable, explain and return no actions.",
      "\nCURRENT_AE_SNAPSHOT\n" + JSON.stringify(snapshot),
      "\nUSER_REQUEST\n" + userText
    ].join("\n");
  }

  function parseResult(value) {
    var result = value;
    if (typeof result === "string") {
      var text = result.trim();
      var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) { text = fenced[1].trim(); }
      result = JSON.parse(text);
    }
    if (!result || typeof result.message !== "string" || !Array.isArray(result.actions) || typeof result.needsConfirmation !== "boolean") {
      throw new Error("Codex returned data that does not match the AE action protocol.\n" + String(value));
    }
    if (resultRequiresConfirmation(result)) { result.needsConfirmation = true; }
    return result;
  }

  function validateForSnapshot(result, snapshot) {
    var selected = snapshot && snapshot.activeComp && snapshot.activeComp.selectedLayers ? snapshot.activeComp.selectedLayers : [];
    function checkTarget(target) {
      if (typeof target !== "string" || target.indexOf("selected:") !== 0) { return; }
      var index = parseInt(target.substring(9), 10);
      if (isNaN(index) || index < 0 || index >= selected.length) { throw new Error("Codex targeted a selected layer that does not exist: " + target); }
    }
    for (var i = 0; i < result.actions.length; i += 1) {
      checkTarget(result.actions[i].target);
      var targets = result.actions[i].targets || [];
      for (var j = 0; j < targets.length; j += 1) { checkTarget(targets[j]); }
    }
    return result;
  }

  return {
    outputSchema: createOutputSchema([]), createOutputSchema: createOutputSchema, buildPrompt: buildPrompt,
    parseResult: parseResult, actionRequiresConfirmation: actionRequiresConfirmation,
    resultRequiresConfirmation: resultRequiresConfirmation, operationName: operationName,
    routedOperations: routedOperations, validateForSnapshot: validateForSnapshot
  };
}));

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.AEProtocol = api; }
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var numberOrArray = {
    anyOf: [
      { type: "number" },
      { type: "array", items: { type: "number" }, minItems: 1, maxItems: 4 }
    ]
  };

  var targetSchema = { type: "string", description: "selected:0, index:1, or name:Layer Name" };
  var propertySchema = { type: "string", enum: ["position", "scale", "rotation", "opacity", "anchorPoint"] };

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
        color: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        position: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 3 }
      },
      required: ["op", "name", "text", "fontSize", "color", "position"], additionalProperties: false
    },
    {
      type: "object",
      properties: {
        op: { enum: ["create_rectangle"] }, name: { type: "string" },
        size: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        color: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        position: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 3 },
        roundness: { type: "number" }
      },
      required: ["op", "name", "size", "color", "position", "roundness"], additionalProperties: false
    },
    {
      type: "object",
      properties: {
        op: { enum: ["create_ellipse"] }, name: { type: "string" },
        size: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "Ellipse width and height in pixels; use equal values for a circle." },
        color: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        position: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 3 }
      },
      required: ["op", "name", "size", "color", "position"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["set_expression"] }, target: targetSchema, property: propertySchema, expression: { type: "string" } },
      required: ["op", "target", "property", "expression"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["rename_selected"] }, name: { type: "string" } },
      required: ["op", "name"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["duplicate_selected"] } },
      required: ["op"], additionalProperties: false
    },
    {
      type: "object",
      properties: { op: { enum: ["precompose_selected"] }, name: { type: "string" }, moveAllAttributes: { type: "boolean" } },
      required: ["op", "name", "moveAllAttributes"], additionalProperties: false
    }
  ];

  function normalizeSchema(value) {
    if (value instanceof Array) {
      return value.map(function (item) { return normalizeSchema(item); });
    }
    if (!value || typeof value !== "object") { return value; }
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (key === "oneOf") { result.anyOf = normalizeSchema(value[key]); }
      else if (key === "const") { result.enum = [normalizeSchema(value[key])]; }
      else { result[key] = normalizeSchema(value[key]); }
    });
    return result;
  }

  function isCircleCreationRequest(userText) {
    var text = String(userText || "");
    return /(创建|新建|添加|画|绘制)[^\n]{0,16}(圆形|圆|circle)|(?:create|add|draw)[^\n]{0,24}circle/i.test(text);
  }

  function operationName(schema) {
    var op = schema && schema.properties && schema.properties.op;
    if (!op) { return ""; }
    if (typeof op.const === "string") { return op.const; }
    if (op.enum instanceof Array && op.enum.length === 1) { return op.enum[0]; }
    return "";
  }

  function createOutputSchema(extraActionSchemas, userText) {
    var requestedSchemas = actionSchemas.concat(extraActionSchemas || []);
    var circleCreation = isCircleCreationRequest(userText);
    if (circleCreation) {
      requestedSchemas = requestedSchemas.filter(function (schema) { return operationName(schema) === "create_ellipse"; });
    }
    var supportedActions = normalizeSchema(requestedSchemas);
    var actions = { type: "array", items: { anyOf: supportedActions } };
    if (circleCreation) { actions.minItems = 1; actions.maxItems = 1; }
    return {
      type: "object",
      properties: {
        message: { type: "string" },
        actions: actions,
        needsConfirmation: { type: "boolean" }
      },
      required: ["message", "actions", "needsConfirmation"],
      additionalProperties: false
    };
  }

  var outputSchema = createOutputSchema([]);

  function buildPrompt(userText, snapshot, markers) {
    return [
      markers || "$ae-dev",
      "You are controlling Adobe After Effects through a restricted structured-action bridge.",
      "Follow the ae-dev skill on every turn. Do not run shell commands, edit files, or emit JSX.",
      "Return only the requested structured result. Use AE times in seconds and RGB colors in the 0..1 range.",
      "Use selected:N with a zero-based N to target the current selection. Preserve existing work.",
      "Creation requests must create a new layer; never satisfy create/add/draw requests by changing an existing selected layer.",
      "For a circle, return exactly one create_ellipse action with equal width and height values, positioned inside the active composition.",
      "Only use selected:N when CURRENT_AE_SNAPSHOT.activeComp.selectedLayers contains that zero-based selection.",
      "Set needsConfirmation=true for precomposition or any operation that materially restructures layers.",
      "If the request is ambiguous or unsupported, explain it in message and return an empty actions array.",
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
      throw new Error("Codex 返回的数据不符合 AE 动作协议。\n" + String(value));
    }
    return result;
  }

  return { outputSchema: outputSchema, createOutputSchema: createOutputSchema, buildPrompt: buildPrompt, parseResult: parseResult };
}));

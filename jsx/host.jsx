/* AE Codex Studio host bridge.
   All project mutations are registered operations, logged before execution,
   and grouped into one After Effects undo step. ExtendScript-safe ES3 syntax. */
var AECodex = AECodex || {};

(function (api) {
    var VERSION = "0.2.0";
    var operations = {};
    var loadedSkillModules = {};
    var logFolder = new Folder(Folder.userData.fsName + "/AECodexPanel");
    var logFile = new File(logFolder.fsName + "/ae-codex.log");

    function ensureLogFolder() {
        if (!logFolder.exists) {
            logFolder.create();
        }
    }

    function writeLog(message) {
        try {
            ensureLogFolder();
            logFile.encoding = "UTF-8";
            if (logFile.open("a")) {
                logFile.writeln(new Date().toUTCString() + " | " + message);
                logFile.close();
            }
        } catch (err) {
        }
    }

    function stringify(value) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(value);
        }
        if (value === null) { return "null"; }
        if (typeof value === "string") { return "\"" + value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n") + "\""; }
        if (typeof value === "number" || typeof value === "boolean") { return String(value); }
        if (value instanceof Array) {
            var arrayParts = [];
            for (var i = 0; i < value.length; i += 1) { arrayParts.push(stringify(value[i])); }
            return "[" + arrayParts.join(",") + "]";
        }
        var objectParts = [];
        for (var key in value) {
            if (value.hasOwnProperty(key)) { objectParts.push(stringify(key) + ":" + stringify(value[key])); }
        }
        return "{" + objectParts.join(",") + "}";
    }

    function ok(data) { return stringify({ ok: true, data: data }); }
    function fail(error) {
        var message = error && error.toString ? error.toString() : String(error);
        var line = error && error.line ? " line " + error.line : "";
        writeLog("ERROR | " + message + line);
        return stringify({ ok: false, error: message + line });
    }

    function parseEncoded(encoded) {
        var text = decodeURIComponent(encoded);
        if (typeof JSON === "undefined" || !JSON.parse) { throw new Error("This After Effects version does not provide JSON.parse."); }
        return JSON.parse(text);
    }

    function prop(parent, matchName) {
        if (!parent) { return null; }
        try { return parent.property(matchName); } catch (err) { return null; }
    }

    function requireProp(parent, matchName, label) {
        var value = prop(parent, matchName);
        if (!value) { throw new Error("Missing property " + (label || matchName) + " / " + matchName); }
        return value;
    }

    function xform(layer, matchName) {
        return requireProp(requireProp(layer, "ADBE Transform Group", "Transform"), matchName, matchName);
    }

    function activeComp() {
        if (!app.project) { throw new Error("No After Effects project is open."); }
        var item = app.project.activeItem;
        if (!item || !(item instanceof CompItem)) { throw new Error("Open or select a composition first."); }
        return item;
    }

    function copyValue(value) {
        if (value instanceof Array) {
            var result = [];
            for (var i = 0; i < value.length; i += 1) { result.push(value[i]); }
            return result;
        }
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") { return value; }
        return null;
    }

    function color3(value) {
        return value && value.length >= 3 ? [value[0], value[1], value[2]] : [1, 1, 1];
    }

    function zeroTangents(vertices) {
        var result = [];
        for (var i = 0; i < vertices.length; i += 1) { result.push([0, 0]); }
        return result;
    }

    function makeShape(vertices, inTangents, outTangents, closed) {
        if (!(vertices instanceof Array) || vertices.length < 2) { throw new Error("A Bezier path needs at least two vertices."); }
        var incoming = inTangents instanceof Array && inTangents.length === vertices.length ? inTangents : zeroTangents(vertices);
        var outgoing = outTangents instanceof Array && outTangents.length === vertices.length ? outTangents : zeroTangents(vertices);
        var shape = new Shape();
        shape.vertices = vertices;
        shape.inTangents = incoming;
        shape.outTangents = outgoing;
        shape.closed = closed !== false;
        return shape;
    }

    function propertyByToken(parent, token) {
        if (!parent) { return null; }
        var candidate = null;
        if (/^\d+$/.test(String(token))) {
            try { candidate = parent.property(parseInt(token, 10)); } catch (indexErr) {}
            if (candidate) { return candidate; }
        }
        try { candidate = parent.property(token); } catch (directErr) {}
        if (candidate) { return candidate; }
        try {
            for (var i = 1; i <= parent.numProperties; i += 1) {
                candidate = parent.property(i);
                if (candidate && (candidate.matchName === token || candidate.name === token)) { return candidate; }
            }
        } catch (scanErr) {}
        return null;
    }

    function resolvePropertyPath(parent, path, label) {
        var current = parent;
        for (var i = 0; i < path.length; i += 1) {
            current = propertyByToken(current, path[i]);
            if (!current) { throw new Error("Missing " + label + " property path: " + path.join(" > ")) ; }
        }
        return current;
    }

    function summarizeProperty(propertyObject, depth, budget) {
        if (!propertyObject || budget.count >= budget.max) { return null; }
        budget.count += 1;
        var summary = { name: propertyObject.name, matchName: propertyObject.matchName, propertyType: propertyObject.propertyType, valueType: propertyObject.propertyValueType };
        try {
            if (propertyObject.propertyType === PropertyType.PROPERTY) {
                if (propertyObject.propertyValueType === PropertyValueType.SHAPE) {
                    var pathValue = propertyObject.value;
                    summary.value = { vertices: pathValue.vertices, inTangents: pathValue.inTangents, outTangents: pathValue.outTangents, closed: pathValue.closed };
                } else {
                    summary.value = copyValue(propertyObject.value);
                }
                summary.numKeys = propertyObject.numKeys;
                summary.expressionEnabled = propertyObject.expressionEnabled;
            }
        } catch (valueErr) {}
        if (depth > 0 && propertyObject.numProperties) {
            summary.children = [];
            for (var i = 1; i <= propertyObject.numProperties && budget.count < budget.max; i += 1) {
                var child = summarizeProperty(propertyObject.property(i), depth - 1, budget);
                if (child) { summary.children.push(child); }
            }
        }
        return summary;
    }

    function sourceSummary(layer) {
        var source = null;
        try { source = layer.source; } catch (err) {}
        if (!source) { return null; }
        var summary = { name: source.name, typeName: source.typeName || "", width: source.width || null, height: source.height || null, duration: source.duration || null, pixelAspect: source.pixelAspect || null };
        try {
            if (source.mainSource) {
                summary.alpha = {
                    hasAlpha: !!source.mainSource.hasAlpha,
                    alphaMode: String(source.mainSource.alphaMode),
                    premulColor: copyValue(source.mainSource.premulColor)
                };
                if (source.mainSource.color) { summary.solidColor = copyValue(source.mainSource.color); }
            }
        } catch (sourceErr) {}
        return summary;
    }

    function textSummary(layer) {
        try {
            if (!(layer instanceof TextLayer)) { return null; }
            var documentValue = requireProp(requireProp(layer, "ADBE Text Properties", "Text"), "ADBE Text Document", "Source Text").value;
            return { text: documentValue.text, font: documentValue.font, fontSize: documentValue.fontSize, fillColor: copyValue(documentValue.fillColor), strokeColor: copyValue(documentValue.strokeColor), applyFill: documentValue.applyFill, applyStroke: documentValue.applyStroke };
        } catch (err) { return null; }
    }

    function layerDetails(layer) {
        var budget = { count: 0, max: 180 };
        var effects = summarizeProperty(prop(layer, "ADBE Effect Parade"), 3, budget);
        var masks = summarizeProperty(prop(layer, "ADBE Mask Parade"), 3, budget);
        var contents = summarizeProperty(prop(layer, "ADBE Root Vectors Group"), 4, budget);
        return {
            source: sourceSummary(layer), text: textSummary(layer), effects: effects, masks: masks, contents: contents,
            alpha: {
                opacity: propertySummary(xform(layer, "ADBE Opacity")),
                blendingMode: String(layer.blendingMode), trackMatteType: String(layer.trackMatteType),
                preserveTransparency: !!layer.preserveTransparency
            }
        };
    }

    function propertySummary(propertyObject) {
        var summary = { value: null, numKeys: 0, expressionEnabled: false };
        if (!propertyObject) { return summary; }
        try { summary.value = copyValue(propertyObject.value); } catch (err) {}
        try { summary.numKeys = propertyObject.numKeys; } catch (err2) {}
        try { summary.expressionEnabled = propertyObject.expressionEnabled; } catch (err3) {}
        return summary;
    }

    function layerKind(layer) {
        try { if (layer instanceof TextLayer) { return "text"; } } catch (err) {}
        try { if (layer instanceof ShapeLayer) { return "shape"; } } catch (err2) {}
        try { if (layer instanceof CameraLayer) { return "camera"; } } catch (err3) {}
        try { if (layer instanceof LightLayer) { return "light"; } } catch (err4) {}
        if (layer.nullLayer) { return "null"; }
        return "av";
    }

    function summarizeLayer(layer, includeDetails) {
        var summary = {
            index: layer.index,
            id: layer.id || null,
            name: layer.name,
            kind: layerKind(layer),
            locked: layer.locked,
            enabled: layer.enabled,
            threeDLayer: !!layer.threeDLayer,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            transform: {
                position: propertySummary(xform(layer, "ADBE Position")),
                scale: propertySummary(xform(layer, "ADBE Scale")),
                rotation: propertySummary(xform(layer, "ADBE Rotate Z")),
                opacity: propertySummary(xform(layer, "ADBE Opacity")),
                anchorPoint: propertySummary(xform(layer, "ADBE Anchor Point"))
            }
        };
        if (includeDetails) { summary.details = layerDetails(layer); }
        return summary;
    }

    function inspectData() {
        var data = {
            aeVersion: app.version,
            projectName: app.project && app.project.file ? app.project.file.name : "Untitled Project",
            projectPath: app.project && app.project.file ? app.project.file.fsName : null,
            activeComp: null
        };
        if (!app.project || !app.project.activeItem || !(app.project.activeItem instanceof CompItem)) { return data; }
        var comp = app.project.activeItem;
        var selected = [];
        for (var i = 0; i < comp.selectedLayers.length; i += 1) { selected.push(summarizeLayer(comp.selectedLayers[i], true)); }
        var layers = [];
        for (var j = 1; j <= comp.numLayers && j <= 100; j += 1) { layers.push(summarizeLayer(comp.layer(j), false)); }
        data.activeComp = {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            duration: comp.duration,
            frameRate: comp.frameRate,
            time: comp.time,
            numLayers: comp.numLayers,
            selectedLayers: selected,
            layers: layers
        };
        data.effectCatalogHint = [
            { displayName: "4-Color Gradient", matchName: "ADBE 4ColorGradient" },
            { displayName: "Fast Box Blur", matchName: "ADBE Box Blur2" },
            { displayName: "Gaussian Blur", matchName: "ADBE Gaussian Blur 2" },
            { displayName: "Fill", matchName: "ADBE Fill" },
            { displayName: "Gradient Ramp", matchName: "ADBE Ramp" }
        ];
        return data;
    }

    function resolveLayer(comp, target) {
        if (!target || typeof target !== "string") { throw new Error("Layer target is required."); }
        var separator = target.indexOf(":");
        if (separator < 0) { throw new Error("Invalid layer target: " + target); }
        var type = target.substring(0, separator);
        var value = target.substring(separator + 1);
        var layer = null;
        if (type === "selected") {
            var selectedIndex = parseInt(value, 10);
            if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= comp.selectedLayers.length) { throw new Error("Selected layer not found: " + target); }
            layer = comp.selectedLayers[selectedIndex];
        } else if (type === "index") {
            var layerIndex = parseInt(value, 10);
            if (isNaN(layerIndex) || layerIndex < 1 || layerIndex > comp.numLayers) { throw new Error("Layer index not found: " + target); }
            layer = comp.layer(layerIndex);
        } else if (type === "id") {
            var wantedId = parseInt(value, 10);
            for (var idIndex = 1; idIndex <= comp.numLayers; idIndex += 1) {
                if (comp.layer(idIndex).id === wantedId) { layer = comp.layer(idIndex); break; }
            }
        } else if (type === "name") {
            for (var i = 1; i <= comp.numLayers; i += 1) {
                if (comp.layer(i).name === value) { layer = comp.layer(i); break; }
            }
        }
        if (!layer) { throw new Error("Layer target not found: " + target); }
        if (layer.locked) { throw new Error("Layer is locked: " + layer.name); }
        return layer;
    }

    function propertyFor(layer, name) {
        var map = {
            position: "ADBE Position",
            scale: "ADBE Scale",
            rotation: "ADBE Rotate Z",
            opacity: "ADBE Opacity",
            anchorPoint: "ADBE Anchor Point"
        };
        if (!map[name]) { throw new Error("Unsupported property: " + name); }
        return xform(layer, map[name]);
    }

    function easeArray(propertyObject, influence) {
        var dimensions = 1;
        try {
            var value = propertyObject.value;
            if (value instanceof Array) { dimensions = value.length; }
        } catch (err) { dimensions = 1; }
        var result = [];
        for (var i = 0; i < dimensions; i += 1) { result.push(new KeyframeEase(0, influence)); }
        return result;
    }

    function easeAllKeys(propertyObject, influence) {
        var ease = easeArray(propertyObject, influence);
        for (var i = 1; i <= propertyObject.numKeys; i += 1) {
            propertyObject.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            propertyObject.setTemporalEaseAtKey(i, ease, ease);
        }
    }

    function resolveTargets(comp, targets) {
        var result = [];
        var seen = {};
        for (var i = 0; i < targets.length; i += 1) {
            var layer = resolveLayer(comp, targets[i]);
            if (!seen[layer.index]) { seen[layer.index] = true; result.push(layer); }
        }
        return result;
    }

    function maskMode(value) {
        var map = {
            add: MaskMode.ADD, subtract: MaskMode.SUBTRACT, intersect: MaskMode.INTERSECT,
            lighten: MaskMode.LIGHTEN, darken: MaskMode.DARKEN, difference: MaskMode.DIFFERENCE, none: MaskMode.NONE
        };
        return map[value] || MaskMode.ADD;
    }

    function findEffect(layer, token) {
        var parade = requireProp(layer, "ADBE Effect Parade", "Effects");
        for (var i = 1; i <= parade.numProperties; i += 1) {
            var effect = parade.property(i);
            if (effect.matchName === token || effect.name === token) { return effect; }
        }
        return null;
    }

    function setEffectParameter(effect, parameter) {
        var propertyObject = resolvePropertyPath(effect, parameter.path, "effect");
        if (propertyObject.propertyType !== PropertyType.PROPERTY) { throw new Error("Effect path is not a value property: " + parameter.path.join(" > ")); }
        propertyObject.setValue(parameter.value);
    }

    function registerCoreOperations() {
        api.registerOperation("set_property", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var propertyObject = propertyFor(layer, action.property);
            if (propertyObject.numKeys > 0) { throw new Error(action.property + " already has keyframes; use set_keyframes."); }
            propertyObject.setValue(action.value);
            return { layer: layer.name, property: action.property };
        });

        api.registerOperation("set_keyframes", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var propertyObject = propertyFor(layer, action.property);
            for (var i = 0; i < action.keyframes.length; i += 1) {
                propertyObject.setValueAtTime(action.keyframes[i].time, action.keyframes[i].value);
            }
            easeAllKeys(propertyObject, action.easeInfluence || 72);
            return { layer: layer.name, property: action.property, keys: action.keyframes.length };
        });

        api.registerOperation("create_text", function (action, comp) {
            var layer = comp.layers.addText(action.text);
            layer.name = action.name;
            var source = requireProp(requireProp(layer, "ADBE Text Properties", "Text"), "ADBE Text Document", "Source Text");
            var documentValue = source.value;
            documentValue.fontSize = action.fontSize;
            documentValue.fillColor = action.color;
            documentValue.applyFill = true;
            documentValue.applyStroke = false;
            source.setValue(documentValue);
            xform(layer, "ADBE Position").setValue(action.position);
            layer.motionBlur = true;
            return { layer: layer.name, index: layer.index };
        });

        api.registerOperation("create_solid", function (action, comp) {
            var layer = comp.layers.addSolid(color3(action.color), action.name, Math.round(action.width), Math.round(action.height), action.pixelAspect, action.duration);
            xform(layer, "ADBE Position").setValue(action.position);
            return { layer: layer.name, index: layer.index, sourceColor: color3(action.color) };
        });

        api.registerOperation("create_shape", function (action, comp) {
            var layer = comp.layers.addShape();
            layer.name = action.name;
            var root = requireProp(layer, "ADBE Root Vectors Group", "Contents");
            var group = root.addProperty("ADBE Vector Group");
            group.name = action.name + " Path";
            var vectors = requireProp(group, "ADBE Vectors Group", "Group Contents");
            var shapeProperty;
            if (action.shapeType === "rectangle") {
                shapeProperty = vectors.addProperty("ADBE Vector Shape - Rect");
                requireProp(shapeProperty, "ADBE Vector Rect Size", "Rectangle Size").setValue(action.size);
                requireProp(shapeProperty, "ADBE Vector Rect Roundness", "Rectangle Roundness").setValue(action.roundness || 0);
            } else if (action.shapeType === "ellipse") {
                shapeProperty = vectors.addProperty("ADBE Vector Shape - Ellipse");
                requireProp(shapeProperty, "ADBE Vector Ellipse Size", "Ellipse Size").setValue(action.size);
            } else if (action.shapeType === "star" || action.shapeType === "polygon") {
                shapeProperty = vectors.addProperty("ADBE Vector Shape - Star");
                requireProp(shapeProperty, "ADBE Vector Star Type", "Polystar Type").setValue(action.shapeType === "polygon" ? 2 : 1);
                requireProp(shapeProperty, "ADBE Vector Star Points", "Points").setValue(action.points);
                requireProp(shapeProperty, "ADBE Vector Star Outer Radius", "Outer Radius").setValue(action.outerRadius);
                if (action.shapeType === "star") {
                    requireProp(shapeProperty, "ADBE Vector Star Inner Radius", "Inner Radius").setValue(action.innerRadius);
                }
                requireProp(shapeProperty, "ADBE Vector Star Rotation", "Rotation").setValue(action.rotation);
            } else if (action.shapeType === "path") {
                shapeProperty = vectors.addProperty("ADBE Vector Shape - Group");
                requireProp(shapeProperty, "ADBE Vector Shape", "Path").setValue(makeShape(action.vertices, action.inTangents, action.outTangents, action.closed));
            } else {
                throw new Error("Unsupported shape type: " + action.shapeType);
            }
            if (action.fillOpacity > 0) {
                var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
                requireProp(fill, "ADBE Vector Fill Color", "Fill Color").setValue(color3(action.fillColor));
                requireProp(fill, "ADBE Vector Fill Opacity", "Fill Opacity").setValue(action.fillOpacity);
            }
            if (action.strokeWidth > 0 && action.strokeOpacity > 0) {
                var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
                requireProp(stroke, "ADBE Vector Stroke Color", "Stroke Color").setValue(color3(action.strokeColor));
                requireProp(stroke, "ADBE Vector Stroke Opacity", "Stroke Opacity").setValue(action.strokeOpacity);
                requireProp(stroke, "ADBE Vector Stroke Width", "Stroke Width").setValue(action.strokeWidth);
            }
            xform(layer, "ADBE Position").setValue(action.position);
            layer.motionBlur = true;
            return { layer: layer.name, index: layer.index, shapeType: action.shapeType };
        });

        api.registerOperation("add_mask", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var parade = requireProp(layer, "ADBE Mask Parade", "Masks");
            var mask = parade.addProperty("ADBE Mask Atom");
            mask.name = action.name;
            mask.maskMode = maskMode(action.mode);
            mask.inverted = action.inverted;
            requireProp(mask, "ADBE Mask Shape", "Mask Path").setValue(makeShape(action.vertices, action.inTangents, action.outTangents, action.closed));
            requireProp(mask, "ADBE Mask Opacity", "Mask Opacity").setValue(action.opacity);
            requireProp(mask, "ADBE Mask Feather", "Mask Feather").setValue(action.feather);
            requireProp(mask, "ADBE Mask Offset", "Mask Expansion").setValue(action.expansion);
            return { layer: layer.name, mask: mask.name };
        });

        api.registerOperation("add_effect", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var parade = requireProp(layer, "ADBE Effect Parade", "Effects");
            if (!parade.canAddProperty(action.matchName)) { throw new Error("Effect is not installed or cannot be added: " + action.matchName); }
            var effect = parade.addProperty(action.matchName);
            if (action.displayName) { effect.name = action.displayName; }
            for (var i = 0; i < action.parameters.length; i += 1) { setEffectParameter(effect, action.parameters[i]); }
            return { layer: layer.name, effect: effect.name, matchName: effect.matchName, properties: summarizeProperty(effect, 3, { count: 0, max: 120 }) };
        });

        api.registerOperation("set_effect_property", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var effect = findEffect(layer, action.effect);
            if (!effect) { throw new Error("Effect not found: " + action.effect); }
            setEffectParameter(effect, { path: action.path, value: action.value });
            return { layer: layer.name, effect: effect.name, path: action.path };
        });

        api.registerOperation("create_rectangle", function (action, comp) {
            var layer = comp.layers.addShape();
            layer.name = action.name;
            var root = requireProp(layer, "ADBE Root Vectors Group", "Contents");
            var group = root.addProperty("ADBE Vector Group");
            var vectors = requireProp(group, "ADBE Vectors Group", "Group Contents");
            var rect = vectors.addProperty("ADBE Vector Shape - Rect");
            requireProp(rect, "ADBE Vector Rect Size", "Rectangle Size").setValue(action.size);
            requireProp(rect, "ADBE Vector Rect Roundness", "Rectangle Roundness").setValue(action.roundness || 0);
            var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
            requireProp(fill, "ADBE Vector Fill Color", "Fill Color").setValue(action.color);
            xform(layer, "ADBE Position").setValue(action.position);
            layer.motionBlur = true;
            return { layer: layer.name, index: layer.index };
        });

        api.registerOperation("create_ellipse", function (action, comp) {
            var layer = comp.layers.addShape();
            layer.name = action.name;
            var root = requireProp(layer, "ADBE Root Vectors Group", "Contents");
            var group = root.addProperty("ADBE Vector Group");
            var vectors = requireProp(group, "ADBE Vectors Group", "Group Contents");
            var ellipse = vectors.addProperty("ADBE Vector Shape - Ellipse");
            requireProp(ellipse, "ADBE Vector Ellipse Size", "Ellipse Size").setValue(action.size);
            var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
            requireProp(fill, "ADBE Vector Fill Color", "Fill Color").setValue(action.color);
            xform(layer, "ADBE Position").setValue(action.position);
            layer.motionBlur = true;
            return { layer: layer.name, index: layer.index };
        });

        api.registerOperation("set_expression", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            var propertyObject = propertyFor(layer, action.property);
            if (!propertyObject.canSetExpression) { throw new Error("Property cannot accept an expression: " + action.property); }
            propertyObject.expression = action.expression;
            propertyObject.expressionEnabled = true;
            return { layer: layer.name, property: action.property };
        });

        api.registerOperation("rename_selected", function (action, comp) {
            if (comp.selectedLayers.length < 1) { throw new Error("Select at least one layer."); }
            for (var i = 0; i < comp.selectedLayers.length; i += 1) {
                comp.selectedLayers[i].name = comp.selectedLayers.length === 1 ? action.name : action.name + " " + (i + 1);
            }
            return { count: comp.selectedLayers.length };
        });

        api.registerOperation("duplicate_selected", function (action, comp) {
            if (comp.selectedLayers.length < 1) { throw new Error("Select at least one layer."); }
            var originals = [];
            for (var i = 0; i < comp.selectedLayers.length; i += 1) { originals.push(comp.selectedLayers[i]); }
            for (var j = 0; j < originals.length; j += 1) { originals[j].duplicate(); }
            return { count: originals.length };
        });

        api.registerOperation("precompose_selected", function (action, comp) {
            if (comp.selectedLayers.length < 1) { throw new Error("Select at least one layer."); }
            var indexes = [];
            for (var i = 0; i < comp.selectedLayers.length; i += 1) { indexes.push(comp.selectedLayers[i].index); }
            indexes.sort(function (a, b) { return a - b; });
            var newComp = comp.layers.precompose(indexes, action.name, action.moveAllAttributes !== false);
            return { comp: newComp.name, count: indexes.length };
        });

        api.registerOperation("duplicate_layers", function (action, comp) {
            var originals = resolveTargets(comp, action.targets);
            var count = 0;
            for (var c = 0; c < action.copies; c += 1) {
                for (var i = 0; i < originals.length; i += 1) { originals[i].duplicate(); count += 1; }
            }
            return { sourceCount: originals.length, created: count };
        });

        api.registerOperation("split_layer", function (action, comp) {
            var layer = resolveLayer(comp, action.target);
            if (action.time <= layer.inPoint || action.time >= layer.outPoint) { throw new Error("Split time must be inside the layer range."); }
            var originalOut = layer.outPoint;
            var second = layer.duplicate();
            layer.outPoint = action.time;
            second.inPoint = action.time;
            second.outPoint = originalOut;
            second.name = layer.name + " Part 2";
            return { first: layer.name, second: second.name, time: action.time };
        });

        api.registerOperation("precompose_layers", function (action, comp) {
            var layers = resolveTargets(comp, action.targets);
            var indexes = [];
            for (var i = 0; i < layers.length; i += 1) { indexes.push(layers[i].index); }
            indexes.sort(function (a, b) { return a - b; });
            var newComp = comp.layers.precompose(indexes, action.name, action.moveAllAttributes !== false);
            return { comp: newComp.name, count: indexes.length };
        });

        api.registerOperation("run_jsx", function (action, comp) {
            writeLog("RUN JSX CONFIRMED | " + action.reason);
            var result = eval(action.code);
            return { reason: action.reason, result: copyValue(result) };
        });
    }

    api.registerOperation = function (name, handler) {
        if (!name || typeof handler !== "function") { throw new Error("Invalid AE skill operation registration."); }
        if (operations[name]) { throw new Error("AE operation is already registered: " + name); }
        operations[name] = handler;
    };

    api.ping = function () {
        try { return ok({ version: VERSION, aeVersion: app.version, logPath: logFile.fsName }); } catch (err) { return fail(err); }
    };

    api.inspect = function () {
        try { return ok(inspectData()); } catch (err) { return fail(err); }
    };

    api.executeBatchEncoded = function (encoded) {
        var undoOpen = false;
        try {
            var actions = parseEncoded(encoded);
            if (!(actions instanceof Array) || actions.length < 1) { throw new Error("At least one AE action is required."); }
            var comp = activeComp();
            writeLog("BATCH START | " + stringify(actions));
            app.beginUndoGroup("AE Codex Studio");
            undoOpen = true;
            var results = [];
            for (var i = 0; i < actions.length; i += 1) {
                var action = actions[i];
                var handler = operations[action.op];
                if (!handler) { throw new Error("Unsupported AE operation: " + action.op); }
                writeLog("ACTION " + (i + 1) + " | " + stringify(action));
                results.push({ op: action.op, result: handler(action, comp) });
            }
            app.endUndoGroup();
            undoOpen = false;
            writeLog("BATCH COMPLETE | " + actions.length + " actions");
            return ok({ results: results, snapshot: inspectData(), logPath: logFile.fsName });
        } catch (err) {
            try { if (undoOpen) { app.endUndoGroup(); } } catch (endErr) {}
            return fail(err);
        }
    };

    api.loadSkillModuleEncoded = function (encoded) {
        try {
            var path = parseEncoded(encoded);
            if (typeof path !== "string" || !/\.(jsx|jsxinc)$/i.test(path)) { throw new Error("Skill host entry must be a .jsx or .jsxinc file."); }
            var file = new File(path);
            if (!file.exists) { throw new Error("Skill host module not found: " + path); }
            if (loadedSkillModules[file.fsName]) { return ok({ path: file.fsName, alreadyLoaded: true }); }
            writeLog("SKILL MODULE LOAD | " + file.fsName);
            $.evalFile(file);
            loadedSkillModules[file.fsName] = true;
            return ok({ path: file.fsName });
        } catch (err) { return fail(err); }
    };

    registerCoreOperations();
}(AECodex));

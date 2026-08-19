(function () {
    var logFile = new File(new File($.fileName).parent.fsName + "/dump-required-effects.log");
    var lines = [];
    function dump(effect) {
        lines.push("EFFECT|" + effect.name + "|" + effect.matchName);
        for (var i = 1; i <= effect.numProperties; i += 1) {
            var propertyObject = effect.property(i);
            var value = "";
            try { value = JSON.stringify(propertyObject.value); } catch (err) { value = "<unreadable>"; }
            lines.push("PROPERTY|" + i + "|" + propertyObject.name + "|" + propertyObject.matchName + "|" + propertyObject.propertyValueType + "|" + value);
        }
    }
    try {
        if (!app.project) { app.newProject(); }
        var comp = app.project.items.addComp("AE Codex Effect Probe", 640, 360, 1, 1, 30);
        var layer = comp.layers.addSolid([1,1,1], "Probe", 640, 360, 1, 1);
        var effects = layer.property("ADBE Effect Parade");
        dump(effects.addProperty("ADBE 4ColorGradient"));
        dump(effects.addProperty("ADBE Box Blur2"));
        comp.remove();
    } catch (err) {
        lines.push("ERROR|" + err.toString() + (err.line ? "|line=" + err.line : ""));
    }
    logFile.encoding = "UTF-8";
    if (logFile.open("w")) { logFile.write(lines.join("\n")); logFile.close(); }
}());

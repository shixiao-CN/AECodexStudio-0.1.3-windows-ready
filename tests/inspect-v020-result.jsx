(function () {
    var outFile = new File(new File($.fileName).parent.fsName + "/inspect-v020-result.log");
    var lines = [];
    for (var i = 1; app.project && i <= app.project.numItems; i += 1) {
        var item = app.project.item(i);
        if (!(item instanceof CompItem) || (item.name.indexOf("AE Codex 0.2.0 Host Smoke") < 0 && item.name.indexOf("Pentagon Precomp") < 0)) { continue; }
        lines.push("COMP|" + i + "|" + item.name + "|layers=" + item.numLayers);
        for (var j = 1; j <= item.numLayers; j += 1) {
            var layer = item.layer(j);
            lines.push("LAYER|" + j + "|" + layer.name);
            var effects = layer.property("ADBE Effect Parade");
            if (!effects) { continue; }
            for (var e = 1; e <= effects.numProperties; e += 1) {
                var effect = effects.property(e);
                lines.push("EFFECT|" + effect.matchName + "|" + effect.name);
                for (var p = 1; p <= effect.numProperties; p += 1) {
                    var propertyObject = effect.property(p);
                    var value = "";
                    try { value = JSON.stringify(propertyObject.value); } catch (err) { value = "<unreadable>"; }
                    lines.push("VALUE|" + propertyObject.matchName + "|" + value);
                }
            }
        }
    }
    outFile.encoding = "UTF-8";
    if (outFile.open("w")) { outFile.write(lines.join("\n")); outFile.close(); }
}());

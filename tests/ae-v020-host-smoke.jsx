(function () {
    var repoRoot = new Folder(new File($.fileName).parent.parent.fsName);
    var logFile = new File(repoRoot.fsName + "/tests/ae-v020-host-smoke.log");
    function log(message) {
        logFile.encoding = "UTF-8";
        if (logFile.open("a")) { logFile.writeln(new Date().toUTCString() + " | " + message); logFile.close(); }
    }
    function encode(value) { return encodeURIComponent(JSON.stringify(value)); }
    function run(actions) {
        var result = JSON.parse(AECodex.executeBatchEncoded(encode(actions)));
        if (!result.ok) { throw new Error(result.error); }
        return result.data;
    }
    app.beginUndoGroup("AE Codex 0.2.0 Host Smoke Setup");
    try {
        $.evalFile(new File(repoRoot.fsName + "/jsx/host.jsx"));
        if (!app.project) { app.newProject(); }
        var comp = app.project.items.addComp("AE Codex 0.2.0 Host Smoke", 1280, 720, 1, 6, 30);
        comp.openInViewer();
        app.endUndoGroup();

        run([
            { op: "create_shape", name: "Pentagon", shapeType: "polygon", position: [640, 360], size: [300, 300], vertices: [], inTangents: [], outTangents: [], closed: true, fillColor: [1, 0.2, 0.1], fillOpacity: 100, strokeColor: [1, 1, 1], strokeOpacity: 100, strokeWidth: 8, points: 5, innerRadius: 80, outerRadius: 180, rotation: 0, roundness: 0 },
            { op: "add_effect", target: "name:Pentagon", matchName: "ADBE 4ColorGradient", displayName: "4-Color Gradient", parameters: [
                { path: ["ADBE 4ColorGradient-0001"], value: [200,120] }, { path: ["ADBE 4ColorGradient-0002"], value: [1,0.2,0.1,1] },
                { path: ["ADBE 4ColorGradient-0003"], value: [1080,120] }, { path: ["ADBE 4ColorGradient-0004"], value: [0.1,0.9,1,1] },
                { path: ["ADBE 4ColorGradient-0005"], value: [200,600] }, { path: ["ADBE 4ColorGradient-0006"], value: [1,0.85,0.1,1] },
                { path: ["ADBE 4ColorGradient-0007"], value: [1080,600] }, { path: ["ADBE 4ColorGradient-0008"], value: [0.7,0.15,1,1] }
            ] },
            { op: "add_effect", target: "name:Pentagon", matchName: "ADBE Box Blur2", displayName: "Fast Box Blur", parameters: [
                { path: ["ADBE Box Blur2-0001"], value: 12 }, { path: ["ADBE Box Blur2-0002"], value: 3 }, { path: ["ADBE Box Blur2-0004"], value: 1 }
            ] },
            { op: "precompose_layers", targets: ["name:Pentagon"], name: "Pentagon Precomp", moveAllAttributes: true }
        ]);

        run([
            { op: "create_solid", name: "C Mask Solid", color: [0.1, 0.55, 1], width: 1280, height: 720, pixelAspect: 1, duration: 6, position: [640, 360] },
            { op: "add_mask", target: "name:C Mask Solid", name: "C Letter Mask", vertices: [[360,180],[760,180],[760,270],[500,270],[430,340],[430,380],[500,450],[760,450],[760,540],[360,540],[250,430],[250,290]], inTangents: [], outTangents: [], closed: true, mode: "add", inverted: false, opacity: 100, feather: [0,0], expansion: 0 }
        ]);

        var snapshot = JSON.parse(AECodex.inspect());
        if (!snapshot.ok) { throw new Error(snapshot.error); }
        var precomp = null;
        for (var itemIndex = app.project.numItems; itemIndex >= 1; itemIndex -= 1) {
            if (app.project.item(itemIndex) instanceof CompItem && app.project.item(itemIndex).name === "Pentagon Precomp") { precomp = app.project.item(itemIndex); break; }
        }
        if (!precomp || precomp.numLayers !== 1) { throw new Error("Pentagon precomp was not created correctly."); }
        var pentagon = precomp.layer(1);
        var star = pentagon.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property("ADBE Vector Shape - Star");
        if (!star || star.property("ADBE Vector Star Points").value !== 5) { throw new Error("Pentagon path is invalid."); }
        var effectParade = pentagon.property("ADBE Effect Parade");
        if (!effectParade.property("ADBE 4ColorGradient") || !effectParade.property("ADBE Box Blur2")) { throw new Error("Required effects are missing."); }
        if (effectParade.property("ADBE Box Blur2").property("ADBE Box Blur2-0001").value !== 12) { throw new Error("Fast Box Blur radius was not set."); }
        if (effectParade.property("ADBE 4ColorGradient").property("ADBE 4ColorGradient-0008").value[2] !== 1) { throw new Error("Fourth gradient color was not set."); }
        var solid = comp.layer("C Mask Solid");
        var mask = solid && solid.property("ADBE Mask Parade").property(1);
        if (!mask || mask.property("ADBE Mask Shape").value.vertices.length < 8) { throw new Error("C mask is invalid."); }
        log("PASS | layers=" + snapshot.data.activeComp.numLayers + " | pentagonPoints=5 | effects=ADBE 4ColorGradient,ADBE Box Blur2 | cMaskVertices=" + mask.property("ADBE Mask Shape").value.vertices.length + " | version=" + AECodex.ping());
    } catch (err) {
        try { app.endUndoGroup(); } catch (endErr) {}
        log("FAIL | " + err.toString() + (err.line ? " | line=" + err.line : ""));
        throw err;
    }
}());

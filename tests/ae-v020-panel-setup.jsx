(function () {
    var logFile = new File(new File($.fileName).parent.fsName + "/ae-v020-panel-setup.log");
    function log(message) { logFile.encoding = "UTF-8"; if (logFile.open("w")) { logFile.write(message); logFile.close(); } }
    app.beginUndoGroup("AE Codex 0.2.0 Panel Validation Setup");
    try {
        if (!app.project) { app.newProject(); }
        var comp = app.project.items.addComp("AE Codex 0.2.0 Panel Validation", 1920, 1080, 1, 8, 30);
        comp.openInViewer();
        log("READY|layers=" + comp.numLayers);
    } catch (err) {
        log("FAIL|" + err.toString() + (err.line ? "|line=" + err.line : ""));
        throw err;
    } finally { app.endUndoGroup(); }
}());

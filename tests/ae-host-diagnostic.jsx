/* Read-only AE host bridge diagnostic. */
(function () {
    var diagnosticFile = new File($.fileName);
    var pluginRoot = diagnosticFile.parent.parent;
    var HOST_PATH = pluginRoot.fsName + "/jsx/host.jsx";
    var LOG_PATH = diagnosticFile.parent.fsName + "/ae-host-diagnostic.log";

    function writeLine(message, append) {
        var file = new File(LOG_PATH);
        file.encoding = "UTF-8";
        if (!file.open(append ? "a" : "w")) { throw new Error("Could not open diagnostic log: " + LOG_PATH); }
        file.writeln(message);
        file.close();
    }

    try {
        writeLine("START AE Codex host diagnostic", false);
        var hostFile = new File(HOST_PATH);
        if (!hostFile.exists) { throw new Error("Host JSX not found: " + HOST_PATH); }
        $.evalFile(hostFile);
        writeLine("PING " + AECodex.ping(), true);
        writeLine("INSPECT " + AECodex.inspect(), true);
        writeLine("PASS", true);
    } catch (err) {
        try { writeLine("FAIL " + err.toString() + " line " + (err.line || "unknown"), true); } catch (logErr) {}
        throw err;
    }
}());

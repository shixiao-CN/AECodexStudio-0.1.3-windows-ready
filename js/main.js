(function () {
  "use strict";

  var bridge = new AECepBridge.Bridge();
  var nodeRequire = window.cep_node && window.cep_node.require ? window.cep_node.require : window.require;
  var fs = nodeRequire("fs");
  var path = nodeRequire("path");
  var os = nodeRequire("os");
  var childProcess = nodeRequire("child_process");
  var readline = nodeRequire("readline");
  var nodeProcess = window.cep_node && window.cep_node.process ? window.cep_node.process : window.process;
  var extensionRoot = bridge.getExtensionRoot();
  var client = null;
  var registry = null;
  var hostModulesReady = Promise.resolve();
  var pendingActions = null;
  var activeAssistantBody = null;

  var els = {
    chat: document.getElementById("chat"),
    prompt: document.getElementById("prompt"),
    send: document.getElementById("sendButton"),
    stop: document.getElementById("stopButton"),
    inspect: document.getElementById("inspectButton"),
    undo: document.getElementById("undoButton"),
    status: document.getElementById("connectionStatus"),
    skillSummary: document.getElementById("skillSummary"),
    autoExecute: document.getElementById("autoExecute"),
    pendingCard: document.getElementById("pendingCard"),
    pendingSummary: document.getElementById("pendingSummary"),
    executeActions: document.getElementById("executeActions"),
    discardActions: document.getElementById("discardActions"),
    settings: document.getElementById("settingsDialog"),
    openSettings: document.getElementById("openSettings"),
    codexPath: document.getElementById("codexPath"),
    extraSkillRoots: document.getElementById("extraSkillRoots"),
    activeSkillNames: document.getElementById("activeSkillNames"),
    saveSettings: document.getElementById("saveSettings")
  };

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.className = "status status-" + kind;
  }

  function addMessage(role, text, extraClass) {
    var article = document.createElement("article");
    article.className = "message " + role + (extraClass ? " " + extraClass : "");
    var label = document.createElement("div");
    label.className = "message-role";
    label.textContent = role === "user" ? "You" : "Codex";
    var body = document.createElement("div");
    body.className = "message-body";
    body.textContent = text || "";
    article.appendChild(label);
    article.appendChild(body);
    els.chat.appendChild(article);
    els.chat.scrollTop = els.chat.scrollHeight;
    return body;
  }

  function loadSettings() {
    var extra;
    try { extra = JSON.parse(localStorage.getItem("aeCodex.extraSkillRoots") || "[]"); } catch (err) { extra = []; }
    var active;
    try { active = JSON.parse(localStorage.getItem("aeCodex.activeSkillNames") || "[\"ae-dev\"]"); } catch (activeErr) { active = ["ae-dev"]; }
    return {
      codexPath: localStorage.getItem("aeCodex.codexPath") || "codex",
      extraSkillRoots: extra,
      activeSkillNames: active
    };
  }

  function resolveCodexPath(configuredPath) {
    if (configuredPath && configuredPath !== "codex") { return configuredPath; }
    var targetTriple;
    var executableName = "codex";
    if (nodeProcess.platform === "win32") {
      targetTriple = nodeProcess.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
      executableName = "codex.exe";
    } else if (nodeProcess.platform === "darwin") {
      targetTriple = nodeProcess.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    } else {
      targetTriple = nodeProcess.arch === "arm64" ? "aarch64-unknown-linux-musl" : "x86_64-unknown-linux-musl";
    }

    var platformPackage = nodeProcess.platform === "win32"
      ? (nodeProcess.arch === "arm64" ? "codex-win32-arm64" : "codex-win32-x64")
      : (nodeProcess.platform === "darwin"
        ? (nodeProcess.arch === "arm64" ? "codex-darwin-arm64" : "codex-darwin-x64")
        : (nodeProcess.arch === "arm64" ? "codex-linux-arm64" : "codex-linux-x64"));

    var candidates = [
      path.join(extensionRoot, "vendor", targetTriple, "bin", executableName),
      path.join(extensionRoot, "node_modules", "@openai", platformPackage, "vendor", targetTriple, "bin", executableName),
      path.join(extensionRoot, "node_modules", "@openai", "codex", "vendor", targetTriple, "bin", executableName)
    ];
    var pnpmRoot = path.join(extensionRoot, "node_modules", ".pnpm");
    if (fs.existsSync(pnpmRoot)) {
      fs.readdirSync(pnpmRoot).filter(function (name) {
        return name.indexOf("@openai+codex@") === 0 && name.indexOf("-" + platformPackage.replace("codex-", "")) > 0;
      }).forEach(function (name) {
        candidates.push(path.join(pnpmRoot, name, "node_modules", "@openai", "codex", "vendor", targetTriple, "bin", executableName));
      });
    }
    for (var i = 0; i < candidates.length; i += 1) {
      if (fs.existsSync(candidates[i])) { return candidates[i]; }
    }
    return "codex";
  }

  function refreshSkills() {
    var settings = loadSettings();
    registry = new AESkillRegistry.Registry({
      fs: fs, path: path, os: os, extensionRoot: extensionRoot,
      extraRoots: settings.extraSkillRoots,
      requiredAutoSkills: ["ae-dev"],
      activeSkillNames: settings.activeSkillNames
    });
    var skills = registry.scan();
    var auto = registry.autoSkills();
    var conditional = ["ae-bezier-paths", "curves-and-paths"].filter(function (name) {
      return skills.some(function (skill) { return skill.name.toLowerCase() === name; });
    });
    els.skillSummary.textContent = auto.length ? ("自动技能：" + auto.map(function (skill) { return skill.name; }).join(", ") + (conditional.length ? " · 贝塞尔时：" + conditional.join(", ") : "")) : "未找到 ae-dev 技能";

    var moduleLoads = registry.hostModules().map(function (skill) {
      var encoded = encodeURIComponent(JSON.stringify(skill.hostEntry));
      return bridge.evalScript("AECodex.loadSkillModuleEncoded('" + encoded + "')").then(function (raw) {
        return bridge.parseResult(raw);
      }).catch(function (err) {
        addMessage("assistant", "加载技能宿主模块失败：" + skill.name + "\n" + err.message, "error");
        throw err;
      });
    });
    hostModulesReady = Promise.all(moduleLoads);
    return skills;
  }

  function makeClient() {
    var settings = loadSettings();
    var resolvedCodexPath = resolveCodexPath(settings.codexPath);
    var next = new AECodexClient.CodexClient({
      childProcess: childProcess,
      readline: readline,
      codexPath: resolvedCodexPath,
      cwd: extensionRoot,
      platform: nodeProcess.platform
    });
    next.on("ready", function () { setStatus("已连接", "online"); });
    next.on("delta", function (delta) {
      if (activeAssistantBody) {
        activeAssistantBody.textContent += delta;
        els.chat.scrollTop = els.chat.scrollHeight;
      }
    });
    next.on("diagnostic", function (message) {
      if (/error|failed|unauthorized/i.test(message)) { console.warn(message); }
    });
    next.on("error", function (err) { setStatus("连接失败", "error"); addMessage("assistant", err.message, "error"); });
    next.on("exit", function () { setStatus("未连接", "offline"); });
    return next;
  }

  async function inspectAE() {
    var raw = await bridge.evalScript("AECodex.inspect()");
    return bridge.parseResult(raw);
  }

  async function executeActions(actions) {
    setStatus("正在修改 AE", "busy");
    var raw = await bridge.callEncoded("executeBatchEncoded", actions);
    var result = bridge.parseResult(raw);
    addMessage("assistant", "已完成 " + result.results.length + " 个 AE 动作。需要时可点击下方“撤销”。\n日志：" + result.logPath);
    setStatus("已连接", "online");
    pendingActions = null;
    els.pendingCard.classList.add("hidden");
    return result;
  }

  function showPending(actions, message) {
    pendingActions = actions;
    els.pendingSummary.textContent = (message ? message + " · " : "") + actions.length + " 个 AE 动作";
    els.pendingCard.classList.remove("hidden");
  }

  async function sendPrompt() {
    var userText = els.prompt.value.trim();
    if (!userText) { return; }
    els.prompt.value = "";
    addMessage("user", userText);
    els.send.disabled = true;
    els.stop.classList.remove("hidden");
    setStatus("Codex 思考中", "busy");
    activeAssistantBody = addMessage("assistant", "");

    try {
      if (!registry) { refreshSkills(); }
      await hostModulesReady;
      var aeSnapshot = await inspectAE();
      if (!client) { client = makeClient(); }
      var prompt = AEProtocol.buildPrompt(userText, aeSnapshot, registry.markers(userText));
      var responseText = await client.runTurn(prompt, registry.inputItems(userText), AEProtocol.createOutputSchema(registry.actionSchemas(userText), userText));
      var response = AEProtocol.validateForSnapshot(AEProtocol.parseResult(responseText), aeSnapshot);
      activeAssistantBody.textContent = response.message;
      if (response.actions.length) {
        await executeActions(response.actions);
      } else {
        setStatus("已连接", "online");
      }
    } catch (err) {
      activeAssistantBody.textContent = "操作失败：" + err.message;
      activeAssistantBody.parentNode.classList.add("error");
      setStatus("发生错误", "error");
    } finally {
      activeAssistantBody = null;
      els.send.disabled = false;
      els.stop.classList.add("hidden");
    }
  }

  els.send.addEventListener("click", sendPrompt);
  els.prompt.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendPrompt(); }
  });
  els.stop.addEventListener("click", function () { if (client) { client.interrupt(); } });
  els.inspect.addEventListener("click", async function () {
    try {
      var snapshot = await inspectAE();
      var comp = snapshot.activeComp;
      addMessage("assistant", comp ? ("当前合成：" + comp.name + " · 已选 " + comp.selectedLayers.length + " 个图层") : "当前没有活动合成。");
    } catch (err) { addMessage("assistant", err.message, "error"); }
  });
  els.undo.addEventListener("click", async function () {
    try {
      els.undo.disabled = true;
      setStatus("正在撤销", "busy");
      var raw = await bridge.evalScript("AECodex.undo()");
      bridge.parseResult(raw);
      addMessage("assistant", "已撤销最近一次 AE 操作。");
      setStatus("已连接", "online");
    } catch (err) {
      addMessage("assistant", "撤销失败：" + err.message, "error");
      setStatus("发生错误", "error");
    } finally { els.undo.disabled = false; }
  });
  els.executeActions.addEventListener("click", function () { if (pendingActions) { executeActions(pendingActions).catch(function (err) { addMessage("assistant", err.message, "error"); }); } });
  els.discardActions.addEventListener("click", function () { pendingActions = null; els.pendingCard.classList.add("hidden"); });
  els.openSettings.addEventListener("click", function () {
    var settings = loadSettings();
    els.codexPath.value = settings.codexPath;
    els.extraSkillRoots.value = settings.extraSkillRoots.join("\n");
    els.activeSkillNames.value = settings.activeSkillNames.join("\n");
    els.settings.showModal();
  });
  els.saveSettings.addEventListener("click", function () {
    localStorage.setItem("aeCodex.codexPath", els.codexPath.value.trim() || "codex");
    var roots = els.extraSkillRoots.value.split(/\r?\n/).map(function (value) { return value.trim(); }).filter(Boolean);
    localStorage.setItem("aeCodex.extraSkillRoots", JSON.stringify(roots));
    var skillNames = els.activeSkillNames.value.split(/\r?\n|,/).map(function (value) { return value.trim(); }).filter(Boolean);
    if (skillNames.map(function (name) { return name.toLowerCase(); }).indexOf("ae-dev") < 0) { skillNames.unshift("ae-dev"); }
    localStorage.setItem("aeCodex.activeSkillNames", JSON.stringify(skillNames));
    if (client) { client.stop(); client = null; }
    refreshSkills();
  });

  window.addEventListener("beforeunload", function () { if (client) { client.stop(); } });

  bridge.evalScript("AECodex.ping()").then(function (raw) {
    var info = bridge.parseResult(raw);
    refreshSkills();
    setStatus("AE " + info.aeVersion, "offline");
  }).catch(function (err) {
    setStatus("AE 桥不可用", "error");
    addMessage("assistant", err.message, "error");
  });
}());

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.AECodexClient = api; }
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function EventHub() { this.handlers = {}; }
  EventHub.prototype.on = function (name, handler) {
    if (!this.handlers[name]) { this.handlers[name] = []; }
    this.handlers[name].push(handler);
    return this;
  };
  EventHub.prototype.emit = function (name, value) {
    (this.handlers[name] || []).forEach(function (handler) { handler(value); });
  };

  function CodexClient(options) {
    this.cp = options.childProcess;
    this.readline = options.readline;
    this.codexPath = options.codexPath || "codex";
    this.platform = options.platform || (typeof process !== "undefined" ? process.platform : "win32");
    this.cwd = options.cwd;
    this.process = null;
    this.nextId = 1;
    this.pending = {};
    this.threadId = null;
    this.activeTurn = null;
    this.events = new EventHub();
    this.ready = false;
  }

  CodexClient.prototype.on = function (name, handler) { this.events.on(name, handler); return this; };

  CodexClient.prototype._spawn = function () {
    var command = this.codexPath;
    var options = { cwd: this.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] };
    if (this.platform === "win32" && /\.(cmd|bat)$/i.test(command)) { options.shell = true; }
    return this.cp.spawn(command, ["app-server"], options);
  };

  CodexClient.prototype.start = async function () {
    var self = this;
    if (this.ready) { return; }
    if (this.process) { throw new Error("Codex 正在启动，请稍候。" ); }
    this.process = this._spawn();
    this.process.on("error", function (err) {
      self.events.emit("error", new Error("无法启动 Codex CLI（" + self.codexPath + "）：" + err.message));
      self._rejectAll(err);
    });
    this.process.on("exit", function (code) {
      self.ready = false;
      self.process = null;
      self.events.emit("exit", code);
      self._rejectAll(new Error("Codex app-server 已退出，代码 " + code));
    });
    this.process.stderr.on("data", function (chunk) {
      var text = chunk.toString("utf8").trim();
      if (text) { self.events.emit("diagnostic", text); }
    });
    var lines = this.readline.createInterface({ input: this.process.stdout });
    lines.on("line", function (line) { self._handleLine(line); });

    await this.request("initialize", {
      clientInfo: { name: "ae_codex_studio", title: "AE Codex Studio", version: "0.3.0" }
    });
    this.notify("initialized", {});
    var started = await this.request("thread/start", {
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "ae_codex_studio"
    });
    this.threadId = started.thread.id;
    this.ready = true;
    this.events.emit("ready", { threadId: this.threadId });
  };

  CodexClient.prototype._handleLine = function (line) {
    var message;
    try { message = JSON.parse(line); } catch (err) {
      this.events.emit("diagnostic", "无法解析 app-server 消息：" + line);
      return;
    }

    if (message.id != null && !message.method) {
      var pending = this.pending[message.id];
      if (!pending) { return; }
      delete this.pending[message.id];
      if (message.error) { pending.reject(new Error(message.error.message || "Codex 请求失败")); }
      else { pending.resolve(message.result); }
      return;
    }

    if (message.id != null && message.method) {
      this._handleServerRequest(message);
      return;
    }

    if (message.method) { this._handleNotification(message.method, message.params || {}); }
  };

  CodexClient.prototype._handleServerRequest = function (message) {
    var method = message.method || "";
    if (/requestApproval$/i.test(method)) {
      this._sendRaw({ id: message.id, result: { decision: "decline" } });
      this.events.emit("diagnostic", "已拒绝 Codex 的外部执行请求：" + method);
      return;
    }
    this._sendRaw({ id: message.id, error: { code: -32601, message: "AE Codex Studio does not support this server request." } });
  };

  CodexClient.prototype._handleNotification = function (method, params) {
    this.events.emit("event", { method: method, params: params });
    if (!this.activeTurn) { return; }

    if (method === "item/agentMessage/delta") {
      var delta = params.delta || "";
      this.activeTurn.text += delta;
      this.events.emit("delta", delta);
      return;
    }
    if (method === "item/completed" && params.item && params.item.type === "agentMessage") {
      var item = params.item;
      if (typeof item.text === "string") { this.activeTurn.finalText = item.text; }
      else if (typeof item.content === "string") { this.activeTurn.finalText = item.content; }
      return;
    }
    if (method === "error") {
      var errorMessage = params.error && params.error.message ? params.error.message : "Codex turn failed";
      this.activeTurn.error = new Error(errorMessage);
      return;
    }
    if (method === "turn/completed") {
      var active = this.activeTurn;
      this.activeTurn = null;
      var status = params.turn && params.turn.status;
      if (active.error || status === "failed") { active.reject(active.error || new Error("Codex turn failed")); }
      else { active.resolve(active.finalText || active.text); }
    }
  };

  CodexClient.prototype.runTurn = async function (text, skillItems, outputSchema) {
    if (!this.ready) { await this.start(); }
    if (this.activeTurn) { throw new Error("已有一个 Codex 请求正在运行。" ); }
    var self = this;
    var completion = new Promise(function (resolve, reject) {
      self.activeTurn = { resolve: resolve, reject: reject, text: "", finalText: "", error: null, turnId: null };
    });
    var input = [{ type: "text", text: text }].concat(skillItems || []);
    try {
      var result = await this.request("turn/start", {
        threadId: this.threadId,
        input: input,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", access: { type: "fullAccess" } },
        outputSchema: outputSchema
      });
      if (this.activeTurn) { this.activeTurn.turnId = result.turn && result.turn.id; }
    } catch (err) {
      var failed = this.activeTurn;
      this.activeTurn = null;
      if (failed) { failed.reject(err); }
    }
    return completion;
  };

  CodexClient.prototype.interrupt = function () {
    if (!this.activeTurn || !this.activeTurn.turnId) { return Promise.resolve(); }
    return this.request("turn/interrupt", { threadId: this.threadId, turnId: this.activeTurn.turnId });
  };

  CodexClient.prototype.request = function (method, params) {
    var self = this;
    var id = this.nextId++;
    return new Promise(function (resolve, reject) {
      self.pending[id] = { resolve: resolve, reject: reject };
      self._sendRaw({ method: method, id: id, params: params || {} });
    });
  };

  CodexClient.prototype.notify = function (method, params) { this._sendRaw({ method: method, params: params || {} }); };

  CodexClient.prototype._sendRaw = function (message) {
    if (!this.process || !this.process.stdin.writable) { throw new Error("Codex app-server 未运行。" ); }
    this.process.stdin.write(JSON.stringify(message) + "\n");
  };

  CodexClient.prototype._rejectAll = function (error) {
    var pending = this.pending;
    this.pending = {};
    Object.keys(pending).forEach(function (id) { pending[id].reject(error); });
    if (this.activeTurn) {
      this.activeTurn.reject(error);
      this.activeTurn = null;
    }
  };

  CodexClient.prototype.stop = function () {
    if (this.process) { this.process.kill(); }
    this.process = null;
    this.ready = false;
  };

  return { CodexClient: CodexClient };
}));

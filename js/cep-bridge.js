(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.AECepBridge = api; }
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function Bridge() {}

  function normalizeSystemPath(value, platform) {
    var decoded = decodeURI(String(value || ""));
    if (/^file:\/\/\//i.test(decoded)) {
      if (/win/i.test(platform || "") && /^file:\/\/\/[a-z]:/i.test(decoded)) {
        decoded = decoded.substring(8);
      } else {
        decoded = decoded.substring(7);
      }
    } else if (/^file:\/\//i.test(decoded)) {
      decoded = decoded.substring(7);
    }
    if (/win/i.test(platform || "") && /^\/[a-z]:/i.test(decoded)) {
      decoded = decoded.substring(1);
    }
    return decoded;
  }

  Bridge.prototype.isAvailable = function () {
    return typeof window !== "undefined" && !!window.__adobe_cep__;
  };

  Bridge.prototype.getExtensionRoot = function () {
    if (!this.isAvailable()) { return ""; }
    return normalizeSystemPath(window.__adobe_cep__.getSystemPath("extension"), window.navigator && window.navigator.platform);
  };

  Bridge.prototype.evalScript = function (script) {
    return new Promise(function (resolve, reject) {
      if (typeof window === "undefined" || !window.__adobe_cep__) {
        reject(new Error("当前页面不在 Adobe CEP 面板中运行。"));
        return;
      }
      window.__adobe_cep__.evalScript(script, function (result) {
        if (result === "EvalScript error.") {
          reject(new Error(result));
          return;
        }
        resolve(result);
      });
    });
  };

  Bridge.prototype.callEncoded = function (method, payload) {
    var encoded = encodeURIComponent(JSON.stringify(payload == null ? null : payload));
    return this.evalScript("AECodex." + method + "('" + encoded + "')");
  };

  Bridge.prototype.parseResult = function (raw) {
    var parsed;
    try { parsed = JSON.parse(raw); } catch (err) {
      throw new Error("AE 返回了无法解析的结果：" + raw);
    }
    if (!parsed.ok) { throw new Error(parsed.error || "AE 操作失败"); }
    return parsed.data;
  };

  return { Bridge: Bridge, normalizeSystemPath: normalizeSystemPath };
}));

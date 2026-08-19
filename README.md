# AE Codex Studio 0.2.0

AE Codex Studio 是一个可停靠的 After Effects CEP 面板。它通过本地 `codex app-server` 进行对话，把 Codex 返回的结构化动作交给安全的 ExtendScript 宿主桥执行。

## 当前能力

- 创建矩形、椭圆、多边形、星形和任意贝塞尔路径，并添加填充、描边和蒙版。
- 通过稳定的 matchName 添加任意已安装效果，读取并设置效果子属性。
- 读取活动合成中的图层、来源、文本、形状、蒙版、效果、颜色、透明度和 Alpha 解释信息。
- 创建纯色层，拆分、复制图层，以及把指定图层预合成。
- 对注册动作无法覆盖的工作，可在明确确认后执行 AE ExtendScript；任意 JSX 永远不会自动执行。
- 设置中可同时启用多个 Skill，它们会共同注入提示、动作 Schema 和宿主模块。

- 自动读取活动合成、时间、尺寸和选中图层的变换属性。
- 每次请求自动附加用户的 `$ae-dev` 技能；找不到用户版本时使用插件内置副本。
- 流式显示 Codex 回复。
- 创建文字层和矩形形状层。
- 设置 Position、Scale、Rotation、Opacity、Anchor Point。
- 创建带 Bezier 缓动的关键帧。
- 设置表达式、复制/重命名选中图层、预合成。
- 所有项目修改写入一个 Undo Group，并记录到 `%APPDATA%/AECodexPanel/ae-codex.log`。
- `skills/` 扩展接口支持后续技能的提示词和 JSX 宿主操作。

## 安装

1. 确保 After Effects 2024 或 2025 已安装。
2. 安装并登录 Codex CLI，确认终端中可以运行：

   ```powershell
   codex app-server
   ```

   或者在插件目录运行 `npm install`，面板会自动寻找本地安装的官方 `@openai/codex` 平台二进制。

3. 在 PowerShell 中运行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
   ```

4. 重启 AE，在“窗口 → 扩展（旧版）→ AE Codex Studio”打开面板。
5. 在 AE 偏好设置中启用“允许脚本写入文件和访问网络”，用于写入执行日志。

如果 `codex` 不在 PATH 中，在面板设置里填写 `codex.exe` 或 `codex.cmd` 的完整路径。

## 每次自动使用 ae-dev

插件扫描技能时优先使用：

```text
%USERPROFILE%\.agents\skills\ae-dev\SKILL.md
```

每个 `turn/start` 同时包含：

- 文本中的 `$ae-dev` 标记；
- `{ "type": "skill", "name": "ae-dev", "path": ".../SKILL.md" }` 输入项。

因此不是依靠模型自行猜测技能名称，而是由面板显式注入完整技能。

## 添加新技能

复制 `skills/_template` 并改名。技能至少包含 `SKILL.md`，建议同时提供 `SKILL.json`：

```json
{
  "name": "kinetic-type",
  "interface": {
    "displayName": "Kinetic Type",
    "shortDescription": "Typography animation workflows"
  },
  "dependencies": { "tools": [] },
  "aeCodex": {
    "autoInvoke": false,
    "hostEntry": "host/entry.jsxinc",
    "actionSchema": "actions.schema.json"
  }
}
```

如果技能增加新的 AE 动作：

1. 在 `host/entry.jsxinc` 中调用 `AECodex.registerOperation(name, handler)`。
2. 在技能目录的 `actions.schema.json` 描述动作；面板会动态合并，无需修改核心文件。
3. 对输入做完整验证，并继续使用 matchName、日志和 Undo Group。

面板也会扫描 `%USERPROFILE%/.agents/skills`、`%USERPROFILE%/.codex/skills`，设置中还可以添加额外技能根目录。

## 安全边界

- Codex thread 使用 `approvalPolicy: never` 和只读沙箱。
- 面板拒绝 Codex 发起的命令、文件修改和权限审批。
- Codex不能向 AE 发送任意 JSX，只能使用输出 Schema 中列出的动作。
- 预合成会进入人工确认卡片。
- 插件不会自动保存或覆盖 `.aep` 文件。

## 开发验证

无需安装第三方依赖：

```powershell
node .\tests\test.js
powershell -File .\scripts\diagnose.ps1
```

## 已知限制

- 这是 CEP 开发版，尚未签名发布。
- Codex CLI 必须可以在本机启动并已完成登录。
- 第一版只开放常用变换和基础图层动作；效果参数需要先读取真实的 effect child matchName，再作为技能模块加入。
- AE 的脚本执行在主界面线程上，长批次可能短暂阻塞界面。

Codex App Server 与 Skills 输入格式依据 [official OpenAI documentation](https://learn.chatgpt.com/docs/app-server)。

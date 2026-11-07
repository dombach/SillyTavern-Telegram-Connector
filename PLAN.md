# SillyTavern-Telegram-Connector — Refactor & Hardening Plan

> Fork: `github.com/dombach/SillyTavern-Telegram-Connector`
> Upstream: `github.com/qiqi20020612/SillyTavern-Telegram-Connector` (unmaintained)
>
> Goal: make the connector safe, modern, and fully English. Everything written in
> Chinese is removed/translated. No Chinese text, comments, or strings remain.

## Audit status (done)

Static audit of the current fork found **no malicious code**:

- No `eval`, no `exec`, no `new Function`.
- `child_process.spawn` (4x) is used **only** for the self-restart (`/restart`) path — no arbitrary command execution.
- Outbound network is limited to the Telegram Bot API (via the official library) and a local WebSocket to SillyTavern. No exfiltration / C2 / `tls` / `dgram`.
- File access is limited to `config.js`, a `.restart_protection` log, and ST chat files via the ST API.
- Dependencies (`node-telegram-bot-api`, `ws`) are the real, widely used packages — no typosquatting.

Two issues remain that this plan addresses (details below).

---

## 1. Security hardening — open whitelist (HIGH priority)

Current default in `server/config.example.js`:

```js
allowedUserIds: []   // [] means EVERYONE is allowed
```

This lets any Telegram user control the bot (and therefore SillyTavern).

Changes:

- Change the default to a **closed whitelist** with a clear placeholder:
  ```js
  // Whitelist of allowed Telegram user IDs.
  // Leave EMPTY [] to allow everyone (INSECURE).
  // Recommended: set your own ID (get it from @userinfobot on Telegram).
  allowedUserIds: [000000000],   // <-- replace with your Telegram user ID
  ```
- Add an explicit startup warning to `server.js` when `allowedUserIds` is empty, so the risk is visible on launch.
- Document this prominently in the README.

---

## 2. Dependency upgrade — node-telegram-bot-api v2 (MEDIUM priority)

`server/package.json` pins `node-telegram-bot-api@^0.64.0` (old). Latest major is `v2.x` with API changes.

Changes:

- Bump `node-telegram-bot-api` to `^2.3.0` (and `ws` to latest `^8.x` if needed).
- Audit `server.js` for v2 API differences (e.g. `bot.sendMessage`, `bot.getUpdates`, `startPolling` options). Update call sites as required.
- Run `npm install` and do a smoke test of the server (config present, port binds, `/ping` path works) without a real token.
- Keep `nodemon` as a devDependency.

> Note: bumping majors may introduce breaking changes. If stability is the priority, we can also keep v0.64 and only patch it. Decide before applying.

---

## 3. Localization — remove all Chinese, ship English (HIGH priority)

Everything Chinese is removed/translated: UI strings, comments, help text, README, config comments.

Files to convert:

- `server/server.js` — all Chinese comments and user-facing strings (`/help` text, status messages, error/whitelist messages).
- `index.js` — all Chinese comments and UI strings.
- `settings.html` — labels and text ("Bridge Server WebSocket URL", button labels, status text).
- `server/config.example.js` — comments.
- `README.md` and `server/README.md` — full English rewrite.
- Repo metadata: `manifest.json` display name, `package.json` description, GitHub repo description.

Keep code identifiers (variable/function names) as-is unless they hurt readability — only translate user-facing text and comments.

---

## 4. Documentation & repo housekeeping (LOW priority)

- Rewrite `README.md`: English install/setup, config table, command list, security note (whitelist), how to keep the fork in sync with upstream.
- Rewrite `server/README.md` similarly.
- Set a clear GitHub repo description + topics (e.g. `sillytavern`, `telegram`, `chatbot`).
- Optionally add a `.github/workflows` lint/smoke check (optional, later).
- Consider a `CHANGELOG.md` to track this refactor.

---

## Suggested order

1. Security hardening (whitelist default + startup warning).
2. Localization (Chinese -> English) across all files.
3. Dependency upgrade (v2) — or defer if stability is preferred.
4. Docs & repo housekeeping.

Each step should be its own commit with a clear message.

## Verification (after changes)

- `git diff` review per commit.
- `npm install` succeeds in `server/`.
- Server starts with a placeholder config and binds the WS port; `/ping` and whitelist rejection behave correctly.
- Grep for any remaining Chinese text:
  ```bash
  grep -rnP "[\x{4e00}-\x{9fff}]" --include=*.js --include=*.html --include=*.md .
  ```
  (should return nothing after localization)

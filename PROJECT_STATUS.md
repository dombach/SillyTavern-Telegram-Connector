# Projekt-Status: SillyTavern Telegram Connector

> **Zweck dieser Datei:** Kontext-Übernahme in einer neuen Session. Der Kontext der alten Session ist erschöpft.
> Stand: 2026-11-07, ~20:45 (Iris, Hermes-LXC 192.168.0.115)

## 1. Projektüberblick

Telegram-Bot als Bridge zu SillyTavern: Nachricht an Bot → SillyTavern generiert Antwort → zurück nach Telegram.

- **Ursprung:** Fork von `qiqi20020612/SillyTavern-Telegram-Connector` (unmaintained, chinesische Kommentare) → **`https://github.com/dombach/SillyTavern-Telegram-Connector`**
- **Workspace (Hermes-LXC):** `/home/hermes/.hermes/workspace/SillyTavern-Telegram-Connector` (Branch `master`, clean, alles gepusht)
- **Backup der Originaldateien vor den Fixes:** `/tmp/kms/SillyTavern-Telegram-Connector.BAK.20261107-191337` (kann nach Reboot weg sein)

### Umgebungen
| Komponente | Ort | Details |
|---|---|---|
| SillyTavern | **Win10-VM** (192.168.0.101) | `http://192.168.0.101:8000/`, Pfad `C:\Tools\SillyTavern\` |
| Extension installiert | Win10-VM | `C:\Tools\SillyTavern\data\daniel\extensions\SillyTavern-Telegram-Connector` (via ST-UI „Install Extension" aus dem Fork; Update per „Extensions aktualisieren") |
| Bridge-Server | **Win10-VM** | `C:\Tools\SillyTavern-Telegram-Connector\server\`, Start: `node server.js` |
| Node (VM) | Win10-VM | v22.16.0, `node-telegram-bot-api@2.3.0`, `ws@8.22.1` |
| Bot | Telegram | `@dombach_st_bot`, Token liegt in `server/config.js` auf der VM (hier NICHT absichtlich abgelegt) |
| Whitelist | VM config.js | `allowedUserIds: [17270601]` — korrekt (Daniel; userId == chatId == 17270601, verifiziert) |

### WebSocket-URL in den Extension-Settings (wichtig)
- Browser **auf der VM**: `ws://127.0.0.1:2333` ✓
- Browser **von anderen LAN-Rechnern**: `ws://192.168.0.101:2333` ✓ (127.0.0.1 zeigt dann auf den falschen Rechner!)
- Browser mit `ws://192.168.0.101:2333` zeigt **connected** ✓, Server loggt „SillyTavern extension connected!" ✓
- Server-Port: `wssPort: 2333`; Browser-Aufruf `http://127.0.0.1:2333` → „Upgrade Required" = Server lebt.

## 2. Erledigte Arbeit (Commits, alle gepusht)

```
a76cd18 fix: version-independent API access (remove top-level imports, use api resolver)
bdf1779 fix: load extension correctly (import path + multiline string literals)
aecc3ed upgrade: node-telegram-bot-api to v2.3.0 (breaking API migration)
aa65c92 security: close whitelist default + startup warning
```

1. **Fork/Klon/Audit:** Kein Schadcode; `child_process.spawn` nur für `/restart`.
2. **Security:** Whitelist-Default geschlossen (`[000000000]`), Startup-Warnung bei leerer Whitelist.
3. **Lokalisierung:** Alle chinesischen Strings/Kommentare → Englisch (0 CJK-Zeichen verifiziert).
4. **v2-Migration des Servers:** `new TelegramBot.Bot(...)`, `bot.api.sendMessage({chat_id, text})` (Objekt-Parameter!), `bot.startPolling()` **ohne Optionen**, `bot.close()` statt `stopPolling()`, `.catch()` auf polling.
5. **Extension-Lade-Bugs behoben** (Extension erschien nicht in ST bzw. „failed to load: [object Event]"):
   - Import-Pfad war 4×`../` (→ `/script.js` 404), korrekt 3×`../` (→ `/scripts/script.js`).
   - Zwei mehrzeilige `'…'` String-Literals (invalid JS) → `\n\n` einzeilig.
   - Am Ende: **kompletter Top-Level-`import` aus script.js entfernt**, ersetzt durch version-unabhängigen `api(name)`-Resolver (prüft `getContext()` → `ctx.api` → `SillyTavern[name]` → `window[name]`), Top-Level-`getContext()`-Destructuring entfernt, Modulebene-Listener in `jQuery(() => …)` verschoben. **Extension lädt jetzt und zeigt connected.**

## 3. GELÖST (2026-11-08, Iris)

Ursache: `node-telegram-bot-api@2.3.0` übergibt am `bot.on('message')` einen roten Update-Wrapper `{update:{message:{...}}, api, state}`; dort ist `msg.text` = `undefined`. Der Handler brach bei `if (!text) return;` ab -> keine Ausgabe/Weiterleitung. Text steht in `msg.update.message.text`.

Fix: Commit `a65befe`. Handler destruktu
    `const inner = (msg && msg.update && msg.update.message) || msg;` und liest den Text aus `msg.update.message.text` aus. Auf dem LXC verifiziert: Nachricht „fixtest" wurde korrekt gelesen und lief bis zum SillyTavern-Zweig.
Auf der VM nur `server/server.js` austauschen und Server neu starten.

## 4. Wichtige Pitfalls & Regeln (für neue Session unbedingt beachten)

- **`node-telegram-bot-api` v2:** `startPolling()` OHNE Optionen (sonst „iterable is not async iterable"); API-Aufrufe als `bot.api.sendMessage({ chat_id, text })` (Objekt-Parameter); Konstruktor `new TelegramBot.Bot(token, {...})`.
- **ST-Extension lädt als ES-Modul**, aber Top-Level-Importe aus `script.js` sind versionsfragil → Muster: alles lazy via `SillyTavern.getContext()`/`api()`-Resolver, wie in `index.js` jetzt implementiert und funktioniert.
- **Parallel-Polling = 409-Konflikt.** Eigene `getUpdates`-Tests zerstören stumm das Server-Polling (es wird „terminated"). Nach solchen Tests immer den VM-Server neu starten. Die Test-Poller auf dem LXC (`/tmp/polltest/`) sind beendet; **vor neuen Tests prüfen, dass der VM-Server gestoppt ist** (oder ihn bewusst für einen Repro laufen lassen).
- Whitelist im Server-Handler ist VOR jedem Log: nicht whitelisted → Log „Denied access…" + Auto-Absage. Die ID 17270601 ist korrekt eingetragen.
- Der Bot steht bei BotFather auf „nur Daniel darf sprechen" — Whitelist ist zweite Sicherungsschicht.
- **Kein Token in Dateien/Repos ablegen.** Token liegt nur in `server/config.js` auf der VM (und war im Chat bekannt; bei Bedarf von Daniel neu abfragen).
- Repo-Konventionen: alle Kommentare/Strings Englisch; Commits nach Themenblöcken; Security-Defaults geschlossen.
- Referenz-Extension (funktionierendes Muster): `kobold-model-switcher.zip` in Nextcloud `/files/` (Skript: `python3 ~/.hermes/scripts/nextcloud_file.py`), entpackt unter `/tmp/kms/kobold-model-switcher/` (flüchtig).

## 5. Dateien-Map

| Datei | Inhalt/Status |
|---|---|
| `index.js` (Repo-Root) | ST-Extension, version-unabhängiger `api()`-Resolver, lädt OK |
| `manifest.json`, `settings.html`, `style.css` | Extension-UI, OK |
| `server/server.js` | Bridge-Server (v2-API, Englisch) — Inbound-Handler fixiert (siehe §3) |
| `server/config.example.js` | Vorlage, Whitelist-Default geschlossen |
| `server/config.js` | **existiert nur auf der VM** mit echtem Token + `allowedUserIds:[17270601]` |
| `PLAN.md`, `README.md`, `CONTRIBUTING.md` | Dokumentation, Englisch |
| `/tmp/polltest/poll-test2.js`, `poll-test3.js` | Isolationstests (flüchtig; Inhalt oben beschrieben) |
| `/tmp/kms/SillyTavern-Telegram-Connector.BAK.*` | Backup vor Fixes (flüchtig) |

## 6. Ziel des Projekts (Endzustand)

Daniel schreibt an `@dombach_st_bot` → Antwort erscheint als Nutzer-Nachricht im aktuellen ST-Chat → generierte KI-Antwort (optional gestreamt) kommt als Telegram-Nachricht zurück. Commands wie `/new`, `/listchars`, `/switchchar` funktionieren über den Bot.

**Aktuell:** Extension ✓ geladen ✓ connected. Server ✓ läuft, WebSocket ✓. Telegram-Inbound **fixiert** (Commit `a65befe`): Handler liest Text nun aus dem v2.3.0-Update-Wrapper.

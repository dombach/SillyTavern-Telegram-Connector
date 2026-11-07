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

## 3. OFFENES PROBLEM (Baustelle bei Session-Ende)

**Nachricht an den Bot gesendet → Server-Terminal zeigt NICHTS. `bot.on('message')` feuert im laufenden Server nicht.**

Symptom-Details:
- Server-Start sauber: „Telegram Bot polling started", „SillyTavern extension connected!". Kein Fehler-Log.
- Server gestoppt → Nachricht gesendet → Server gestartet: „**Cleared 1 pending message(s)**" (Nachricht war bei Telegram gespeichert, wurde vom manuellen Startup-Cleanup verworfen, NICHT vom Handler).
- **Während** der Server läuft: jede Nachricht → absolut nichts im Terminal.

### Experimente (Isolation auf dem Hermes-LXC, `/tmp/polltest/`, gleiche Versionen 2.3.0/ws 8.22.1):
- `poll-test2.js` = reines `bot.startPolling()` **ohne Optionen** + `bot.on('message')` → **NACHRICHT EMPFANGEN** ✓
- `poll-test3.js` = **manualles getUpdates-Cleanup wie im Server** (Pfad „0 pending") + `startPolling()` → **NACHRICHT EMPFANGEN** ✓
- `startPolling({timeout:30, limit:10})` → **Fehler „iterable is not async iterable"** — in v2.3.0 dürfen KEINE Optionen übergeben werden.
- **Schlüsseldetail:** Als test2/test3 liefen, bekamen sie Updates **ohne 409-Konflikt** — obwohl der VM-Server laut Log „polling started" hatte. → **Die VM-Server-Pollings waren zu dem Zeitpunkt bereits tot.** Telegram erlaubt nur EIN Polling (sonst 409 „terminated by other getUpdates request").

### Arbeits-Hypothesen (nicht bewiesen):
1. **Pfad „Cleared N>0 pending message(s)" beim Start killt das Polling still.** test3 hat nur den 0-Pending-Pfad abgedeckt! Der >0-Pfad (Zeile 157–161 in server.js, manuelles `getUpdates` mit `offset`) unterscheidet sich und wurde nie isoliert getestet. **→ Nächstes Experiment: poll-test3 mit vorhandener Pending-Nachricht starten.**
2. Versteckter Fehler im Server nach Polling-Start, der den Loop beendet (z. B. `.catch` greift nicht, `ws`-Error-Pfad, „restart protection").
3. Zombie-Prozess auf der VM, der das Polling geerbt/kapert hat (`/restart`-spawn-Mechanik des Servers!) — weniger wahrscheinlich wegen 409-Ausbleiben, aber prüfen.

### Diagnose-Schritte für die nächste Session (in dieser Reihenfolge):
1. **Lebt das VM-Polling wirklich?** VM-Server läuft lassen, dann vom LXC aus:
   `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` → **409 = Polling alive** (und curl-Nutzung danach sofort beenden!); **Resultat ohne 409 = Server-Polling ist tot** → Hypothese 1/2.
   ⚠️ **NIEMALS mit niedrigem/ohne Offset abfragen, wenn Nachrichten erwartet werden — das bestätigt/frisst Updates, die der Server dann nie sieht.** Nur als Momentaufnahme, kurz, und nie parallel zum Test. Nach solchen Tests: VM-Server neu starten.
2. **>0-Pending-Repro:** Nachricht senden bei gestopptem Test-Server, dann poll-test3 starten (Cleanup clears 1) → danach weitere Nachrichten senden → empfängt er noch?
3. **Handler-Firing prüfen:** In VM-`server.js` allererste Zeile im `bot.on('message')`-Handler: `logWithTimestamp('log','RAW MESSAGE EVENT')` — falls doch gefeuert wird und nur die Whitelist-Logik stumm abbricht.
4. **VM-`server.js`-Version verifizieren:** `git -C C:\Tools\SillyTavern-Telegram-Connector log --oneline -1` (oder Datei-Diff) — muss `a76cd18` sein. extension und server wurden getrennt aktualisiert!
5. Falls Hypothese 1 zutrifft: **Startup-Cleanup umbauen** — z. B. `deleteWebhook` + `getUpdates({offset:-1})` direkt vor `startPolling()`, oder Cleanup ganz entfernen und Polling die Offset-Verwaltung überlassen.

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
| `server/server.js` | Bridge-Server (v2-API, Englisch) — **Polling-Problem siehe §3** |
| `server/config.example.js` | Vorlage, Whitelist-Default geschlossen |
| `server/config.js` | **existiert nur auf der VM** mit echtem Token + `allowedUserIds:[17270601]` |
| `PLAN.md`, `README.md`, `CONTRIBUTING.md` | Dokumentation, Englisch |
| `/tmp/polltest/poll-test2.js`, `poll-test3.js` | Isolationstests (flüchtig; Inhalt oben beschrieben) |
| `/tmp/kms/SillyTavern-Telegram-Connector.BAK.*` | Backup vor Fixes (flüchtig) |

## 6. Ziel des Projekts (Endzustand)

Daniel schreibt an `@dombach_st_bot` → Antwort erscheint als Nutzer-Nachricht im aktuellen ST-Chat → generierte KI-Antwort (optional gestreamt) kommt als Telegram-Nachricht zurück. Commands wie `/new`, `/listchars`, `/switchchar` funktionieren über den Bot.

**Aktuell:** Extension ✓ geladen ✓ connected. Server ✓ läuft, WebSocket ✓. **Einzelne offene Lücke: Telegram-Inbound → `bot.on('message')` im Server feuert nicht.**

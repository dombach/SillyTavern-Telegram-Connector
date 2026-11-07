# Telegram Bridge Server

This is the server-side component of the SillyTavern Telegram Connector. It builds the communication bridge between the Telegram bot and the SillyTavern extension.

## Features

- Receives messages from Telegram users and forwards them to SillyTavern
- Receives replies from the AI in SillyTavern and forwards them back to Telegram
- Handles special commands, such as character switching and chat management
- Maintains the WebSocket connection status

## Installation

### Prerequisites

- Node.js 14.0 or higher
- A Telegram bot and Bot Token that you have created

### Installation steps

1. Install dependencies:
   ```bash
   npm install node-telegram-bot-api ws
   ```

2. Configure:
   - Copy the `config.example.js` file to `config.js`:
   ```bash
   # Linux/macOS
   cp ../config.example.js ../config.js

   # Windows
   copy ..\config.example.js ..\config.js
   ```
   - Edit the `config.js` file and replace `telegramToken` with your Telegram Bot Token
   - To change the default port (2333), modify the `wssPort` parameter

3. Start the server:
   ```bash
   node server.js
   ```

## Usage

After the server starts, the console will show the following information:
- `Telegram Bot started...`
- `WebSocket server listening on port XXXX...`

When the SillyTavern extension connects to the server, it will show:
- `SillyTavern extension connected!`

### Security notes

- By default, the server only accepts local connections. If you need remote access, please consider the following security measures:
  - Use HTTPS/WSS for encrypted connections
  - Implement appropriate authentication mechanisms
  - Restrict IP access
  - Make sure the `config.js` file is not publicly exposed (already set in .gitignore)
- Do not publicly share code that contains your Bot Token

> **Whitelist:** The default `allowedUserIds` is set to a closed whitelist (a placeholder ID) rather than an empty list. Set your own Telegram user ID in `config.js` before deploying. The server logs a warning if the whitelist is empty.

## Troubleshooting

- **Cannot start the server**: Check whether the port is in use and whether Node.js is installed correctly
- **Config file not found**: Make sure you copied `config.example.js` to `config.js` and placed it in the correct location
- **Telegram bot not responding**: Verify whether the Bot Token is correct and check the Telegram API connection status
- **WebSocket connection failed**: Make sure the firewall is not blocking the specified port and check your network configuration

## Developer information

If you want to modify or extend the server's functionality, the main file is `server.js`, which contains:
- WebSocket server setup
- Telegram Bot initialization and message handling
- Command parsing and handling logic

Configuration information is now stored in the `config.js` file in the project root, including:
- Telegram Bot Token
- WebSocket server port

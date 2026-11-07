## About this project
I'm sorry, but due to increasingly busy work and personal matters, I may no longer be able to maintain this project. 
The project's code is fully open source, and anyone is welcome to Fork it at any time to carry out their own development and improvements. 
If you're interested in this project, feel free to use it as a starting point for your own project without needing additional permission. 
Thank you for your understanding and support.

# SillyTavern Telegram Connector

SillyTavern Telegram Connector is an extension for SillyTavern that lets users interact with AI characters in SillyTavern through Telegram. The extension builds a bridge between SillyTavern and a Telegram bot, allowing users to chat with their favorite AI characters anytime and anywhere from their mobile devices.

[![License](https://img.shields.io/github/license/qiqi20020612/SillyTavern-Telegram-Connector)](https://github.com/qiqi20020612/SillyTavern-Telegram-Connector/blob/main/LICENSE)
[![stars](https://img.shields.io/github/stars/qiqi20020612/SillyTavern-Telegram-Connector)](https://github.com/qiqi20020612/SillyTavern-Telegram-Connector)

## Features

- **Telegram integration**: Chat with AI characters in SillyTavern through the Telegram app
- **Real-time sync**: Conversations in Telegram are synced to the SillyTavern interface in real time, and vice versa
- **Command support**: Provides several Telegram commands for managing chats and characters
  - `/help` - Show all available commands
  - `/new` - Start a new chat
  - `/listchars` - List all available characters
  - `/switchchar <character name>` - Switch to a specific character
  - `/listchats` - List all chat records for the current character
  - `/switchchat <chat name>` - Switch to a specific chat record
- **Easy setup**: Connects via WebSocket, simple to set up and use

## Installation and Usage

### Installing the extension

1. In SillyTavern, navigate to the "Extensions" tab
2. Click "Install Extension"
3. Enter the following URL: `https://github.com/qiqi20020612/SillyTavern-Telegram-Connector`
4. Click the "Install" button
5. After installation, restart SillyTavern

### Server setup

1. Clone or download this repository to your computer
2. Go into the `server` directory
3. Install dependencies:
   ```
   npm install node-telegram-bot-api ws
   ```
4. Copy the `config.example.js` file to `config.js`:
   ```
   cp config.example.js config.js
   ```
   Or on Windows:
   ```
   copy config.example.js config.js
   ```
5. Edit the `config.js` file and replace `YOUR_TELEGRAM_BOT_TOKEN_HERE` with your Telegram Bot Token
   (you can obtain one from Telegram's [@BotFather](https://t.me/BotFather))
6. Start the server:
   ```
   node server.js
   ```

### Connection configuration

1. In SillyTavern, go to the "Extensions" tab
2. Find the "Telegram Connector" section
3. In the "Bridge Server WebSocket URL" field, enter the WebSocket server address
   (defaults to `ws://127.0.0.1:2333`)
4. Click the "Connect" button
5. Once the status shows "Connected", you can start using it

### Using Telegram

1. In Telegram, search for and start a conversation with the bot you created
2. Send any message to start chatting
3. Your message will be sent to SillyTavern, and the AI's reply will be sent back to Telegram automatically
4. Use the `/help` command to see all available commands

## System Requirements

- Node.js 14.0 or higher
- A running SillyTavern instance
- Internet connection (for the Telegram API)
- HTTPS/WSS is recommended if the server is publicly accessible

## Troubleshooting

- **Connection issues**: Make sure the WebSocket server is running and the URL is configured correctly
- **Bot not responding**: Check whether the Telegram Bot Token is correct and look for errors in the server logs
- **Messages not syncing**: Make sure the SillyTavern extension is connected to the WebSocket server

## Support and Contributing

If you run into problems or have suggestions for improvements, please contact us via:

- Open a GitHub Issue
- Contact the author: ZMou
- Visit the author's site: https://zmoutech.cn

Pull Requests to improve this extension are welcome!

## License

This project uses the GNU General Public License v3.0 (GPL-3.0) - see the LICENSE file for details.

## TODO

- **Group chat enhancements**:
  - [ ] Respond to messages that @bot in group chats

- **Media support**:
  - [ ] Support sending images

- **Message formatting**:
  - [ ] Implement markdown escaping
  - [ ] Change bot info parsing to HTML

- **Architecture improvements**:
  - [x] Commands are handled by the server; the frontend no longer participates in command parsing
  - [ ] Convert the server into a standard server-side plugin following the [SillyTavern server plugin specification](https://docs.sillytavern.app/for-contributors/server-plugins/)

- **User experience improvements**:
  - [x] Adjust the frequency of editing messages
  - [x] Streaming optimization: display the initial message after generating enough text
  - [ ] Keep the "typing" status for the entire streaming response
  - [x] Add the `/ping` command, letting users check the Bridge connection status and SillyTavern status at any time

- **Settings menu**:
  - [ ] Add whitelist settings to the extension settings page
  - [ ] Control whether notifications are sent to Telegram during web activities such as character switching

- **Error handling and stability**:
  - [ ] The `/exit` command always "exit operation timed out, force quit process"
  - [x] Handle the "Stop Generation" button click event in ST (GENERATION_STOPPED instead of GENERATION_ENDED)
  - [ ] Handle the case of sending a new message while generation is in progress (intercept and prompt the user that generation is running; do not submit to ST)
  - [ ] After `/switchchar` or `/switchchat` commands, notify the server to clear the old cached state

- **Technical optimizations**:
  - [ ] Implement WebSocket heartbeat detection for browser liveness
  - [ ] Optimize the way setTimeout is used to wait for DOM updates

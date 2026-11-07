// config.example.js
// Telegram Bot config example
// Usage: copy this file to config.js and edit it below.

module.exports = {
    // Replace with your own Telegram Bot Token
    telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

    // WebSocket server port
    wssPort: 2333,

    // Whitelist of Telegram user IDs allowed to interact with the bot.
    // Get your own ID by chatting with @userinfobot on Telegram.
    // SECURITY: This defaults to a CLOSED whitelist.
    // Set your own Telegram user ID below. Leaving it as [000000000]
    // means NO ONE (except you after editing) can use the bot.
    // NEVER leave the literal placeholder [000000000] as-is in production.
    // Example: [123456789, 987654321]
    allowedUserIds: [000000000]
};
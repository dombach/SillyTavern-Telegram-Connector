// server.js
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Add a logging function with a timestamp
function logWithTimestamp(level, ...args) {
    const now = new Date();

    // Format the time using the local timezone
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const prefix = `[${timestamp}]`;

    switch (level) {
        case 'error':
            console.error(prefix, ...args);
            break;
        case 'warn':
            console.warn(prefix, ...args);
            break;
        default:
            console.log(prefix, ...args);
    }
}

// Restart protection - prevents a restart loop
const RESTART_PROTECTION_FILE = path.join(__dirname, '.restart_protection');
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 60000; // 1 minute

// Check whether a restart loop is possible
function checkRestartProtection() {
    try {
        if (fs.existsSync(RESTART_PROTECTION_FILE)) {
            const data = JSON.parse(fs.readFileSync(RESTART_PROTECTION_FILE, 'utf8'));
            const now = Date.now();

            // Clean up expired restart records
            data.restarts = data.restarts.filter(time => now - time < RESTART_WINDOW_MS);

            // Add the current restart time
            data.restarts.push(now);

            // If there were too many restarts within the window, exit
            if (data.restarts.length > MAX_RESTARTS) {
                logWithTimestamp('error', `Possible loop restart detected! Restarted ${data.restarts.length} time(s) within ${RESTART_WINDOW_MS / 1000} second(s).`);
                logWithTimestamp('error', 'To prevent resource exhaustion, the server will exit. Please check and fix the issue manually before restarting.');

                // If a notify chatId is set, try to send the error message
                if (process.env.RESTART_NOTIFY_CHATID) {
                    const chatId = parseInt(process.env.RESTART_NOTIFY_CHATID);
                    if (!isNaN(chatId)) {
                        // Create a temporary bot to send the error message
                        try {
                            const tempBot = new TelegramBot.Bot(require('./config').telegramToken, { polling: false });
                            tempBot.api.sendMessage({ chat_id: chatId, text: 'Loop restart detected! The server has stopped to prevent resource exhaustion. Please check and fix the issue manually.' })
                                .finally(() => process.exit(1));
                        } catch (e) {
                            process.exit(1);
                        }
                        return; // Wait for the message to be sent, then exit
                    }
                }

                process.exit(1);
            }

            // Save the updated restart records
            fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify(data));
        } else {
            // Create a new restart protection file
            fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify({ restarts: [Date.now()] }));
        }
    } catch (error) {
        logWithTimestamp('error', 'Restart protection check failed:', error);
        // Continue on error; do not block the server from starting
    }
}

// Check restart protection on startup
checkRestartProtection();

// Check whether the config file exists
const configPath = path.join(__dirname, './config.js');
if (!fs.existsSync(configPath)) {
    logWithTimestamp('error', 'Error: config.js not found!');
    logWithTimestamp('error', 'Copy config.example.js to config.js in the server directory and set your Telegram Bot Token');
    process.exit(1); // Terminate program
}

const config = require('./config');

// --- Config ---
// Read the Telegram Bot Token and WebSocket port from the config
const token = config.telegramToken;
// WebSocket server port
const wssPort = config.wssPort;

// Check whether the default token was changed
if (token === 'TOKEN' || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    logWithTimestamp('error', 'Error: Please set your Telegram Bot Token in config.js first!');
    logWithTimestamp('error', 'Find the line telegramToken: \'YOUR_TELEGRAM_BOT_TOKEN_HERE\' and replace it with the token you got from BotFather');
    process.exit(1); // Terminate program
}

// Security warning: an empty whitelist allows everyone to control the bot.
if (!config.allowedUserIds || config.allowedUserIds.length === 0) {
    logWithTimestamp('warn', 'SECURITY WARNING: allowedUserIds is empty. EVERYONE can use this bot and control SillyTavern!');
    logWithTimestamp('warn', 'Set your Telegram user ID in config.js (get it from @userinfobot) to restrict access.');
}

// Initialize Telegram Bot, but do not start polling immediately
const bot = new TelegramBot.Bot(token, { polling: false });
logWithTimestamp('log', 'Initializing Telegram Bot...');

// Manually clear all unprocessed messages, then start polling
(async function clearAndStartPolling() {
    try {
        logWithTimestamp('log', 'Clearing the Telegram message queue...');

        // Check whether this is a restart; if so use a more thorough clearing approach
        const isRestart = process.env.TELEGRAM_CLEAR_UPDATES === '1';
        if (isRestart) {
            logWithTimestamp('log', 'Restart flag detected; performing a more thorough message-queue cleanup...');
            // Fetch updates and discard all messages
            let updates;
            let lastUpdateId = 0;

            // Loop over fetching updates until there are no more updates
            do {
                updates = await bot.api.getUpdates({
                    offset: lastUpdateId,
                    limit: 100,
                    timeout: 0
                });

                if (updates && updates.length > 0) {
                    lastUpdateId = updates[updates.length - 1].update_id + 1;
                    logWithTimestamp('log', `Cleared ${updates.length} message(s), current offset: ${lastUpdateId}`);
                }
            } while (updates && updates.length > 0);

            // Clear the environment variable
            delete process.env.TELEGRAM_CLEAR_UPDATES;
            logWithTimestamp('log', 'Message queue cleanup complete');
        } else {
            // Cleanup on a normal startup
            const updates = await bot.api.getUpdates({ limit: 100, timeout: 0 });
            if (updates && updates.length > 0) {
                // If there are updates, get the last update's ID and set the offset to it + 1
                const lastUpdateId = updates[updates.length - 1].update_id;
                await bot.api.getUpdates({ offset: lastUpdateId + 1, limit: 1, timeout: 0 });
                logWithTimestamp('log', `Cleared ${updates.length} pending message(s)`);
            } else {
                logWithTimestamp('log', 'No pending messages to clear');
            }
        }

        // Start polling
        bot.startPolling().catch(err => {
            logWithTimestamp('error', 'Failed to start Telegram Bot polling:', err.message);
        });
        logWithTimestamp('log', 'Telegram Bot polling started');
    } catch (error) {
        logWithTimestamp('error', 'Error clearing the message queue or starting polling:', error);
        // If clearing fails, still try to start polling
        bot.startPolling().catch(err => {
            logWithTimestamp('error', 'Failed to start Telegram Bot polling (fallback):', err.message);
        });
        logWithTimestamp('log', 'Telegram Bot polling started (after queue cleanup failed)');
    }
})();

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: wssPort });
logWithTimestamp('log', `WebSocket server listening on port ${wssPort}...`);

let sillyTavernClient = null; // Holds the connected SillyTavern extension client

// Holds ongoing streaming sessions; adjust the session structure and use a Promise to handle messageId
// Structure: { messagePromise: Promise<number> | null, lastText: String, timer: NodeJS.Timeout | null, isEditing: boolean }
const ongoingStreams = new Map();

// Reload server function
function reloadServer(chatId) {
    logWithTimestamp('log', 'Reloading server-side components...');
    Object.keys(require.cache).forEach(function (key) {
        if (key.indexOf('node_modules') === -1) {
            delete require.cache[key];
        }
    });
    try {
        delete require.cache[require.resolve('./config.js')];
        const newConfig = require('./config.js');
        Object.assign(config, newConfig);
        logWithTimestamp('log', 'Config file reloaded');
    } catch (error) {
        logWithTimestamp('error', 'Error reloading config file:', error);
        if (chatId) bot.api.sendMessage({ chat_id: chatId, text: 'Error reloading config file: ' + error.message });
        return;
    }
    logWithTimestamp('log', 'Server-side components reloaded');
    if (chatId) bot.api.sendMessage({ chat_id: chatId, text: 'Server-side components reloaded successfully.' });
}

// Restart server function
function restartServer(chatId) {
    logWithTimestamp('log', 'Restarting server-side components...');

    // First, stop Telegram Bot polling
    bot.close().then(() => {
        logWithTimestamp('log', 'Telegram Bot polling stopped');

        // Then close the WebSocket server
        if (wss) {
            wss.close(() => {
                logWithTimestamp('log', 'WebSocket server closed, preparing to restart...');
                setTimeout(() => {
                    const { spawn } = require('child_process');
                    const serverPath = path.join(__dirname, 'server.js');
                    logWithTimestamp('log', `Restarting server: ${serverPath}`);
                    const cleanEnv = {
                        PATH: process.env.PATH,
                        NODE_PATH: process.env.NODE_PATH,
                        TELEGRAM_CLEAR_UPDATES: '1' // Add a flag indicating this is a restart
                    };
                    if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                    const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                    child.unref();
                    process.exit(0);
                }, 1000);
            });
        } else {
            // If there is no WebSocket server, restart directly
            setTimeout(() => {
                const { spawn } = require('child_process');
                const serverPath = path.join(__dirname, 'server.js');
                logWithTimestamp('log', `Restarting server: ${serverPath}`);
                const cleanEnv = {
                    PATH: process.env.PATH,
                    NODE_PATH: process.env.NODE_PATH,
                    TELEGRAM_CLEAR_UPDATES: '1' // Add a flag indicating this is a restart
                };
                if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                child.unref();
                process.exit(0);
            }, 1000);
        }
    }).catch(err => {
        logWithTimestamp('error', 'Error stopping Telegram Bot polling:', err);
        // Continue the restart process even on error
        if (wss) {
            wss.close(() => {
                // Restart code...
                setTimeout(() => {
                    const { spawn } = require('child_process');
                    const serverPath = path.join(__dirname, 'server.js');
                    logWithTimestamp('log', `Restarting server: ${serverPath}`);
                    const cleanEnv = {
                        PATH: process.env.PATH,
                        NODE_PATH: process.env.NODE_PATH,
                        TELEGRAM_CLEAR_UPDATES: '1' // Add a flag indicating this is a restart
                    };
                    if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                    const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                    child.unref();
                    process.exit(0);
                }, 1000);
            });
        } else {
            // If there is no WebSocket server, restart directly
            setTimeout(() => {
                const { spawn } = require('child_process');
                const serverPath = path.join(__dirname, 'server.js');
                logWithTimestamp('log', `Restarting server: ${serverPath}`);
                const cleanEnv = {
                    PATH: process.env.PATH,
                    NODE_PATH: process.env.NODE_PATH,
                    TELEGRAM_CLEAR_UPDATES: '1' // Add a flag indicating this is a restart
                };
                if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                child.unref();
                process.exit(0);
            }, 1000);
        }
    });
}

// Exit server function
function exitServer() {
    logWithTimestamp('log', 'Shutting down the server...');
    const forceExitTimeout = setTimeout(() => {
        logWithTimestamp('error', 'Exit timed out; forcing process exit');
        process.exit(1);
    }, 10000);
    try {
        if (fs.existsSync(RESTART_PROTECTION_FILE)) {
            fs.unlinkSync(RESTART_PROTECTION_FILE);
            logWithTimestamp('log', 'Restart protection file cleaned up');
        }
    } catch (error) {
        logWithTimestamp('error', 'Failed to clean up the restart protection file:', error);
    }
    const finalExit = () => {
        clearTimeout(forceExitTimeout);
        logWithTimestamp('log', 'Server-side components shut down successfully');
        process.exit(0);
    };
    if (wss) {
        wss.close(() => {
            logWithTimestamp('log', 'WebSocket server closed');
            bot.close().finally(finalExit);
        });
    } else {
        bot.close().finally(finalExit);
    }
}

function handleSystemCommand(command, chatId) {
    logWithTimestamp('log', `Executing system command: ${command}`);

    // Handle the ping command - return the connection status info
    if (command === 'ping') {
        const bridgeStatus = 'Bridge status: connected ✅';
        const stStatus = sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN ?
            'SillyTavern status: connected ✅' :
            'SillyTavern status: not connected ❌';
        bot.api.sendMessage({ chat_id: chatId, text: `${bridgeStatus}\n${stStatus}` });
        return;
    }

    let responseMessage = '';
    switch (command) {
        case 'reload':
            responseMessage = 'Reloading server-side components...';
            // If SillyTavern is connected, run the UI refresh
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // If not connected, reload the server directly
                bot.api.sendMessage({ chat_id: chatId, text: responseMessage });
                reloadServer(chatId);
            }
            break;
        case 'restart':
            responseMessage = 'Restarting server-side components...';
            // If SillyTavern is connected, run the UI refresh
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // If not connected, restart the server directly
                bot.api.sendMessage({ chat_id: chatId, text: responseMessage });
                restartServer(chatId);
            }
            break;
        case 'exit':
            responseMessage = 'Shutting down server-side components...';
            // If SillyTavern is connected, run the UI refresh
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // If not connected, exit the server directly
                bot.api.sendMessage({ chat_id: chatId, text: responseMessage });
                exitServer();
            }
            break;
        default:
            logWithTimestamp('warn', `Unknown system command: ${command}`);
            bot.api.sendMessage({ chat_id: chatId, text: `Unknown system command: /${command}` });
            return;
    }

    // Only when SillyTavern is connected is the message sent in the switch statement above
    // So here the response message is only sent when SillyTavern is connected
    if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
        bot.api.sendMessage({ chat_id: chatId, text: responseMessage });
    }
}

// Handle Telegram command
async function handleTelegramCommand(command, args, chatId) {
    logWithTimestamp('log', `Handling Telegram command: /${command} ${args.join(' ')}`);

    // Show the 'typing' status
    bot.api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(error =>
        logWithTimestamp('error', 'Failed to send "typing" status:', error));

    // Default reply
    let replyText = `Unknown command: /${command}. Use /help to see all commands.`;

    // Special handling of the help command, shown regardless of whether SillyTavern is connected
    if (command === 'help') {
        replyText = `SillyTavern Telegram Bridge commands:

\n\n`;
        replyText += `Chat management\n`;
        replyText += `/new - Start a new chat with the current character.\n`;
        replyText += `/listchats - List all saved chat records for the current character.\n`;
        replyText += `/switchchat <chat_name> - Load a specific chat record.\n`;
        replyText += `/switchchat_<number> - Load a chat record by its number.\n\n`;
        replyText += `Character management\n`;
        replyText += `/listchars - List all available characters.\n`;
        replyText += `/switchchar <char_name> - Switch to a specific character.\n`;
        replyText += `/switchchar_<number> - Switch character by its number.\n\n`;
        replyText += `System management\n`;
        replyText += `/reload - Reload the plugin's server-side components and refresh the ST web page.\n`;
        replyText += `/restart - Refresh the ST web page and restart the plugin's server-side components.\n`;
        replyText += `/exit - Exit the plugin's server-side components.\n`;
        replyText += `/ping - Check the connection status.\n\n`;
        replyText += `Help\n`;
        replyText += `/help - Show this help message.`;

        // Send the help message and return
        bot.api.sendMessage({ chat_id: chatId, text: replyText }).catch(err => {
            logWithTimestamp('error', `Failed to send command reply: ${err.message}`);
        });
        return;
    }

    // Check whether SillyTavern is connected
    if (!sillyTavernClient || sillyTavernClient.readyState !== WebSocket.OPEN) {
        bot.api.sendMessage({ chat_id: chatId, text: 'SillyTavern is not connected and cannot run character/chat commands. Please make sure SillyTavern is open and the Telegram extension is enabled.' });
        return;
    }

    // Handle by command type
    switch (command) {
        case 'new':
            // Send the command to the frontend to execute
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'new',
                chatId: chatId
            }));
            return; // The frontend will send the response, so return directly here
        case 'listchars':
            // Send the command to the frontend to execute
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'listchars',
                chatId: chatId
            }));
            return;
        case 'switchchar':
            if (args.length === 0) {
                replyText = 'Please provide a character name or number. Usage: /switchchar <character name> or /switchchar_<number>';
            } else {
                // Send the command to the frontend to execute
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: 'switchchar',
                    args: args,
                    chatId: chatId
                }));
                return;
            }
            break;
        case 'listchats':
            // Send the command to the frontend to execute
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'listchats',
                chatId: chatId
            }));
            return;
        case 'switchchat':
            if (args.length === 0) {
                replyText = 'Please provide a chat record name. Usage: /switchchat <chat record name>';
            } else {
                // Send the command to the frontend to execute
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: 'switchchat',
                    args: args,
                    chatId: chatId
                }));
                return;
            }
            break;
        default:
            // Handle special command formats, such as switchchar_1, switchchat_2, etc.
            const charMatch = command.match(/^switchchar_(\d+)$/);
            if (charMatch) {
                // Send the command to the frontend to execute
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: command, // Keep the original command format
                    chatId: chatId
                }));
                return;
            }

            const chatMatch = command.match(/^switchchat_(\d+)$/);
            if (chatMatch) {
                // Send the command to the frontend to execute
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: command, // Keep the original command format
                    chatId: chatId
                }));
                return;
            }
    }

    // Send the reply
    bot.api.sendMessage({ chat_id: chatId, text: replyText }).catch(err => {
        logWithTimestamp('error', `Failed to send command reply: ${err.message}`);
    });
}

// --- WebSocket server logic ---
wss.on('connection', ws => {
    logWithTimestamp('log', 'SillyTavern extension connected!');
    sillyTavernClient = ws;

    ws.on('message', async (message) => { // Make the whole callback async
        let data; // Declare data outside the try block
        try {
            data = JSON.parse(message);

            // --- Handle streaming text chunks ---
            if (data.type === 'stream_chunk' && data.chatId) {
                let session = ongoingStreams.get(data.chatId);

                // 1. If the session does not exist, immediately create a placeholder session in sync; create the session and messagePromise
                if (!session) {
                    // Use let so it can be accessed inside the Promise
                    let resolveMessagePromise;
                    const messagePromise = new Promise(resolve => {
                        resolveMessagePromise = resolve;
                    });

                    session = {
                        messagePromise: messagePromise,
                        lastText: data.text,
                        timer: null,
                        isEditing: false, // New state lock
                    };
                    ongoingStreams.set(data.chatId, session);

                    // Asynchronously send the first message and update the session
                    bot.api.sendMessage({ chat_id: data.chatId, text: 'Thinking...' })
                        .then(sentMessage => {
                            // When the message is sent successfully, resolve the Promise with the messageId
                            resolveMessagePromise(sentMessage.message_id);
                        }).catch(err => {
                            logWithTimestamp('error', 'Failed to send initial Telegram message:', err);
                            ongoingStreams.delete(data.chatId); // Clean up on error
                        });
                } else {
                    // 2. If the session exists, only update the latest text
                    session.lastText = data.text;
                }

                // 3. Try to trigger one edit (throttling protection)
                // Make sure messageId has been obtained and there is no ongoing edit or timer
                // Use await on messagePromise to make sure messageId is available
                const messageId = await session.messagePromise;

                if (messageId && !session.isEditing && !session.timer) {
                    session.timer = setTimeout(async () => { // The timer callback is also made async
                        const currentSession = ongoingStreams.get(data.chatId);
                        if (currentSession) {
                            const currentMessageId = await currentSession.messagePromise;
                            if (currentMessageId) {
                                currentSession.isEditing = true;
                                bot.api.editMessageText({ text: currentSession.lastText + ' ...', ...{
                                    chat_id: data.chatId,
                                    message_id: currentMessageId,
                                } }).catch(err => {
                                    if (!err.message.includes('message is not modified'))
                                        logWithTimestamp('error', 'Failed to edit Telegram message:', err.message);
                                }).finally(() => {
                                    if (ongoingStreams.has(data.chatId)) ongoingStreams.get(data.chatId).isEditing = false;
                                });
                            }
                            currentSession.timer = null;
                        }
                    }, 2000);
                }
                return;
            }

            // --- Handle stream-end signal ---
            if (data.type === 'stream_end' && data.chatId) {
                const session = ongoingStreams.get(data.chatId);
                // Only handle when a session exists, which confirms streaming is really happening
                if (session) {
                    if (session.timer) {
                        clearTimeout(session.timer);
                    }
                    logWithTimestamp('log', `Received stream-end signal, waiting for final rendered text update...`);
                    // Note: we do not clean up the session here; we wait for final_message_update
                }
                // If no session exists but a stream_end is received, this is an anomaly
                // The session may have been cleaned up early for some reason
                else {
                    logWithTimestamp('warn', `Received stream-end signal but no matching session for ChatID ${data.chatId}`);
                    // For safety we still send the message, but this should not happen
                    await bot.api.sendMessage({ chat_id: data.chatId, text: data.text || "Message generation complete" }).catch(err => {
                        logWithTimestamp('error', 'Failed to send stream-end message:', err.message);
                    });
                }
                return;
            }

            // --- Handle final rendered message update ---
            if (data.type === 'final_message_update' && data.chatId) {
                const session = ongoingStreams.get(data.chatId);

                // If a session exists, this is the final update of the streaming
                if (session) {
                    // Use await on messagePromise
                    const messageId = await session.messagePromise;
                    if (messageId) {
                        logWithTimestamp('log', `Received the final rendered streaming text; updating message ${messageId}`);
                        await bot.api.editMessageText({ text: data.text, ...{
                            chat_id: data.chatId,
                            message_id: messageId,
                            // Optional: specify parse_mode here: 'MarkdownV2' or 'HTML'
                            // parse_mode: 'HTML',
                        } }).catch(err => {
                            if (!err.message.includes('message is not modified'))
                                logWithTimestamp('error', 'Failed to edit the final formatted Telegram message:', err.message);
                        });
                        logWithTimestamp('log', `The near-final streaming update for ChatID ${data.chatId} has been sent.`);
                    } else {
                        logWithTimestamp('warn', `Received final_message_update but the stream session's messageId could not be obtained.`);
                    }
                    // Clean up the streaming session
                    ongoingStreams.delete(data.chatId);
                    logWithTimestamp('log', `The streaming session for ChatID ${data.chatId} is done and cleaned up.`);
                }
                // If no session exists, this is a complete non-streaming reply
                // Note: this should not happen because we already fixed it on the client side
                // But for robustness we keep this handling
                else {
                    logWithTimestamp('log', `Received a complete non-streaming reply; sending a new message directly to ChatID ${data.chatId}`);
                    await bot.api.sendMessage({ chat_id: data.chatId, text: data.text, ...{
                        // Optional: specify parse_mode here
                    } }).catch(err => {
                        logWithTimestamp('error', 'Failed to send the complete non-streaming reply:', err.message);
                    });
                }
                return;
            }

            // --- Other message handling logic ---
            if (data.type === 'error_message' && data.chatId) {
                logWithTimestamp('error', `Received an error report from SillyTavern, will send to Telegram user ${data.chatId}: ${data.text}`);
                bot.api.sendMessage({ chat_id: data.chatId, text: data.text });
            } else if (data.type === 'ai_reply' && data.chatId) {
                logWithTimestamp('log', `Received a non-streaming AI reply, sending to Telegram user ${data.chatId}`);
                // Make sure to clean up any existing streaming session before sending the message
                if (ongoingStreams.has(data.chatId)) {
                    logWithTimestamp('log', `Clean up the streaming session for ChatID ${data.chatId} because a non-streaming reply was received`);
                    ongoingStreams.delete(data.chatId);
                }
                // Send the non-streaming reply
                await bot.api.sendMessage({ chat_id: data.chatId, text: data.text }).catch(err => {
                    logWithTimestamp('error', `Failed to send the non-streaming AI reply: ${err.message}`);
                });
            } else if (data.type === 'typing_action' && data.chatId) {
                logWithTimestamp('log', `Show 'typing' status to Telegram user ${data.chatId}`);
                bot.api.sendChatAction({ chat_id: data.chatId, action: 'typing' }).catch(error =>
                    logWithTimestamp('error', 'Failed to send "typing" status:', error));
            } else if (data.type === 'command_executed') {
                // Handle the frontend command execution result
                logWithTimestamp('log', `Command ${data.command} finished, result: ${data.success ? 'success' : 'failed'}`);
                if (data.message) {
                    logWithTimestamp('log', `Command execution message: ${data.message}`);
                }
            }
        } catch (error) {
            logWithTimestamp('error', 'Error handling SillyTavern message:', error);
            // Make sure to clean up even when JSON parsing fails
            if (data && data.chatId) {
                ongoingStreams.delete(data.chatId);
            }
        }
    });

    ws.on('close', () => {
        logWithTimestamp('log', 'SillyTavern extension disconnected.');
        if (ws.commandToExecuteOnClose) {
            const { command, chatId } = ws.commandToExecuteOnClose;
            logWithTimestamp('log', `Client disconnected, now executing the queued command: ${command}`);
            if (command === 'reload') reloadServer(chatId);
            if (command === 'restart') restartServer(chatId);
            if (command === 'exit') exitServer(chatId);
        }
        sillyTavernClient = null;
        ongoingStreams.clear();
    });

    ws.on('error', (error) => {
        logWithTimestamp('error', 'WebSocket error:', error);
        if (sillyTavernClient) {
            sillyTavernClient.commandToExecuteOnClose = null; // Clear the flag to prevent accidental execution
        }
        sillyTavernClient = null;
        ongoingStreams.clear();
    });
});

// Check whether a restart-completion notification needs to be sent
if (process.env.RESTART_NOTIFY_CHATID) {
    const chatId = parseInt(process.env.RESTART_NOTIFY_CHATID);
    if (!isNaN(chatId)) {
        setTimeout(() => {
            bot.api.sendMessage({ chat_id: chatId, text: 'Server-side components restarted successfully and are ready' })
                .catch(err => logWithTimestamp('error', 'Failed to send restart notification:', err))
                .finally(() => {
                    delete process.env.RESTART_NOTIFY_CHATID;
                });
        }, 2000);
    }
}

// Listen for Telegram messages
bot.on('message', (msg) => {
    // node-telegram-bot-api@2.3.0 may pass a raw update wrapper
    // ({update:{message:{...}}, api, state}) instead of a plain message.
    // In that case msg.text is undefined while the real data lives in msg.update.message.
    const inner = (msg && msg.update && msg.update.message) || msg;
    const chatId = (msg.chat && msg.chat.id) || (inner.chat && inner.chat.id);
    const text = (msg.text != null ? msg.text : inner.text) || (inner.message && inner.message.text);
    const userId = (msg.from && msg.from.id) || (inner.from && inner.from.id);
    const username = (msg.from && msg.from.username) || (inner.from && inner.from.username) || 'N/A';

    // Check whether the whitelist is configured and not empty
    if (config.allowedUserIds && config.allowedUserIds.length > 0) {
        // If the current user's ID is not in the whitelist
        if (!config.allowedUserIds.includes(userId)) {
            logWithTimestamp('log', `Denied access from a non-whitelisted user:\n  - User ID: ${userId}\n  - Username: @${username}\n  - Chat ID: ${chatId}\n  - Message: "${text}"`);
            // Send a rejection message to this user
            bot.api.sendMessage({ chat_id: chatId, text: 'Sorry, you do not have permission to use this bot.' }).catch(err => {
                logWithTimestamp('error', `Failed to send the rejection message to ${chatId}:`, err.message);
            });
            // Terminate further processing
            return;
        }
    }

    if (!text) return;

    if (text.startsWith('/')) {
        const parts = text.slice(1).trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // System commands are handled directly by the server
        if (['reload', 'restart', 'exit', 'ping'].includes(command)) {
            handleSystemCommand(command, chatId);
            return;
        }

        // Other commands are also handled by the server, but the frontend may need to execute them
        handleTelegramCommand(command, args, chatId);
        return;
    }

    // Handle regular messages
    if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
        logWithTimestamp('log', `Received message from Telegram user ${chatId}: "${text}"`);
        const payload = JSON.stringify({ type: 'user_message', chatId, text });
        sillyTavernClient.send(payload);
    } else {
        logWithTimestamp('warn', 'Received a Telegram message but the SillyTavern extension is not connected.');
        bot.api.sendMessage({ chat_id: chatId, text: 'Sorry, I cannot connect to SillyTavern right now. Please make sure SillyTavern is open and the Telegram extension is enabled.' });
    }
});
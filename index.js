// index.js

// Only destructure the properties that actually exist in the object returned by getContext()
const {
    extensionSettings,
    deleteLastMessage, // Import the function that deletes the last message
    saveSettingsDebounced, // Import the function that saves settings
} = SillyTavern.getContext();

// The getContext function is part of the global SillyTavern object; we do not need to import it from anywhere
// Just call SillyTavern.getContext() directly when needed

// Import all needed public API functions from script.js
import {
    eventSource,
    event_types,
    getPastCharacterChats,
    sendMessageAsUser,
    doNewChat,
    selectCharacterById,
    openCharacterChat,
    Generate,
    setExternalAbortController,
} from "../../../../script.js";

const MODULE_NAME = 'SillyTavern-Telegram-Connector';
const DEFAULT_SETTINGS = {
    bridgeUrl: 'ws://127.0.0.1:2333',
    autoConnect: true,
};

let ws = null; // WebSocket instance
let lastProcessedChatId = null; // Used to store the last processed Telegram chatId

// Add a global variable to track whether we are currently in streaming mode
let isStreamingMode = false;

// --- Utility functions ---
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }
    return extensionSettings[MODULE_NAME];
}

function updateStatus(message, color) {
    const statusEl = document.getElementById('telegram_connection_status');
    if (statusEl) {
        statusEl.textContent = `Status: ${message}`;
        statusEl.style.color = color;
    }
}

function reloadPage() {
    window.location.reload();
}
// ---

// Connect to the WebSocket server
function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[Telegram Bridge] Connected');
        return;
    }

    const settings = getSettings();
    if (!settings.bridgeUrl) {
        updateStatus('URL not set!', 'red');
        return;
    }

    updateStatus('Connecting...', 'orange');
    console.log(`[Telegram Bridge] Connecting to ${settings.bridgeUrl}...`);

    ws = new WebSocket(settings.bridgeUrl);

    ws.onopen = () => {
        console.log('[Telegram Bridge] Connected successfully!');
        updateStatus('Connected', 'green');
    };

    ws.onmessage = async (event) => {
        let data;
        try {
            data = JSON.parse(event.data);

            // --- User message handling ---
            if (data.type === 'user_message') {
                console.log('[Telegram Bridge] Received a user message.', data);

                // Store the currently processed chatId
                lastProcessedChatId = data.chatId;

                // By default, assume this is not a streaming response
                isStreamingMode = false;

                // 1. Immediately send the 'typing' status to Telegram (regardless of streaming)
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }

                // 2. Add the user message to SillyTavern
                await sendMessageAsUser(data.text);

                // 3. Set up the streaming callback
                const streamCallback = (cumulativeText) => {
                    // Mark as streaming mode
                    isStreamingMode = true;
                    // Send each text chunk to the server via WebSocket
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'stream_chunk',
                            chatId: data.chatId,
                            text: cumulativeText,
                        }));
                    }
                };
                eventSource.on(event_types.STREAM_TOKEN_RECEIVED, streamCallback);

                // 4. Define a cleanup function
                const cleanup = () => {
                    eventSource.removeListener(event_types.STREAM_TOKEN_RECEIVED, streamCallback);
                    if (ws && ws.readyState === WebSocket.OPEN && isStreamingMode) {
                        // Only send stream_end when there is no error and streaming mode is really active
                        if (!data.error) {
                            ws.send(JSON.stringify({ type: 'stream_end', chatId: data.chatId }));
                        }
                    }
                    // Note:Do not reset isStreamingMode here; let the handleFinalMessage function handle it
                };

                // 5. Listen for the generation-ended event to make sure cleanup runs whether it succeeds or not
                // Note: We now use once to make sure this listener runs only once and does not interfere with the subsequent global listener
                eventSource.once(event_types.GENERATION_ENDED, cleanup);
                // Add handling for manually stopping generation
                eventSource.once(event_types.GENERATION_STOPPED, cleanup);

                // 6. Trigger SillyTavern's generation flow, wrapped in try...catch
                try {
                    const abortController = new AbortController();
                    setExternalAbortController(abortController);
                    await Generate('normal', { signal: abortController.signal });
                } catch (error) {
                    console.error("[Telegram Bridge] Generate() error:", error);

                    // a. Delete the user message that caused the error from the SillyTavern chat history
                    await deleteLastMessage();
                    console.log('[Telegram Bridge] Deleted the user message that caused the error.');

                    // b. Prepare and send the error message to the server
                    const errorMessage = `Sorry, an error occurred while the AI generated a reply.\nYour previous message has been removed. Please retry or send something different.\n\nError details: ${error.message || 'unknown error'}`;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'error_message',
                            chatId: data.chatId,
                            text: errorMessage,
                        }));
                    }

                    // c. Mark the error so the cleanup function knows about it
                    data.error = true;
                    cleanup(); // Make sure to clean up the listener
                }

                return;
            }

            // --- System command handling ---
            if (data.type === 'system_command') {
                console.log('[Telegram Bridge] Received a system command', data);
                if (data.command === 'reload_ui_only') {
                    console.log('[Telegram Bridge] Refreshing the UI...');
                    setTimeout(reloadPage, 500);
                }
                return;
            }

            // --- Execute command handling ---
            if (data.type === 'execute_command') {
                console.log('[Telegram Bridge] Executing command', data);

                // Show the 'typing' status
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }

                let replyText = 'Command execution failed. Please try again later.';

                // Call the global SillyTavern.getContext() directly
                const context = SillyTavern.getContext();
                let commandSuccess = false;

                try {
                    switch (data.command) {
                        case 'new':
                            await doNewChat({ deleteCurrentChat: false });
                            replyText = 'A new chat has started.';
                            commandSuccess = true;
                            break;
                        case 'listchars': {
                            const characters = context.characters.slice(1);
                            if (characters.length > 0) {
                                replyText = 'Available characters list:

';
                                characters.forEach((char, index) => {
                                    replyText += `${index + 1}. /switchchar_${index + 1} - ${char.name}\n`;
                                });
                                replyText += '\nUse /switchchar_<number> or /switchchar <character name> to switch characters';
                            } else {
                                replyText = 'No characters found.';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchar': {
                            if (!data.args || data.args.length === 0) {
                                replyText = 'Please provide a character name or number. Usage: /switchchar <character name> or /switchchar_<number>';
                                break;
                            }
                            const targetName = data.args.join(' ');
                            const characters = context.characters;
                            const targetChar = characters.find(c => c.name === targetName);

                            if (targetChar) {
                                const charIndex = characters.indexOf(targetChar);
                                await selectCharacterById(charIndex);
                                replyText = `Successfully switched to character "${targetName}".`;
                                commandSuccess = true;
                            } else {
                                replyText = `Character "${targetName}" not found.`;
                            }
                            break;
                        }
                        case 'listchats': {
                            if (context.characterId === undefined) {
                                replyText = 'Please select a character first.';
                                break;
                            }
                            const chatFiles = await getPastCharacterChats(context.characterId);
                            if (chatFiles.length > 0) {
                                replyText = 'Chat records for the current character:

';
                                chatFiles.forEach((chat, index) => {
                                    const chatName = chat.file_name.replace('.jsonl', '');
                                    replyText += `${index + 1}. /switchchat_${index + 1} - ${chatName}\n`;
                                });
                                replyText += '\nUse /switchchat_<number> or /switchchat <chat name> to switch chats';
                            } else {
                                replyText = 'The current character has no chat records.';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchat': {
                            if (!data.args || data.args.length === 0) {
                                replyText = 'Please provide a chat record name. Usage: /switchchat <chat record name>';
                                break;
                            }
                            const targetChatFile = `${data.args.join(' ')}`;
                            try {
                                await openCharacterChat(targetChatFile);
                                replyText = `Loaded chat record: ${targetChatFile}`;
                                commandSuccess = true;
                            } catch (err) {
                                console.error(err);
                                replyText = `Failed to load chat record "${targetChatFile}". Please make sure the name is exactly correct.`;
                            }
                            break;
                        }
                        default: {
                            // Handle special command formats, such as switchchar_1, switchchat_2, etc.
                            const charMatch = data.command.match(/^switchchar_(\d+)$/);
                            if (charMatch) {
                                const index = parseInt(charMatch[1]) - 1;
                                const characters = context.characters.slice(1);
                                if (index >= 0 && index < characters.length) {
                                    const targetChar = characters[index];
                                    const charIndex = context.characters.indexOf(targetChar);
                                    await selectCharacterById(charIndex);
                                    replyText = `Switched to character "${targetChar.name}".`;
                                    commandSuccess = true;
                                } else {
                                    replyText = `Invalid character number: ${index + 1}. Use /listchars to see available characters.`;
                                }
                                break;
                            }

                            const chatMatch = data.command.match(/^switchchat_(\d+)$/);
                            if (chatMatch) {
                                if (context.characterId === undefined) {
                                    replyText = 'Please select a character first.';
                                    break;
                                }
                                const index = parseInt(chatMatch[1]) - 1;
                                const chatFiles = await getPastCharacterChats(context.characterId);

                                if (index >= 0 && index < chatFiles.length) {
                                    const targetChat = chatFiles[index];
                                    const chatName = targetChat.file_name.replace('.jsonl', '');
                                    try {
                                        await openCharacterChat(chatName);
                                        replyText = `Loaded chat record: ${chatName}`;
                                        commandSuccess = true;
                                    } catch (err) {
                                        console.error(err);
                                        replyText = `Failed to load chat record.`;
                                    }
                                } else {
                                    replyText = `Invalid chat record number: ${index + 1}. Use /listchats to see available chat records.`;
                                }
                                break;
                            }

                            replyText = `Unknown command: /${data.command}. Use /help to see all commands.`;
                        }
                    }
                } catch (error) {
                    console.error('[Telegram Bridge] Error executing command:', error);
                    replyText = `Error executing command: ${error.message || 'unknown error'}`;
                }

                // Send the command execution result
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Send the command execution result to Telegram
                    ws.send(JSON.stringify({ type: 'ai_reply', chatId: data.chatId, text: replyText }));

                    // Send the command execution status feedback to the server
                    ws.send(JSON.stringify({
                        type: 'command_executed',
                        command: data.command,
                        success: commandSuccess,
                        message: replyText
                    }));
                }

                return;
            }
        } catch (error) {
            console.error('[Telegram Bridge] An error occurred while processing the request:', error);
            if (data && data.chatId && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error_message', chatId: data.chatId, text: 'An internal error occurred while processing your request.' }));
            }
        }
    };

    ws.onclose = () => {
        console.log('[Telegram Bridge] Connection closed.');
        updateStatus('Connection disconnected', 'red');
        ws = null;
    };

    ws.onerror = (error) => {
        console.error('[Telegram Bridge] WebSocket error:', error);
        updateStatus('Connection error', 'red');
        ws = null;
    };
}

function disconnect() {
    if (ws) {
        ws.close();
    }
}

// Function executed when the extension loads
jQuery(async () => {
    console.log('[Telegram Bridge] Trying to load the settings UI...');
    try {
        const settingsHtml = await $.get(`/scripts/extensions/third-party/${MODULE_NAME}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        console.log('[Telegram Bridge] The settings UI should have been added.');

        const settings = getSettings();
        $('#telegram_bridge_url').val(settings.bridgeUrl);
        $('#telegram_auto_connect').prop('checked', settings.autoConnect);

        $('#telegram_bridge_url').on('input', () => {
            const settings = getSettings();
            settings.bridgeUrl = $('#telegram_bridge_url').val();
            // Make sure to call saveSettingsDebounced to save the settings
            saveSettingsDebounced();
        });

        $('#telegram_auto_connect').on('change', function () {
            const settings = getSettings();
            settings.autoConnect = $(this).prop('checked');
            // Make sure to call saveSettingsDebounced to save the settings
            console.log(`[Telegram Bridge] Auto-connect setting changed to: ${settings.autoConnect}`);
            saveSettingsDebounced();
        });

        $('#telegram_connect_button').on('click', connect);
        $('#telegram_disconnect_button').on('click', disconnect);

        if (settings.autoConnect) {
            console.log('[Telegram Bridge] Auto-connect is enabled, connecting...');
            connect();
        }

    } catch (error) {
        console.error('[Telegram Bridge] Failed to load settings HTML.', error);
    }
    console.log('[Telegram Bridge] Extension loaded.');
});

// Global event listener for the final message update
function handleFinalMessage(lastMessageIdInChatArray) {
    // Make sure the WebSocket is connected and we have a valid chatId to send updates
    if (!ws || ws.readyState !== WebSocket.OPEN || !lastProcessedChatId) {
        return;
    }

    const lastMessageIndex = lastMessageIdInChatArray - 1;
    if (lastMessageIndex < 0) return;

    // Delay to make sure the DOM update is complete
    setTimeout(() => {
        // Call the global SillyTavern.getContext() directly
        const context = SillyTavern.getContext();
        const lastMessage = context.chat[lastMessageIndex];

        // Confirm this is the AI reply we just triggered via Telegram
        if (lastMessage && !lastMessage.is_user && !lastMessage.is_system) {
            const messageElement = $(`#chat .mes[mesid="${lastMessageIndex}"]`);

            if (messageElement.length > 0) {
                // Get the message text element
                const messageTextElement = messageElement.find('.mes_text');

                // Get the HTML content and replace <br> and </p><p> with line breaks
                let renderedText = messageTextElement.html()
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>\s*<p>/gi, '\n\n')
                // .replace(/<[^>]*>/g, ''); // Remove all other HTML tags

                // Decode HTML entities
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderedText;
                renderedText = tempDiv.textContent;

                console.log(`[Telegram Bridge] Captured the final rendered text, preparing to send the update to chatId: ${lastProcessedChatId}`);

                // Determine whether this is a streaming or non-streaming response
                if (isStreamingMode) {
                    // Streaming response - send final_message_update
                    ws.send(JSON.stringify({
                        type: 'final_message_update',
                        chatId: lastProcessedChatId,
                        text: renderedText,
                    }));
                    // Reset the streaming mode flag
                    isStreamingMode = false;
                } else {
                    // Non-streaming response - send ai_reply directly
                    ws.send(JSON.stringify({
                        type: 'ai_reply',
                        chatId: lastProcessedChatId,
                        text: renderedText,
                    }));
                }

                // Reset the chatId to avoid accidentally updating another user's message
                lastProcessedChatId = null;
            }
        }
    }, 100);
}

// Global event listener for the final message update
eventSource.on(event_types.GENERATION_ENDED, handleFinalMessage);

// Add handling for manually stopping generation
eventSource.on(event_types.GENERATION_STOPPED, handleFinalMessage);
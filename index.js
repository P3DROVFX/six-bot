/**
 * WhatsApp Game Price Monitor Bot - Main Entry Point
 * 
 * This bot monitors game prices across multiple stores (Steam, Epic Games, Microsoft Store)
 * and sends notifications to users when prices drop below their target threshold.
 * 
 * Features:
 * - Multi-store price monitoring
 * - Automatic price updates every 2 hours
 * - User notifications every 3 hours
 * - Price history tracking with visual charts
 * - WhatsApp integration using Baileys library
 */

const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const logger = require('pino')({ level: 'trace' });
const { hidePrivateData } = require("./utils");

// Import connection and message handlers
const { handleConnectionUpdate } = require('./src/handlers/connectionHandler');
const { handleMessage } = require('./src/handlers/messageHandler');

// Import core services
const { updateGlobalGamesPrices } = require('./src/services/gameService');
const { sendMessages } = require('./src/services/NotificationService');

// Import configuration constants
const { 
    AUTH_FOLDER, 
    UPDATE_INTERVAL, 
    NOTIFICATIONS_INTERVAL, 
    INITIAL_CHECK_DELAY 
} = require('./src/config/constants');

let sock; // WhatsApp socket connection instance

/**
 * Initializes and starts the WhatsApp bot
 * 
 * This function:
 * 1. Sets up authentication using multi-file auth state
 * 2. Creates WhatsApp socket connection
 * 3. Registers event handlers for connection updates, messages, and credentials
 * 4. Configures automatic tasks for price monitoring
 */
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        // logger: logger, // Uncomment for detailed Baileys debug logs
        markOnlineOnConnect: false // Keep bot status offline for privacy
    });

    // Handle connection status changes (QR code, reconnection, disconnection)
    sock.ev.on("connection.update", (update) => {
        handleConnectionUpdate(update, sock, startBot);
    });

    // Handle incoming messages from users
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        // Process each message individually
        for (const message of messages) {
            await handleMessage(message, sock);
        }
    });

    // Handle credential updates (save authentication state)
    sock.ev.on("creds.update", saveCreds);

    // Setup automatic price checking and notification tasks
    setupAutomaticTasks();
}

/**
 * Configures automatic recurring tasks for the bot
 * 
 * Sets up three main tasks:
 * 1. Update global game prices every 2 hours
 * 2. Check and send price notifications every 3 hours
 * 3. Initial price check 30 seconds after bot starts
 */
function setupAutomaticTasks() {
    // Update global price history at regular intervals
    setInterval(() => {
        updateGlobalGamesPrices().catch((error) => {
            console.error("Error updating global prices:", error);
        });
    }, UPDATE_INTERVAL);
    
    // Check monitored games and send notifications to users
    setInterval(() => {
        sendMessages(sock).catch((error) => {
            console.error("Error sending notifications:", error);
        });
    }, NOTIFICATIONS_INTERVAL);
    
    // Run initial price check shortly after startup
    setTimeout(() => {
        updateGlobalGamesPrices().catch((error) => {
            console.error("Error in initial price check:", error);
        });
    }, INITIAL_CHECK_DELAY);
}

// Auto-start the bot unless explicitly disabled (useful for testing)
if (process.env.SKIP_BOT_AUTO_START !== 'true') {
    startBot();
}

// Export functions for potential use in other modules
module.exports = {
    startBot,
    getSock: () => sock
};
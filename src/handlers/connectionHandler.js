/**
 * WhatsApp Connection Handler
 * 
 * Manages all WhatsApp connection lifecycle events including:
 * - QR code generation for authentication
 * - Connection status monitoring
 * - Automatic reconnection on disconnects
 * - Error handling for various disconnect reasons
 */

const { DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require("@hapi/boom");
const logger = require('../utils/logger');
const { testITADAPIKey } = require('../services/apiService');

/**
 * Handles WhatsApp connection updates and state changes
 * 
 * @param {Object} update - Connection update object from Baileys
 * @param {Object} sock - WhatsApp socket instance
 * @param {Function} startBot - Function to restart the bot on disconnect
 */
async function handleConnectionUpdate(update, sock, startBot) {
    const { connection, lastDisconnect, qr } = update;
    logger.bot('CONNECTION', `Connection status: ${update.connection}`);

    // Display QR code when received for user authentication
    if (qr) {
        logger.bot('CONNECTION', 'QR code received. Scan to authenticate.');
        qrcode.generate(qr, { small: true });
    }

    // Handle connection closure with appropriate reconnection logic
    if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (reason === DisconnectReason.badSession) {
            logger.error('CONNECTION', "Invalid session. Delete 'baileys_auth_info' folder and scan QR code again.");
            logger.baileysError('BAD_SESSION', lastDisconnect?.error);
            startBot();
        } else if (reason === DisconnectReason.connectionClosed) {
            logger.warning('CONNECTION', 'Connection closed. Reconnecting...');
            logger.baileysError('CONNECTION_CLOSED', lastDisconnect?.error);
            startBot();
        } else if (reason === DisconnectReason.connectionLost) {
            logger.warning('CONNECTION', 'Connection lost. Reconnecting...');
            logger.baileysError('CONNECTION_LOST', lastDisconnect?.error);
            startBot();
        } else if (reason === DisconnectReason.connectionReplaced) {
            logger.warning('CONNECTION', 'Connection replaced. A new session was opened on another device.');
            // Don't call logout as connection is already closed
        } else if (reason === DisconnectReason.loggedOut) {
            logger.error('CONNECTION', "Logged out. Delete 'baileys_auth_info' folder and scan QR code again.");
            // Don't call logout as connection is already closed
        } else if (reason === DisconnectReason.restartRequired) {
            logger.warning('CONNECTION', 'Restart required. Restarting bot...');
            startBot();
        } else if (reason === DisconnectReason.timedOut) {
            logger.warning('CONNECTION', 'Connection timed out. Reconnecting...');
            logger.baileysError('TIMEOUT', lastDisconnect?.error);
            startBot();
        } else if (reason === 405) {
            logger.error('CONNECTION', 'Invalid session after update. Delete "baileys_auth_info" folder and scan QR code again.');
            logger.baileysError('SESSION_405', lastDisconnect?.error);
        } else {
            logger.error('CONNECTION', `Unknown disconnect reason: ${reason}`);
            logger.baileysError('UNKNOWN_DISCONNECT', lastDisconnect?.error);
        }
    } else if (connection === "open") {
        logger.success('CONNECTION', 'Connection established successfully!');

        // Test IsThereAnyDeal API (uncomment if needed)
        // await testITADAPIKey();
    }
}

module.exports = {
    handleConnectionUpdate
};
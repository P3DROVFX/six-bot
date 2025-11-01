/**
 * Privacy Utilities
 * 
 * Helper functions for handling sensitive user data in logs and debug output.
 */

/**
 * Sanitizes WhatsApp message data by hiding private information
 * 
 * This function creates a safe copy of message data with phone numbers
 * partially masked for privacy protection in logs.
 * 
 * @param {Object} data - Raw message data from Baileys
 * @returns {Object} Sanitized message data safe for logging
 * 
 * @example
 * // Phone number 5587996443783 becomes 55xxxxxxxx
 * const safe = hidePrivateData(message);
 */
const hidePrivateData = (data) => {
    // Create a safe copy of the object, removing non-serializable data
    const safeData = {
        key: {
            // Mask phone numbers: keep first 2 digits, replace rest with 'x'
            remoteJid: data.key?.remoteJid?.replace(/\d{10}/g, (m) => `${m.slice(0, 2)}xxxxxxxx`),
            id: data.key?.id,
        },
        message: {
            conversation: data.message?.conversation,
            extendedTextMessage: data.message?.extendedTextMessage
                ? {
                      text: data.message.extendedTextMessage.text,
                  }
                : undefined,
        },
        timestamp: data.timestamp,
    };

    return safeData;
};

module.exports = { hidePrivateData };
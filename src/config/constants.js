/**
 * Project Configuration Constants
 * 
 * This file contains all the configuration constants used throughout the bot.
 * Make sure to configure your ITAD_API_KEY before running the bot.
 */

// Currency and Data Storage Configuration
const CURRENCY = 'BRL'; // Currency code for price display and conversions
const HISTORY_FILE = 'history.json'; // Unified file storing game information and price history
const HISTORY_EPIC_FILE = 'historyEpicGames.json'; // Epic Games Store price history storage
const HISTORY_MICROSOFT_FILE = 'historyMicrosoft.json'; // Microsoft Store price history storage
const MONITORED_GAMES_FILE = 'monitored_games.json'; // File tracking games monitored by each user/group

// IsThereAnyDeal API Configuration
// Get your API key at: https://isthereanydeal.com/apps/my/
const ITAD_API_KEY = ''; // TODO: Add your IsThereAnyDeal API key here
const ITAD_BASE_URL = 'https://api.isthereanydeal.com'; // Base URL for ITAD API requests
const ITAD_COUNTRY = 'BR'; // Country code for regional pricing (ISO 3166-1 alpha-2)

// Store IDs for IsThereAnyDeal API
// These IDs were verified on 2025-10-04 via /games/history/v2 endpoint
const STEAM_SHOP_ID = '61'; // Steam store identifier
const EPIC_GAMES_SHOP_ID = '16'; // Epic Game Store identifier
const MICROSOFT_SHOP_ID = '48'; // Microsoft Store identifier

// Automatic Task Intervals (in milliseconds)
const UPDATE_INTERVAL = 7200000; // Price update check interval (2 hours)
const NOTIFICATIONS_INTERVAL = 10800000; // User notification interval (3 hours)
const INITIAL_CHECK_DELAY = 30000; // Delay before first price check after startup (30 seconds)

// Rate Limiting Configuration
// These delays prevent API rate limiting and ensure smooth operation
const DEFAULT_DELAY_MS = 1000; // Standard delay between API requests (1 second)
const BULK_DELAY_MS = 250; // Reduced delay for bulk operations (250ms)
const SEED_DELAY_MS = 150; // Minimal delay for seeding operations (150ms)

// WhatsApp Bot Configuration
const AUTH_FOLDER = "baileys_auth_info"; // Folder for storing WhatsApp authentication data

// Bot Owner Information
// Update these with your own contact information
const OWNER_INFO = {
    name: "p3drovfx",
    whatsapp: "5587996443783", // Phone number without @ for display
    whatsappLink: "https://wa.me/5587996443783",
    email: "p3drovfx@gmail.com", // Contact email
    github: "", // GitHub profile URL
    description: "Game Price Monitoring Bot" // Bot description
};

module.exports = {
    CURRENCY,
    HISTORY_FILE,
    HISTORY_EPIC_FILE,
    HISTORY_MICROSOFT_FILE,
    MONITORED_GAMES_FILE,
    ITAD_API_KEY,
    ITAD_BASE_URL,
    ITAD_COUNTRY,
    STEAM_SHOP_ID,
    EPIC_GAMES_SHOP_ID,
    MICROSOFT_SHOP_ID,
    UPDATE_INTERVAL,
    NOTIFICATIONS_INTERVAL,
    INITIAL_CHECK_DELAY,
    DEFAULT_DELAY_MS,
    BULK_DELAY_MS,
    SEED_DELAY_MS,
    AUTH_FOLDER,
    OWNER_INFO
};
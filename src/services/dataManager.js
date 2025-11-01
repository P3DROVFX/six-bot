/**
 * Data Manager Service
 * 
 * Manages all local data persistence and retrieval for the bot.
 * Handles both game information storage and user conversation states.
 * 
 * Data Structure:
 * - history.json: Unified game information and price history for all stores
 * - monitored_games.json: User/group-specific game monitoring preferences
 * - User states: Temporary conversation state for multi-step interactions
 * 
 * Features:
 * - Automatic data migration from old formats
 * - Multi-store price history tracking
 * - Conversation state management with auto-cleanup
 * - Safe file operations with error handling
 */

const fs = require('fs');
const logger = require('../utils/logger');
const { HISTORY_FILE, HISTORY_EPIC_FILE, HISTORY_MICROSOFT_FILE, MONITORED_GAMES_FILE, CURRENCY } = require('../config/constants');

// User state storage for multi-step conversations
// Automatically cleaned up after 5 minutes of inactivity
const userStates = new Map();

/**
 * Creates default game data structure for a new game entry
 * 
 * @param {string} gameId - Steam App ID
 * @returns {Object} Default game data structure
 */
function createDefaultGameStructure(gameId) {
    return {
        gameInfo: {
            name: 'Unknown Game',
            url: `https://store.steampowered.com/app/${gameId}/`,
            image: '',
            currency: CURRENCY,
            lastUpdated: new Date().toISOString()
        },
        priceHistory: {
            steam: [],
            epic: [],
            microsoft: []
        }
    };
}

/**
 * Ensures price history structure is in the correct format
 * Handles migration from old single-array format to new multi-store format
 * 
 * @param {Object} gameData - Game data object to validate
 * @returns {Object} Game data with correct structure
 */
function ensurePriceHistoryStructure(gameData) {
    if (!gameData.priceHistory) {
        gameData.priceHistory = { steam: [], epic: [], microsoft: [] };
    } else if (Array.isArray(gameData.priceHistory)) {
        // Migrate old format (single array) to new format (multi-store object)
        const oldHistory = gameData.priceHistory;
        gameData.priceHistory = {
            steam: oldHistory, // Assume old data is from Steam
            epic: [],
            microsoft: []
        };
    } else if (typeof gameData.priceHistory === 'object') {
        // Ensure all store arrays exist
        if (!gameData.priceHistory.steam) gameData.priceHistory.steam = [];
        if (!gameData.priceHistory.epic) gameData.priceHistory.epic = [];
        if (!gameData.priceHistory.microsoft) gameData.priceHistory.microsoft = [];
    }
    return gameData;
}

// Automatic cleanup of expired user states every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, state] of userStates.entries()) {
        // Remove states older than 5 minutes
        if (now - state.timestamp > 5 * 60 * 1000) {
            userStates.delete(userId);
            logger.debug('USER_STATE', `Expired state removed for user: ${userId}`);
        }
    }
}, 5 * 60 * 1000);

/**
 * Loads unified game history from history.json
 * 
 * @returns {Object} Unified history object with game data
 */
function loadUnifiedHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
            // Verify data is in the correct structure
            if (data && typeof data === 'object' && Object.values(data).some(game => game.gameInfo && game.priceHistory)) {
                return data;
            }
        } catch (error) {
            logger.error('DATABASE', 'Error loading history.json', error);
        }
    }
    return {};
}

/**
 * Saves unified game history to history.json
 * 
 * @param {Object} unifiedHistory - Complete game history data
 */
function saveUnifiedHistory(unifiedHistory) {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(unifiedHistory, null, 4));
    } catch (error) {
        logger.error('DATABASE', 'Error saving history.json', error);
    }
}

/**
 * Loads monitored games for all users and groups
 * 
 * @returns {Object} Monitored games organized by users and groups
 */
function loadMonitoredGames() {
    if (fs.existsSync(MONITORED_GAMES_FILE)) {
        return JSON.parse(fs.readFileSync(MONITORED_GAMES_FILE, 'utf-8'));
    }
    return { users: {}, groups: {} };
}

/**
 * Saves monitored games configuration to file
 * 
 * @param {Object} monitoredGames - Complete monitored games data
 */
function saveMonitoredGames(monitoredGames) {
    fs.writeFileSync(MONITORED_GAMES_FILE, JSON.stringify(monitoredGames, null, 4));
}

/**
 * Retrieves a specific game's data from unified history
 * Creates default structure if game doesn't exist
 * 
 * @param {string} gameId - Steam App ID
 * @returns {Object} Game data with info and price history
 */
function getGameFromUnified(gameId) {
    const unifiedHistory = loadUnifiedHistory();
    if (!unifiedHistory[gameId]) {
        unifiedHistory[gameId] = createDefaultGameStructure(gameId);
        saveUnifiedHistory(unifiedHistory);
    } else {
        // Garante que a estrutura priceHistory está correta
        unifiedHistory[gameId] = ensurePriceHistoryStructure(unifiedHistory[gameId]);
    }
    return unifiedHistory[gameId];
}

// Atualiza informações de um jogo na estrutura unificada
function updateGameInUnified(gameId, gameInfo = null, newPrice = null, customTimestamp = null, store = 'steam') {
    const unifiedHistory = loadUnifiedHistory();
    
    if (!unifiedHistory[gameId]) {
        unifiedHistory[gameId] = createDefaultGameStructure(gameId);
    } else {
        // Garante que a estrutura priceHistory está correta
        unifiedHistory[gameId] = ensurePriceHistoryStructure(unifiedHistory[gameId]);
    }
    
    // Atualiza informações do jogo se fornecidas
    if (gameInfo) {
        unifiedHistory[gameId].gameInfo = {
            ...unifiedHistory[gameId].gameInfo,
            ...gameInfo,
            lastUpdated: new Date().toISOString()
        };
    }
    
    // Adiciona novo preço se fornecido
    if (newPrice !== null && newPrice !== undefined) {
        const timestamp = customTimestamp ? new Date(customTimestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const storeHistory = unifiedHistory[gameId].priceHistory[store] || [];
        
        // Verifica se já existe entrada para essa data
        const existingEntryIndex = storeHistory.findIndex(entry => entry.timestamp === timestamp);
        
        if (existingEntryIndex >= 0) {
            // Atualiza preço da data se diferente
            if (storeHistory[existingEntryIndex].price !== newPrice) {
                storeHistory[existingEntryIndex].price = newPrice;
            }
        } else {
            // Para timestamps personalizados ou preços diferentes, adiciona nova entrada
            if (customTimestamp || storeHistory.length === 0 || storeHistory[storeHistory.length - 1].price !== newPrice) {
                storeHistory.push({ timestamp: timestamp, price: newPrice });
            }
        }
        
        // Mantém histórico ordenado e salva de volta na estrutura
        unifiedHistory[gameId].priceHistory[store] = storeHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    
    saveUnifiedHistory(unifiedHistory);
    return unifiedHistory[gameId];
}

// Obtém todos os jogos da estrutura unificada
function getAllGamesFromUnified() {
    return loadUnifiedHistory();
}

// Obtém IDs de todos os jogos
function getAllGameIds() {
    const unifiedHistory = loadUnifiedHistory();
    return Object.keys(unifiedHistory);
}

// Carrega histórico de preços de um jogo específico da estrutura unificada
function loadGameHistory(gameId, store = 'steam') {
    const gameData = getGameFromUnified(gameId);
    const priceHistory = gameData.priceHistory;
    
    // Se priceHistory é um array (formato antigo), retorna ele
    if (Array.isArray(priceHistory)) {
        return priceHistory;
    }
    
    // Se priceHistory é um objeto (formato novo), retorna a loja específica
    if (priceHistory && typeof priceHistory === 'object') {
        return priceHistory[store] || [];
    }
    
    return [];
}

function checkHistoryPrice(gameId, store = 'steam') {
    if (!gameId) {
        return null;
    }

    const history = loadGameHistory(gameId, store);
    if (!Array.isArray(history) || history.length === 0) {
        return null;
    }

    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.price === undefined || lastEntry.price === null) {
        return null;
    }

    return {
        price: Number(lastEntry.price),
        timestamp: lastEntry.timestamp || null
    };
}

// Garante que um jogo existe na estrutura unificada
function ensureGameExists(gameId) {
    const unifiedHistory = loadUnifiedHistory();
    if (!unifiedHistory[gameId]) {
        unifiedHistory[gameId] = createDefaultGameStructure(gameId);
        saveUnifiedHistory(unifiedHistory);
    } else {
        // Garante que a estrutura priceHistory está correta
        unifiedHistory[gameId] = ensurePriceHistoryStructure(unifiedHistory[gameId]);
        saveUnifiedHistory(unifiedHistory);
    }
}

// Garante que vários jogos existem na estrutura
function ensureHistoryEntries(gameIds = []) {
    if (!Array.isArray(gameIds) || gameIds.length === 0) {
        return;
    }
    
    for (const gameId of new Set(gameIds.map(id => String(id)))) {
        ensureGameExists(gameId);
    }
}

// Funções para gerenciar histórico da Epic Games
function loadEpicHistory() {
    if (fs.existsSync(HISTORY_EPIC_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(HISTORY_EPIC_FILE, 'utf-8'));
            return data;
        } catch (error) {
            logger.error('DATABASE', 'Erro ao carregar historyEpicGames.json', error);
        }
    }
    return {};
}

function saveEpicHistory(epicHistory) {
    try {
        fs.writeFileSync(HISTORY_EPIC_FILE, JSON.stringify(epicHistory, null, 4));
    } catch (error) {
        logger.error('DATABASE', 'Erro ao salvar historyEpicGames.json', error);
    }
}

function getEpicGameData(gameId) {
    const epicHistory = loadEpicHistory();
    if (!epicHistory[gameId]) {
        epicHistory[gameId] = {
            gameInfo: {
                name: 'Nome Desconhecido',
                url: `https://store.steampowered.com/app/${gameId}/`, // Mantém URL Steam como padrão
                image: '',
                currency: CURRENCY,
                lastUpdated: new Date().toISOString()
            },
            priceHistory: []
        };
    }
    return epicHistory[gameId];
}

function updateEpicGameData(gameId, gameInfo = null, newPrice = null, customTimestamp = null) {
    const epicHistory = loadEpicHistory();
    
    if (!epicHistory[gameId]) {
        epicHistory[gameId] = {
            gameInfo: {
                name: 'Nome Desconhecido',
                url: `https://store.steampowered.com/app/${gameId}/`,
                image: '',
                currency: CURRENCY,
                lastUpdated: new Date().toISOString()
            },
            priceHistory: []
        };
    }
    
    // Atualiza informações do jogo se fornecidas
    if (gameInfo) {
        epicHistory[gameId].gameInfo = {
            ...epicHistory[gameId].gameInfo,
            ...gameInfo,
            lastUpdated: new Date().toISOString()
        };
    }
    
    // Adiciona novo preço se fornecido
    if (newPrice !== null && newPrice !== undefined) {
        const timestamp = customTimestamp ? new Date(customTimestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const priceHistory = epicHistory[gameId].priceHistory || [];
        
        // Verifica se já existe entrada para essa data
        const existingEntryIndex = priceHistory.findIndex(entry => entry.timestamp === timestamp);
        
        if (existingEntryIndex >= 0) {
            // Atualiza preço da data se diferente
            if (priceHistory[existingEntryIndex].price !== newPrice) {
                priceHistory[existingEntryIndex].price = newPrice;
            }
        } else {
            // Para timestamps personalizados ou preços diferentes, adiciona nova entrada
            if (customTimestamp || priceHistory.length === 0 || priceHistory[priceHistory.length - 1].price !== newPrice) {
                priceHistory.push({ timestamp: timestamp, price: newPrice });
            }
        }
        
        // Mantém histórico ordenado
        epicHistory[gameId].priceHistory = priceHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    
    saveEpicHistory(epicHistory);
    return epicHistory[gameId];
}

function loadEpicGameHistory(gameId) {
    return loadGameHistory(gameId, 'epic');
}

// Funções para gerenciar histórico da Microsoft Store
function loadMicrosoftHistory() {
    if (fs.existsSync(HISTORY_MICROSOFT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(HISTORY_MICROSOFT_FILE, 'utf-8'));
            return data;
        } catch (error) {
            logger.error('DATABASE', 'Erro ao carregar historyMicrosoft.json', error);
        }
    }
    return {};
}

function saveMicrosoftHistory(microsoftHistory) {
    try {
        fs.writeFileSync(HISTORY_MICROSOFT_FILE, JSON.stringify(microsoftHistory, null, 4));
    } catch (error) {
        logger.error('DATABASE', 'Erro ao salvar historyMicrosoft.json', error);
    }
}

function getMicrosoftGameData(gameId) {
    const microsoftHistory = loadMicrosoftHistory();
    if (!microsoftHistory[gameId]) {
        microsoftHistory[gameId] = {
            gameInfo: {
                name: 'Nome Desconhecido',
                url: `https://store.steampowered.com/app/${gameId}/`, // Mantém URL Steam como padrão
                image: '',
                currency: CURRENCY,
                lastUpdated: new Date().toISOString()
            },
            priceHistory: []
        };
    }
    return microsoftHistory[gameId];
}

function updateMicrosoftGameData(gameId, gameInfo = null, newPrice = null, customTimestamp = null) {
    const microsoftHistory = loadMicrosoftHistory();
    
    if (!microsoftHistory[gameId]) {
        microsoftHistory[gameId] = {
            gameInfo: {
                name: 'Nome Desconhecido',
                url: `https://store.steampowered.com/app/${gameId}/`,
                image: '',
                currency: CURRENCY,
                lastUpdated: new Date().toISOString()
            },
            priceHistory: []
        };
    }
    
    // Atualiza informações do jogo se fornecidas
    if (gameInfo) {
        microsoftHistory[gameId].gameInfo = { ...microsoftHistory[gameId].gameInfo, ...gameInfo };
    }
    
    // Adiciona nova entrada de preço se fornecida
    if (newPrice !== null) {
        const timestamp = customTimestamp || new Date().toISOString();
        const priceHistory = microsoftHistory[gameId].priceHistory;
        
        // Se é uma atualização em tempo real
        if (!customTimestamp) {
            // Se há entradas e a última é de hoje, substitui
            if (priceHistory.length > 0) {
                const lastEntry = priceHistory[priceHistory.length - 1];
                const lastDate = new Date(lastEntry.timestamp).toDateString();
                const currentDate = new Date().toDateString();
                
                if (lastDate === currentDate) {
                    priceHistory[priceHistory.length - 1] = { timestamp: timestamp, price: newPrice };
                } else {
                    priceHistory.push({ timestamp: timestamp, price: newPrice });
                }
            } else {
                priceHistory.push({ timestamp: timestamp, price: newPrice });
            }
        } else {
            // Para timestamps personalizados ou preços diferentes, adiciona nova entrada
            if (customTimestamp || priceHistory.length === 0 || priceHistory[priceHistory.length - 1].price !== newPrice) {
                priceHistory.push({ timestamp: timestamp, price: newPrice });
            }
        }
        
        // Mantém histórico ordenado
        microsoftHistory[gameId].priceHistory = priceHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    
    saveMicrosoftHistory(microsoftHistory);
    return microsoftHistory[gameId];
}

function loadMicrosoftGameHistory(gameId) {
    return loadGameHistory(gameId, 'microsoft');
}

// Salva o histórico de preços na estrutura unificada (Steam)
function savePriceHistory(gameId, gamePrice, timestamp = null) {
    const previousHistory = loadGameHistory(gameId, 'steam');
    const customTimestamp = timestamp || new Date();
    
    // Se um timestamp foi fornecido, verifica se já existe uma entrada nesse timestamp
    if (timestamp) {
        const existingEntry = previousHistory.find(entry => 
            new Date(entry.timestamp).getTime() === new Date(timestamp).getTime()
        );
        if (existingEntry) {
            return; // Já existe entrada para esse timestamp, não adiciona duplicada
        }
    } else {
        // Para entradas atuais, só adiciona se o preço mudou
        const lastPrice = previousHistory.length > 0 ? previousHistory[previousHistory.length - 1].price : null;
        if (lastPrice !== null && gamePrice === lastPrice) {
            return; // Preço não mudou, não adiciona entrada
        }
    }
    
    // Adiciona nova entrada no histórico
    updateGameInUnified(gameId, null, gamePrice, customTimestamp, 'steam');
    logger.database('PRICE_HISTORY', `Preço Steam ${timestamp ? 'histórico' : 'atual'} salvo: Game ${gameId}`, { price: `R$${gamePrice}`, timestamp: customTimestamp.toISOString() });
}

// Salva o histórico de preços da Epic Games
function saveEpicPriceHistory(gameId, gamePrice, timestamp = null) {
    const previousHistory = loadEpicGameHistory(gameId);
    const customTimestamp = timestamp || new Date();
    
    // Se um timestamp foi fornecido, verifica se já existe uma entrada nesse timestamp
    if (timestamp) {
        const existingEntry = previousHistory.find(entry => 
            new Date(entry.timestamp).getTime() === new Date(timestamp).getTime()
        );
        if (existingEntry) {
            return; // Já existe entrada para esse timestamp, não adiciona duplicada
        }
    } else {
        // Para entradas atuais, só adiciona se o preço mudou
        const lastPrice = previousHistory.length > 0 ? previousHistory[previousHistory.length - 1].price : null;
        if (lastPrice !== null && gamePrice === lastPrice) {
            return; // Preço não mudou, não adiciona entrada
        }
    }
    
    // Adiciona nova entrada no histórico
    updateGameInUnified(gameId, null, gamePrice, customTimestamp, 'epic');
    logger.database('PRICE_HISTORY', `Preço Epic Games ${timestamp ? 'histórico' : 'atual'} salvo: Game ${gameId}`, { price: `R$${gamePrice}`, timestamp: customTimestamp.toISOString() });
}

// Salva o histórico de preços da Microsoft Store
function saveMicrosoftPriceHistory(gameId, gamePrice, timestamp = null) {
    const previousHistory = loadMicrosoftGameHistory(gameId);
    const customTimestamp = timestamp || new Date();
    
    // Se um timestamp foi fornecido, verifica se já existe uma entrada nesse timestamp
    if (timestamp) {
        const existingEntry = previousHistory.find(entry => 
            new Date(entry.timestamp).getTime() === new Date(timestamp).getTime()
        );
        if (existingEntry) {
            return; // Já existe entrada para esse timestamp, não adiciona duplicada
        }
    } else {
        // Para entradas atuais, só adiciona se o preço mudou
        const lastPrice = previousHistory.length > 0 ? previousHistory[previousHistory.length - 1].price : null;
        if (lastPrice !== null && gamePrice === lastPrice) {
            return; // Preço não mudou, não adiciona entrada
        }
    }
    
    // Adiciona nova entrada no histórico
    updateGameInUnified(gameId, null, gamePrice, customTimestamp, 'microsoft');
    logger.database('PRICE_HISTORY', `Preço Microsoft Store ${timestamp ? 'histórico' : 'atual'} salvo: Game ${gameId}`, { price: `R$${gamePrice}`, timestamp: customTimestamp.toISOString() });
}

// Funções para gerenciar estado do usuário
function setUserState(userId, state) {
    // Adiciona timestamp para controle de expiração
    state.timestamp = Date.now();
    userStates.set(userId, state);
}

function getUserState(userId) {
    return userStates.get(userId) || null;
}

function clearUserState(userId) {
    userStates.delete(userId);
}

module.exports = {
    loadUnifiedHistory,
    saveUnifiedHistory,
    loadMonitoredGames,
    saveMonitoredGames,
    getGameFromUnified,
    updateGameInUnified,
    getAllGamesFromUnified,
    getAllGameIds,
    loadGameHistory,
    checkHistoryPrice,
    ensureGameExists,
    ensureHistoryEntries,
    savePriceHistory,
    // Epic Games functions
    loadEpicHistory,
    saveEpicHistory,
    getEpicGameData,
    updateEpicGameData,
    loadEpicGameHistory,
    saveEpicPriceHistory,
    // Microsoft Store functions
    loadMicrosoftHistory,
    saveMicrosoftHistory,
    getMicrosoftGameData,
    updateMicrosoftGameData,
    loadMicrosoftGameHistory,
    saveMicrosoftPriceHistory,
    // User state functions
    setUserState,
    getUserState,
    clearUserState
};
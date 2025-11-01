/**
 * API Service - IsThereAnyDeal Integration
 * 
 * This service handles all interactions with the IsThereAnyDeal (ITAD) API,
 * which provides game pricing information across multiple stores.
 * 
 * Features:
 * - Game lookup and information retrieval
 * - Price checking across Steam, Epic Games, and Microsoft Store
 * - Historical price data fetching
 * - Game search functionality
 * - Intelligent caching to reduce API calls
 * 
 * API Documentation: https://docs.isthereanydeal.com/
 */

const axios = require('axios');
const { ITAD_API_KEY, ITAD_BASE_URL, ITAD_COUNTRY, STEAM_SHOP_ID, EPIC_GAMES_SHOP_ID, MICROSOFT_SHOP_ID } = require('../config/constants');
const { updateGameInUnified, savePriceHistory, saveEpicPriceHistory, saveMicrosoftPriceHistory, getGameFromUnified } = require('./dataManager');
const logger = require('../utils/logger');

// ITAD ID cache to avoid repeated lookup calls
// Maps Steam App ID to ITAD Game ID
const itadIdCache = new Map();

// Price cache to prevent duplicate API calls within short time periods
// Format: Map<gameId_store, { price, timestamp }>
const priceCache = new Map();
const PRICE_CACHE_DURATION = 30 * 60 * 1000; // Cache validity: 30 minutes

// Automatic cache cleanup every hour
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    // Remove expired price entries
    for (const [key, value] of priceCache.entries()) {
        if (now - value.timestamp > PRICE_CACHE_DURATION) {
            priceCache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.cache('PRICE_CACHE', `Auto-cleanup completed: ${cleaned} expired prices removed`);
    }
}, 60 * 60 * 1000); // Run every hour

/**
 * Makes authenticated requests to ITAD API with query parameter authentication
 * 
 * @param {string} url - Full API endpoint URL
 * @param {Object} options - Additional axios configuration options
 * @returns {Promise} Axios response
 */
async function makeITADRequest(url, options = {}) {
    // Add API key as query parameter if not already present
    const requestUrl = !url.includes('key=') 
        ? `${url}${url.includes('?') ? '&' : '?'}key=${ITAD_API_KEY}`
        : url;

    // Apply rate limiting to prevent API throttling
    await new Promise(resolve => setTimeout(resolve, 1000));

    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };

    return axios(requestUrl, config);
}

/**
 * Tests if the ITAD API key is valid and working
 * 
 * OPTIMIZATION NOTE: This function is currently disabled to conserve API calls.
 * Uncomment the implementation only when you need to test your API key.
 * 
 * @returns {Promise<boolean>} True if API key is valid
 */
async function testITADAPIKey() {
    // if (!ITAD_API_KEY || ITAD_API_KEY === 'SUA_API_KEY_AQUI') {
    //     console.error('❌ API Key da IsThereAnyDeal não configurada!');
    //     console.error('📖 Leia o arquivo ITAD_API_SETUP.md para instruções de configuração.');
    //     return false;
    // }

    // try {
    //     console.log('🔑 Testando API Key com Query Parameter...');
    //     
    //     const url = `${ITAD_BASE_URL}/games/lookup/v1?appid=730&key=${ITAD_API_KEY}`;
    //     const response = await axios.get(url);

    //     if (response.data?.found) {
    //         console.log('✅ API Key da ITAD funcionando!');
    //         console.log(`🎮 Teste realizado com: ${response.data.game.title}`);
    //         
    //         // Define método de autenticação como Query Parameter
    //         itadAuthMethod = {
    //             name: 'Query Parameter',
    //             useQuery: true
    //         };
    //         return true;
    //     }
    // } catch (error) {
    //     console.error('❌ Erro ao testar API Key:', error.response?.status || error.message);
    //     
    //     if (error.response?.status === 403) {
    //         console.error('🚫 Erro 403 - Acesso negado. Possíveis causas:');
    //         console.error('  • API key inválida ou expirada');
    //         console.error('  • Domínio não autorizado na configuração da app');
    //         console.error('  • Endpoint requer permissões especiais');
    //     }
    // }

    // console.error('❌ Falha na autenticação da API!');
    // console.error('📖 Verifique:');
    // console.error('  1. Se a API key está correta');
    // console.error('  2. Se a aplicação está ativa em https://isthereanydeal.com/apps/my/');
    // console.error('  3. Se os domínios permitidos estão configurados');
    
    // OTIMIZAÇÃO: Retorna true por padrão para não bloquear o bot
    logger.warning('API_CONFIG', 'Teste de API desabilitado para economizar chamadas - descomente se precisar testar');
    return true;
}

// Função para calcular e atualizar o historyLow a partir do histórico local
function updateHistoryLowFromLocal(steamAppId, store = 'steam') {
    const { loadGameHistory } = require('./dataManager');
    
    try {
        const history = loadGameHistory(steamAppId, store);
        if (!history || history.length === 0) {
            return null;
        }
        
        // Calcula o menor preço do histórico
        const prices = history.map(entry => entry.price).filter(p => p != null && p > 0);
        if (prices.length === 0) {
            return null;
        }
        
        const minPrice = Math.min(...prices);
        
        // Atualiza na estrutura unificada
        const gameData = getGameFromUnified(steamAppId);
        const storeKey = `historyLow_${store}`;
        
        if (!gameData.gameInfo[storeKey] || gameData.gameInfo[storeKey] > minPrice) {
            const updateData = {};
            updateData[storeKey] = minPrice;
            updateData[`${storeKey}_updated`] = new Date().toISOString();
            updateGameInUnified(steamAppId, updateData, null);
            logger.database('HISTORY_LOW', `Menor preço ${store.toUpperCase()} atualizado: Game ${steamAppId} = R$${minPrice}`);
        }
        
        return minPrice;
    } catch (error) {
        logger.error('HISTORY_LOW', 'Falha ao atualizar menor preço histórico local', error);
        return null;
    }
}

// Função para obter o ID do jogo na IsThereAnyDeal usando Steam AppID
async function getITADGameId(steamAppId) {
    // OTIMIZAÇÃO: Verifica cache em memória primeiro
    if (itadIdCache.has(steamAppId)) {
        logger.cache('ITAD_LOOKUP', `Cache hit - ID encontrado para game ${steamAppId}`, { itadId: itadIdCache.get(steamAppId) });
        return itadIdCache.get(steamAppId);
    }
    
    // OTIMIZAÇÃO: Verifica se já está salvo na estrutura unificada
    try {
        const gameData = getGameFromUnified(steamAppId);
        if (gameData?.gameInfo?.itadId) {
            logger.database('ITAD_LOOKUP', `ID recuperado da estrutura unificada: Game ${steamAppId}`, { itadId: gameData.gameInfo.itadId });
            itadIdCache.set(steamAppId, gameData.gameInfo.itadId);
            return gameData.gameInfo.itadId;
        }
    } catch (error) {
        // Ignora erro e segue para buscar da API
    }
    
    // Busca da API apenas se não encontrou no cache nem na estrutura
    try {
        logger.api('ITAD_LOOKUP', `Buscando ID via API lookup/v1 para game ${steamAppId}`);
        const url = `${ITAD_BASE_URL}/games/lookup/v1?appid=${steamAppId}`;
        const response = await makeITADRequest(url, { method: 'GET' });
        
        if (response.data?.found) {
            const itadId = response.data.game.id;
            
            // Salva no cache em memória
            itadIdCache.set(steamAppId, itadId);
            
            // Salva na estrutura unificada para persistência
            try {
                updateGameInUnified(steamAppId, { itadId }, null);
            } catch (updateError) {
                console.error(`Erro ao salvar ITAD ID na estrutura: ${updateError.message}`);
            }
            
            logger.success('ITAD_LOOKUP', `ID obtido e salvo: Game ${steamAppId}`, { itadId });
            return itadId;
        }
    } catch (error) {
        logger.error('ITAD_LOOKUP', `Falha ao obter ID ITAD para Steam AppID ${steamAppId}`, error);
    }
    return null;
}

// Função para buscar preço usando IsThereAnyDeal API (Steam por padrão)
async function checkPrice(steamAppId, store = 'steam') {
    let shopId, storeName;
    
    switch (store) {
        case 'epic':
            shopId = EPIC_GAMES_SHOP_ID;
            storeName = 'Epic Game Store';
            break;
        case 'microsoft':
            shopId = MICROSOFT_SHOP_ID;
            storeName = 'Microsoft Store';
            break;
        default:
            shopId = STEAM_SHOP_ID;
            storeName = 'Steam';
            break;
    }
    
    // OTIMIZAÇÃO: Verifica cache de preços primeiro
    const cacheKey = `${steamAppId}_${store}`;
    const cachedPrice = priceCache.get(cacheKey);
    
    if (cachedPrice && (Date.now() - cachedPrice.timestamp) < PRICE_CACHE_DURATION) {
        logger.cache('PRICE_CHECK', `Cache hit: Game ${steamAppId} (${storeName})`, { price: `R$${cachedPrice.price}` });
        return cachedPrice.price;
    }
    
    try {
        logger.api('PRICE_CHECK', `Consultando preço via ITAD prices/v3: Game ${steamAppId} (${storeName})`);
        
        // Primeiro, obtém o ID do jogo na ITAD
        const itadGameId = await getITADGameId(steamAppId);
        if (!itadGameId) {
            logger.warning('PRICE_CHECK', `Jogo não encontrado na ITAD: ${steamAppId}`);
            return null;
        }

        // Busca preços atuais do jogo de TODAS as lojas (não filtra na URL)
        const url = `${ITAD_BASE_URL}/games/prices/v3?country=${ITAD_COUNTRY}`;
        const response = await makeITADRequest(url, {
            method: 'POST',
            data: [itadGameId]
        });

        const gameData = response.data[0];
        if (gameData?.deals && gameData.deals.length > 0) {
            // Procura deal da loja específica
            const targetDeal = gameData.deals.find(deal => 
                deal.shop && deal.shop.name === storeName
            );
            
            if (targetDeal) {
                const price = targetDeal.price.amount;
                
                // Salva no cache
                priceCache.set(cacheKey, { price, timestamp: Date.now() });
                
                // Atualiza historyLow se necessário
                updateHistoryLowFromLocal(steamAppId, store);
                
                logger.price('PRICE_CHECK', `Preço encontrado: Game ${steamAppId} (${storeName})`, { price: `R$${price}` });
                return price;
            } else {
                logger.info('PRICE_CHECK', `Sem ofertas disponíveis: Game ${steamAppId} (${storeName})`);
                return null;
            }
        }
        
        logger.info('PRICE_CHECK', `Nenhum preço disponível: Game ${steamAppId} (${storeName})`);
        return null;
        
    } catch (error) {
        logger.error('PRICE_CHECK', `Falha ao buscar preço ITAD: Game ${steamAppId} (${storeName})`, error);
        
        // Fallback para Steam Store API apenas se for Steam
        if (store === 'steam') {
            try {
                logger.api('PRICE_CHECK', `Tentando fallback Steam Store Direct API: Game ${steamAppId}`);
                
                const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=br&filters=price_overview`;
                const steamResponse = await axios.get(steamUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const gameData = steamResponse.data[steamAppId];
                if (gameData?.success && gameData.data?.price_overview) {
                    const priceData = gameData.data.price_overview;
                    // Steam retorna preço em centavos, converte para reais
                    const finalPrice = priceData.final / 100;
                    
                    // Salva no cache
                    priceCache.set(cacheKey, { price: finalPrice, timestamp: Date.now() });
                    
                    // Atualiza historyLow se necessário
                    updateHistoryLowFromLocal(steamAppId, store);
                    
                    logger.success('PRICE_CHECK', `Preço obtido via fallback: Game ${steamAppId}`, { price: `R$${finalPrice}`, source: 'Steam Store Direct' });
                    return finalPrice;
                }
            } catch (fallbackError) {
                logger.error('PRICE_CHECK', `Fallback Steam Store falhou: Game ${steamAppId}`, fallbackError);
            }
        }
    }
    return null;
}

// Função para buscar preços de múltiplos jogos com rate limiting
async function checkMultiplePrices(gameIds, delayMs = 1000, store = 'steam') {
    const results = {};
    const storeName = store === 'epic' ? 'Epic Games' : 'Steam';
    
    logger.info('PRICE_CHECK', `Iniciando busca sequencial de preços: ${gameIds.length} jogos (${storeName})`);
    
    for (let i = 0; i < gameIds.length; i++) {
        const gameId = gameIds[i];
        try {
            results[gameId] = await checkPrice(gameId, store);
            logger.price('PRICE_CHECK', `Progresso: [${i + 1}/${gameIds.length}] Game ${gameId}`, { price: `R$${results[gameId]}`, store: storeName });
            
            // Delay entre requisições para evitar rate limiting
            if (i < gameIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            logger.error('PRICE_CHECK', `Erro ao buscar preço: Game ${gameId} (${storeName})`, error);
            results[gameId] = null;
        }
    }
    
    return results;
}

// Função para obter informações do jogo da estrutura unificada (usando IsThereAnyDeal API)
async function getGameInfo(steamAppId, useCache = true) {
    const gameData = getGameFromUnified(steamAppId);
    const gameInfo = gameData.gameInfo;
    
    // Verifica se precisa atualizar informações (se não tem nome ou imagem, ou se expirou - 7 dias)
    const needsUpdate = !gameInfo.name || gameInfo.name === 'Nome Desconhecido' || 
                       !gameInfo.image || 
                       (useCache && Date.now() - new Date(gameInfo.lastUpdated).getTime() > 7 * 24 * 60 * 60 * 1000);
    
    if (!needsUpdate) {
        return {
            name: gameInfo.name,
            image: gameInfo.image
        };
    }
    
    try {
        logger.api('GAME_INFO', `Buscando informações via ITAD info/v2: Game ${steamAppId}`);
        
        // Primeiro, obtém o ID do jogo na ITAD
        const itadGameId = await getITADGameId(steamAppId);
        if (!itadGameId) {
            logger.warning('GAME_INFO', `Jogo não encontrado na ITAD: ${steamAppId}`);
            return {
                name: gameInfo.name || 'Nome Desconhecido',
                image: gameInfo.image || ''
            };
        }

        // Busca informações do jogo
        const url = `${ITAD_BASE_URL}/games/info/v2?id=${itadGameId}`;
        const response = await makeITADRequest(url, { method: 'GET' });

        const gameData = response.data;
        if (gameData) {
            const newGameInfo = {
                name: gameData.title,
                url: `https://store.steampowered.com/app/${steamAppId}/`,
                image: gameData.assets?.banner300 || gameData.assets?.boxart || '',
                currency: 'BRL',
                lastUpdated: new Date().toISOString(),
                itadId: itadGameId
            };
            
            // Atualiza na estrutura unificada
            updateGameInUnified(steamAppId, newGameInfo, null);
            
            return {
                name: newGameInfo.name,
                image: newGameInfo.image
            };
        }
    } catch (error) {
        logger.error('GAME_INFO', `Falha ao buscar informações: Game ${steamAppId}`, error);
    }
    
    // Retorna informações existentes ou padrão
    return {
        name: gameInfo.name || 'Nome Desconhecido',
        image: gameInfo.image || ''
    };
}

// Função para buscar informações de múltiplos jogos
async function getMultipleGameInfo(gameIds, delayMs = 1000) {
    const results = {};
    
    logger.info('GAME_INFO', `Iniciando busca de informações: ${gameIds.length} jogos`);
    
    for (let i = 0; i < gameIds.length; i++) {
        const gameId = gameIds[i];
        try {
            results[gameId] = await getGameInfo(gameId);
            logger.success('GAME_INFO', `Progresso: [${i + 1}/${gameIds.length}] ${results[gameId].name}`, { gameId });
            
            // Delay entre requisições
            if (i < gameIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            logger.error('GAME_INFO', `Erro ao buscar informações: Game ${gameId}`, error);
            results[gameId] = { name: 'Nome Desconhecido', image: '' };
        }
    }
    
    return results;
}

// Função para buscar e salvar histórico de preços da IsThereAnyDeal API
async function fetchPriceHistoryFromITAD(steamAppId, daysBack = 90, store = 'steam') {
    let shopId, storeName;
    
    switch (store) {
        case 'epic':
            shopId = EPIC_GAMES_SHOP_ID;
            storeName = 'Epic Game Store';
            break;
        case 'microsoft':
            shopId = MICROSOFT_SHOP_ID;
            storeName = 'Microsoft Store';
            break;
        default:
            shopId = STEAM_SHOP_ID;
            storeName = 'Steam';
            break;
    }
    
    try {
        const itadGameId = await getITADGameId(steamAppId);
        if (!itadGameId) {
            logger.warning('PRICE_HISTORY', `Jogo não encontrado para buscar histórico: Game ${steamAppId} (${storeName})`);
            return [];
        }

        // Faz requisição sem parâmetro 'since' (últimos 3 meses por padrão da API)
        const url = `${ITAD_BASE_URL}/games/history/v2?id=${itadGameId}&country=${ITAD_COUNTRY}&shops=${shopId}`;
        const response = await makeITADRequest(url, { method: 'GET' });

        const historyData = response.data;
        if (!historyData || historyData.length === 0) {
            logger.info('PRICE_HISTORY', `Nenhum histórico disponível: Game ${steamAppId} (${storeName})`);
            return [];
        }

        logger.success('PRICE_HISTORY', `Histórico obtido: ${historyData.length} entradas - Game ${steamAppId} (${storeName})`);
        
        // Filtra entradas da loja especificada e salva no sistema
        const storeEntries = historyData
            .filter(entry => entry.shop && entry.shop.name === storeName)
            .map(entry => ({
                timestamp: entry.timestamp,
                price: entry.deal.price.amount,
                shop: entry.shop.name
            }));

        // Salva cada entrada histórica no sistema apropriado
        for (const entry of storeEntries) {
            if (store === 'epic') {
                saveEpicPriceHistory(steamAppId, entry.price, new Date(entry.timestamp));
            } else if (store === 'microsoft') {
                saveMicrosoftPriceHistory(steamAppId, entry.price, new Date(entry.timestamp));
            } else {
                savePriceHistory(steamAppId, entry.price, new Date(entry.timestamp));
            }
        }
        
        logger.database('PRICE_HISTORY', `Salvamento concluído: ${storeEntries.length} entradas - Game ${steamAppId} (${storeName})`);
        return storeEntries;

    } catch (error) {
        logger.error('PRICE_HISTORY', `Falha ao buscar histórico: Game ${steamAppId} (${storeName})`, error);
        return [];
    }
}

// Função para buscar o history low (menor preço histórico) da ITAD API
async function getHistoryLow(steamAppId, store = 'steam') {
    let shopId, storeName;
    
    switch (store) {
        case 'epic':
            shopId = EPIC_GAMES_SHOP_ID;
            storeName = 'Epic Game Store';
            break;
        case 'microsoft':
            shopId = MICROSOFT_SHOP_ID;
            storeName = 'Microsoft Store';
            break;
        default:
            shopId = STEAM_SHOP_ID;
            storeName = 'Steam';
            break;
    }
    
    // OTIMIZAÇÃO: Tenta calcular do histórico local primeiro
    try {
        const gameData = getGameFromUnified(steamAppId);
        const storeKey = `historyLow_${store}`;
        const lastUpdatedKey = `${storeKey}_updated`;
        
        // Verifica se já tem historyLow salvo e se está atualizado (menos de 7 dias)
        if (gameData.gameInfo[storeKey]) {
            const lastUpdated = gameData.gameInfo[lastUpdatedKey];
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            if (!lastUpdated || new Date(lastUpdated).getTime() > sevenDaysAgo) {
                logger.cache('HISTORY_LOW', `Menor preço salvo encontrado: Game ${steamAppId} (${storeName})`, { historyLow: `R$${gameData.gameInfo[storeKey]}` });
                return gameData.gameInfo[storeKey];
            }
        }
        
        // Tenta calcular do histórico local
        const localHistoryLow = updateHistoryLowFromLocal(steamAppId, store);
        if (localHistoryLow !== null) {
            logger.success('HISTORY_LOW', `Menor preço calculado localmente: Game ${steamAppId} (${storeName})`, { historyLow: `R$${localHistoryLow}` });
            return localHistoryLow;
        }
    } catch (error) {
        logger.debug('HISTORY_LOW', `Histórico local indisponível, tentando API: Game ${steamAppId}`);
    }
    
    // Se não conseguiu do local, busca da API
    try {
        logger.api('HISTORY_LOW', `Consultando menor preço via ITAD API: Game ${steamAppId} (${storeName})`);
        
        // Primeiro, obtém o ID do jogo na ITAD
        const itadGameId = await getITADGameId(steamAppId);
        if (!itadGameId) {
            logger.warning('HISTORY_LOW', `Jogo não encontrado na ITAD: ${steamAppId}`);
            return null;
        }

        // Busca preços com history low - usando optional=historical para incluir dados históricos
        const url = `${ITAD_BASE_URL}/games/prices/v3?country=${ITAD_COUNTRY}&shops=${shopId}&optional=historical`;
        const response = await makeITADRequest(url, {
            method: 'POST',
            data: [itadGameId]
        });

        const gameData = response.data[0];
        if (gameData?.deals && gameData.deals.length > 0) {
            const deal = gameData.deals[0];
            // Busca o history low se estiver disponível
            if (deal.historical && deal.historical.low) {
                const historyLow = deal.historical.low.amount;
                
                // Salva no gameInfo para uso futuro
                const storeKey = `historyLow_${store}`;
                const updateData = {};
                updateData[storeKey] = historyLow;
                updateData[`${storeKey}_updated`] = new Date().toISOString();
                updateGameInUnified(steamAppId, updateData, null);
                
                logger.success('HISTORY_LOW', `Menor preço encontrado e salvo: Game ${steamAppId} (${storeName})`, { historyLow: `R$${historyLow}` });
                return historyLow;
            }
        }
        
        logger.info('HISTORY_LOW', `Menor preço histórico não disponível: Game ${steamAppId} (${storeName})`);
        return null;
        
    } catch (error) {
        logger.error('HISTORY_LOW', `Falha ao buscar menor preço: Game ${steamAppId} (${storeName})`, error);
        return null;
    }
}

// Função para buscar preços de múltiplos jogos em batch (mais eficiente)
async function checkPricesBatch(gameIds, store = 'steam') {
    if (!Array.isArray(gameIds) || gameIds.length === 0) {
        return {};
    }
    
    let shopId, storeName;
    switch (store) {
        case 'epic':
            shopId = EPIC_GAMES_SHOP_ID;
            storeName = 'Epic Game Store';
            break;
        case 'microsoft':
            shopId = MICROSOFT_SHOP_ID;
            storeName = 'Microsoft Store';
            break;
        default:
            shopId = STEAM_SHOP_ID;
            storeName = 'Steam';
            break;
    }
    
    const results = {};
    const gamesNeedingFetch = [];
    const itadIdMap = {};
    
    // Verifica cache primeiro
    for (const gameId of gameIds) {
        const cacheKey = `${gameId}_${store}`;
        const cachedPrice = priceCache.get(cacheKey);
        
        if (cachedPrice && (Date.now() - cachedPrice.timestamp) < PRICE_CACHE_DURATION) {
            results[gameId] = cachedPrice.price;
            console.log(`✅ Cache hit: ${gameId} (${storeName}): R$${cachedPrice.price}`);
        } else {
            gamesNeedingFetch.push(gameId);
        }
    }
    
    if (gamesNeedingFetch.length === 0) {
        logger.success('PRICE_BATCH', `Todos os preços obtidos do cache: ${gameIds.length} jogos`, { store: storeName });
        return results;
    }
    
    logger.api('PRICE_BATCH', `Busca em batch iniciada: ${gamesNeedingFetch.length} jogos (${storeName})`);
    
    // Obtém IDs ITAD para todos os jogos
    for (const gameId of gamesNeedingFetch) {
        const itadId = await getITADGameId(gameId);
        if (itadId) {
            itadIdMap[gameId] = itadId;
        }
    }
    
    const validItadIds = Object.values(itadIdMap);
    if (validItadIds.length === 0) {
        logger.error('PRICE_BATCH', 'Nenhum ID ITAD válido encontrado para os jogos solicitados');
        return results;
    }
    
    try {
        // Busca preços de todos os jogos em UMA ÚNICA chamada
        const url = `${ITAD_BASE_URL}/games/prices/v3?country=${ITAD_COUNTRY}`;
        const response = await makeITADRequest(url, {
            method: 'POST',
            data: validItadIds
        });
        
        // Processa resultados
        for (const [gameId, itadId] of Object.entries(itadIdMap)) {
            const gameData = response.data.find(g => g.id === itadId);
            
            if (gameData?.deals && gameData.deals.length > 0) {
                const targetDeal = gameData.deals.find(deal => 
                    deal.shop && deal.shop.name === storeName
                );
                
                if (targetDeal) {
                    const price = targetDeal.price.amount;
                    results[gameId] = price;
                    
                    // Salva no cache
                    const cacheKey = `${gameId}_${store}`;
                    priceCache.set(cacheKey, { price, timestamp: Date.now() });
                    
                    // Atualiza historyLow
                    updateHistoryLowFromLocal(gameId, store);
                    
                    logger.price('PRICE_BATCH', `Preço encontrado: Game ${gameId}`, { price: `R$${price}`, store: storeName });
                } else {
                    results[gameId] = null;
                }
            } else {
                results[gameId] = null;
            }
        }
        
        logger.success('PRICE_BATCH', `Batch concluído: ${Object.keys(results).length}/${gameIds.length} preços obtidos`, { store: storeName });
    } catch (error) {
        logger.error('PRICE_BATCH', 'Falha ao buscar preços em batch', error);
    }
    
    return results;
}

/**
 * Busca jogos na Steam pelo nome
 * @param {string} gameName - Nome do jogo para buscar
 * @param {number} limit - Número máximo de resultados (padrão: 5)
 * @returns {Promise<Array>} Array com resultados da busca
 */
async function searchGames(gameName, limit = 5) {
    try {
        if (!gameName || gameName.trim().length === 0) {
            logger.warning('GAME_SEARCH', 'Nome de jogo vazio fornecido');
            return [];
        }

        logger.info('GAME_SEARCH', `Buscando jogos: "${gameName}"`);
        
        // Endpoint de busca da ITAD com parâmetros na URL
        const encodedTitle = encodeURIComponent(gameName);
        const url = `${ITAD_BASE_URL}/games/search/v1?title=${encodedTitle}&limit=${limit}&strict=0`;
        const response = await makeITADRequest(url, {
            method: 'GET'
        });

        // A API retorna um array direto de jogos
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            logger.warning('GAME_SEARCH', 'Nenhum resultado encontrado na busca', { gameName });
            return [];
        }

        const results = [];
        
        // Filtra apenas jogos (não DLCs nem pacotes)
        const games = response.data.filter(item => item.type === 'game');
        
        for (const game of games.slice(0, limit)) {
            try {
                // Busca informações completas do jogo incluindo appid
                let steamAppId = null;
                let steamUrl = null;
                let steamPrice = null;
                
                if (game.id) {
                    try {
                        // Busca appid e outras informações do jogo
                        const infoUrl = `${ITAD_BASE_URL}/games/info/v2?id=${game.id}`;
                        const infoResponse = await makeITADRequest(infoUrl, {
                            method: 'GET'
                        });
                        
                        if (infoResponse.data?.appid) {
                            steamAppId = infoResponse.data.appid.toString();
                            steamUrl = `https://store.steampowered.com/app/${steamAppId}/`;
                            
                            // Busca preço atual na Steam
                            try {
                                steamPrice = await checkPrice(steamAppId, 'steam');
                            } catch (error) {
                                logger.warning('GAME_SEARCH', `Erro ao buscar preço do jogo ${game.title}`, error);
                            }
                        }
                    } catch (error) {
                        logger.warning('GAME_SEARCH', `Erro ao buscar informações de ${game.title}`, error);
                    }
                }

                results.push({
                    title: game.title,
                    steamAppId: steamAppId,
                    steamUrl: steamUrl,
                    steamPrice: steamPrice,
                    image: game.assets?.boxart || game.assets?.banner300 || null,
                    itadId: game.id
                });

            } catch (error) {
                logger.error('GAME_SEARCH', `Erro ao processar resultado: ${game.title}`, error);
            }
        }

        logger.success('GAME_SEARCH', `Busca concluída: ${results.length} jogos encontrados`, { 
            query: gameName,
            withSteamUrl: results.filter(r => r.steamUrl).length 
        });

        return results;

    } catch (error) {
        logger.error('GAME_SEARCH', 'Falha ao buscar jogos', error);
        return [];
    }
}

module.exports = {
    testITADAPIKey,
    checkPrice,
    checkMultiplePrices,
    checkPricesBatch,
    getGameInfo,
    getMultipleGameInfo,
    fetchPriceHistoryFromITAD,
    getHistoryLow,
    updateHistoryLowFromLocal,
    searchGames
};
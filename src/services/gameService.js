const logger = require('../utils/logger');
const { checkMultiplePrices, checkPricesBatch, getMultipleGameInfo, fetchPriceHistoryFromITAD } = require('./apiService');
const { 
    getAllGamesFromUnified, 
    savePriceHistory, 
    loadGameHistory, 
    updateGameInUnified, 
    ensureHistoryEntries 
} = require('./dataManager');
const { CURRENCY } = require('../config/constants');

// Função para semear histórico inicial para jogos globais
async function seedHistoryForGlobalGames(gameIds, delayMs = 300) {
    if (!Array.isArray(gameIds) || gameIds.length === 0) {
        return 0;
    }

    const uniqueIds = Array.from(new Set(gameIds.map(id => String(id).trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
        return 0;
    }

    logger.info('SEED_HISTORY', `Semeando histórico inicial para ${uniqueIds.length} jogos...`);

    let priceResults = {};
    try {
        // OTIMIZAÇÃO: Usa batch quando possível (mais eficiente)
        if (uniqueIds.length > 5) {
            logger.info('SEED_HISTORY', `Usando busca em batch para ${uniqueIds.length} jogos...`);
            priceResults = await checkPricesBatch(uniqueIds, 'steam');
        } else {
            priceResults = await checkMultiplePrices(uniqueIds, delayMs);
        }
    } catch (error) {
        logger.error('SEED_HISTORY', 'Erro ao buscar preços para semear histórico', error);
        priceResults = {};
    }

    let seededCount = 0;

    for (const id of uniqueIds) {
        const price = priceResults[id];
        if (price === null || price === undefined) {
            continue;
        }

        // Salva no histórico usando estrutura unificada
        savePriceHistory(id, price);
        seededCount += 1;
    }

    logger.success('SEED_HISTORY', `Semeados ${seededCount} preços iniciais.`);
    return seededCount;
}

// Função para adicionar jogos globais em lote
async function bulkAddGlobalGames(gameIds, options = {}) {
    const {
        fetchInfo = true,
        delayMs = 350,
        seedHistory = true,
        seedHistoryMax = 150,
        seedDelayMs = 250
    } = options;

    const normalizedIds = Array.from(new Set((gameIds || []).map(id => String(id).trim())));

    const invalid = [];
    const alreadyTracked = [];
    const candidates = [];

    const allGames = getAllGamesFromUnified();

    for (const id of normalizedIds) {
        if (!/^\d{3,}$/.test(id)) {
            invalid.push(id);
            continue;
        }

        if (allGames[id]) {
            alreadyTracked.push(id);
            continue;
        }

        candidates.push(id);
    }

    const added = [];

    let infoMap = {};
    if (fetchInfo && candidates.length > 0) {
        try {
            infoMap = await getMultipleGameInfo(candidates, delayMs);
        } catch (error) {
            logger.error('BULK_ADD', 'Erro ao buscar informações em lote', error);
            infoMap = {};
        }
    }

    for (const id of candidates) {
        const info = infoMap[id] || {};
        const resolvedName = info.name && info.name !== 'Nome Desconhecido' ? info.name : `Jogo ${id}`;

        // Adiciona jogo na estrutura unificada
        updateGameInUnified(id, {
            name: resolvedName,
            url: `https://store.steampowered.com/app/${id}/`,
            image: info.image || '',
            currency: CURRENCY,
            lastUpdated: new Date().toISOString()
        }, null);

        added.push({
            id,
            name: resolvedName
        });
    }

    ensureHistoryEntries(added.map(item => item.id));

    let seededCount = 0;
    if (seedHistory && added.length > 0) {
        const idsToSeed = added
            .slice(0, Math.max(0, seedHistoryMax))
            .map(item => item.id);

        if (idsToSeed.length > 0) {
            try {
                seededCount = await seedHistoryForGlobalGames(idsToSeed, seedDelayMs);
            } catch (error) {
                logger.error('BULK_ADD', 'Erro ao semear histórico inicial após adicionar jogos', error);
            }
        }
    }

    return {
        added,
        alreadyTracked,
        invalid,
        seededCount
    };
}

// Função dedicada para atualizar histórico de preços de todos os jogos da estrutura unificada
async function updateGlobalGamesPrices() {
    const { saveEpicPriceHistory, saveMicrosoftPriceHistory } = require('./dataManager');
    const allGames = getAllGamesFromUnified();
    const gameIds = Object.keys(allGames);
    
    if (gameIds.length === 0) {
        logger.info('UPDATE_PRICES', 'Nenhum jogo encontrado para atualizar preços.');
        return {};
    }

    logger.info('UPDATE_PRICES', `Atualizando preços de ${gameIds.length} jogos em múltiplas lojas usando IsThereAnyDeal API...`);
    
    const updatedPrices = {};
    const stores = ['steam', 'epic', 'microsoft'];
    
    // OTIMIZAÇÃO: Busca preços de todas as lojas em batch (muito mais eficiente!)
    for (const store of stores) {
        try {
            logger.info('UPDATE_PRICES', `Buscando preços ${store.toUpperCase()} em batch para ${gameIds.length} jogos...`);
            const storePrices = await checkPricesBatch(gameIds, store);
            
            // Processa resultados
            for (const [gameId, storePrice] of Object.entries(storePrices)) {
                if (storePrice !== null) {
                    if (!updatedPrices[gameId]) {
                        updatedPrices[gameId] = {};
                    }
                    updatedPrices[gameId][store] = storePrice;
                    
                    const gameData = allGames[gameId];
                    
                    // Salva no histórico adequado para cada loja
                    switch (store) {
                        case 'steam':
                            savePriceHistory(gameId, storePrice);
                            logger.price('UPDATE_PRICES', `Steam - ${gameData.gameInfo.name || 'ID: ' + gameId}`, { price: `R$${storePrice}` });
                            break;
                        case 'epic':
                            saveEpicPriceHistory(gameId, storePrice);
                            logger.price('UPDATE_PRICES', `Epic Game Store - ${gameData.gameInfo.name || 'ID: ' + gameId}`, { price: `R$${storePrice}` });
                            break;
                        case 'microsoft':
                            saveMicrosoftPriceHistory(gameId, storePrice);
                            logger.price('UPDATE_PRICES', `Microsoft Store - ${gameData.gameInfo.name || 'ID: ' + gameId}`, { price: `R$${storePrice}` });
                            break;
                    }
                } else {
                    const gameData = allGames[gameId];
                    logger.warning('UPDATE_PRICES', `${store.toUpperCase()} - Não foi possível obter preço: ${gameData.gameInfo.name || 'ID: ' + gameId}`);
                }
            }
            
            // Delay entre lojas para evitar rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (storeError) {
            logger.error('UPDATE_PRICES', `Erro ao buscar preços ${store} em batch`, storeError);
        }
    }
    
    // Verifica se algum jogo precisa de histórico adicional
    logger.info('UPDATE_PRICES', 'Verificando jogos que precisam de histórico adicional...');
    const historyThreshold = {
        steam: 5,
        epic: 3,
        microsoft: 3
    };
    
    for (const gameId of gameIds) {
        try {
            const gameData = allGames[gameId];
            const hasAnyPrice = updatedPrices[gameId] && Object.keys(updatedPrices[gameId]).length > 0;
            
            if (hasAnyPrice) {
                // Busca histórico para lojas com poucos registros
                for (const historyStore of stores) {
                    const currentHistory = loadGameHistory(gameId, historyStore);
                    if (currentHistory.length < historyThreshold[historyStore]) {
                        logger.info('UPDATE_PRICES', `Buscando histórico ${historyStore.toUpperCase()} da ITAD: Game ${gameId}`);
                        try {
                            await fetchPriceHistoryFromITAD(gameId, 90, historyStore);
                        } catch (historyError) {
                            logger.error('UPDATE_PRICES', `Erro ao buscar histórico ${historyStore}: Game ${gameId}`, historyError);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else {
                logger.warning('UPDATE_PRICES', `Nenhum preço encontrado em qualquer loja: ${gameData.gameInfo.name || 'ID: ' + gameId}`);
            }
        } catch (error) {
            logger.error('UPDATE_PRICES', `Erro ao processar histórico: Game ${gameId}`, error);
        }
    }
    
    const totalUpdated = Object.values(updatedPrices).filter(entry => entry && Object.keys(entry).length > 0).length;
    logger.success('UPDATE_PRICES', `Atualizados preços de ${totalUpdated} jogos em múltiplas lojas.`);
    return updatedPrices;
}

module.exports = {
    seedHistoryForGlobalGames,
    bulkAddGlobalGames,
    updateGlobalGamesPrices
};
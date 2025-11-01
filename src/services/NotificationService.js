const logger = require('../utils/logger');
const { loadMonitoredGames, checkHistoryPrice } = require('./dataManager');
const { checkPrice, getGameInfo } = require('./apiService');
const { 
    savePriceHistory, 
    saveEpicPriceHistory,
    saveMicrosoftPriceHistory,
    loadGameHistory, 
    loadEpicGameHistory,
    loadMicrosoftGameHistory,
    ensureHistoryEntries 
} = require('./dataManager');

// Função para enviar notificações de promoção (focada apenas nas notificações para usuários)
async function sendMessages(sock) {
    const monitoredGames = loadMonitoredGames();
    const currentPrice = {};

    const monitoredIds = [
        ...Object.values(monitoredGames.users || {}).flatMap(userGames => Object.keys(userGames)),
        ...Object.values(monitoredGames.groups || {}).flatMap(groupGames => Object.keys(groupGames))
    ];

    if (monitoredIds.length === 0) {
        logger.info('NOTIFICATION', 'Nenhum jogo sendo monitorado por usuários.');
        return;
    }

    logger.info('NOTIFICATION', `Verificando ${monitoredIds.length} jogos monitorados...`);
    ensureHistoryEntries(monitoredIds);

    // Processa jogos monitorados por usuários e grupos
    const allMonitored = {
        ...Object.fromEntries(Object.entries(monitoredGames.users || {}).map(([k, v]) => [k, { games: v, isGroup: false }])),
        ...Object.fromEntries(Object.entries(monitoredGames.groups || {}).map(([k, v]) => [k, { games: v, isGroup: true }]))
    };

    for (const [chatId, { games, isGroup }] of Object.entries(allMonitored)) {
        for (const [gameId, gameData] of Object.entries(games)) {
            const { url, targetPrice, epicgames = false, microsoft = false } = gameData;
            const { name, image } = await getGameInfo(gameId);
            
            // Helper para verificar se preço está desatualizado (mais de 1 hora)
            const isPriceStale = (historyData) => {
                if (!historyData || !historyData.timestamp) return true;
                const lastUpdate = new Date(historyData.timestamp);
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                return lastUpdate < oneHourAgo;
            };
            
            // Verifica Steam (sempre monitorado)
            let steamPrice = currentPrice[`${gameId}_steam`];
            if (steamPrice === undefined) {
                // OTIMIZAÇÃO: Tenta buscar do histórico local primeiro
                const historyData = checkHistoryPrice(gameId, 'steam');
                
                // Usa preço do histórico se estiver atualizado (menos de 1 hora)
                if (historyData && !isPriceStale(historyData)) {
                    steamPrice = historyData.price;
                    currentPrice[`${gameId}_steam`] = steamPrice;
                    logger.cache('NOTIFICATION', `Usando preço do histórico Steam: Game ${gameId}`, { price: `R$${steamPrice}` });
                } else {
                    // Só chama API se necessário
                    steamPrice = await checkPrice(gameId, 'steam');
                    if (steamPrice !== null) {
                        currentPrice[`${gameId}_steam`] = steamPrice;
                        savePriceHistory(gameId, steamPrice);
                        logger.price('NOTIFICATION', `Preço Steam atualizado via API: Game ${gameId}`, { price: `R$${steamPrice}` });
                    }
                }
            }

            // Verifica Epic Games (se habilitado)
            let epicPrice = null;
            if (epicgames) {
                epicPrice = currentPrice[`${gameId}_epic`];
                if (epicPrice === undefined) {
                    // OTIMIZAÇÃO: Tenta buscar do histórico local primeiro
                    const historyData = checkHistoryPrice(gameId, 'epic');
                    
                    // Usa preço do histórico se estiver atualizado (menos de 1 hora)
                    if (historyData && !isPriceStale(historyData)) {
                        epicPrice = historyData.price;
                        currentPrice[`${gameId}_epic`] = epicPrice;
                        logger.cache('NOTIFICATION', `Usando preço do histórico Epic: Game ${gameId}`, { price: `R$${epicPrice}` });
                    } else {
                        // Só chama API se necessário
                        epicPrice = await checkPrice(gameId, 'epic');
                        if (epicPrice !== null) {
                            currentPrice[`${gameId}_epic`] = epicPrice;
                            saveEpicPriceHistory(gameId, epicPrice);
                            logger.price('NOTIFICATION', `Preço Epic atualizado via API: Game ${gameId}`, { price: `R$${epicPrice}` });
                        }
                    }
                }
            }

            // Verifica Microsoft Store (se habilitado)
            let microsoftPrice = null;
            if (microsoft) {
                microsoftPrice = currentPrice[`${gameId}_microsoft`];
                if (microsoftPrice === undefined) {
                    // OTIMIZAÇÃO: Tenta buscar do histórico local primeiro
                    const historyData = checkHistoryPrice(gameId, 'microsoft');
                    
                    // Usa preço do histórico se estiver atualizado (menos de 1 hora)
                    if (historyData && !isPriceStale(historyData)) {
                        microsoftPrice = historyData.price;
                        currentPrice[`${gameId}_microsoft`] = microsoftPrice;
                        logger.cache('NOTIFICATION', `Usando preço do histórico Microsoft: Game ${gameId}`, { price: `R$${microsoftPrice}` });
                    } else {
                        // Só chama API se necessário
                        microsoftPrice = await checkPrice(gameId, 'microsoft');
                        if (microsoftPrice !== null) {
                            currentPrice[`${gameId}_microsoft`] = microsoftPrice;
                            saveMicrosoftPriceHistory(gameId, microsoftPrice);
                            logger.price('NOTIFICATION', `Preço Microsoft atualizado via API: Game ${gameId}`, { price: `R$${microsoftPrice}` });
                        }
                    }
                }
            }

            // Função auxiliar para verificar se deve notificar
            const shouldNotify = (price, priceHistory) => {
                if (price === null || price > targetPrice) return false;
                
                // Se não há histórico, notifica se estiver abaixo do target
                if (priceHistory.length === 0) {
                    return price <= targetPrice;
                }
                
                const lastRecordedPrice = priceHistory[priceHistory.length - 1].price;
                
                // Só notifica se:
                // 1. O preço atual é diferente do último registrado E
                // 2. O preço atual está abaixo do target E
                // 3. (É a primeira vez abaixo do target OU o preço diminuiu)
                if (price === lastRecordedPrice) {
                    return false; // Não notifica se o preço não mudou
                }
                
                if (price <= targetPrice) {
                    // Se o último preço estava acima do target e agora está abaixo, notifica
                    if (lastRecordedPrice > targetPrice) {
                        return true;
                    }
                    // Se o preço diminuiu e continua abaixo do target, notifica
                    if (price < lastRecordedPrice) {
                        return true;
                    }
                }
                
                return false;
            };

            // Verifica Steam
            if (steamPrice !== null) {
                const steamHistory = loadGameHistory(gameId);
                if (shouldNotify(steamPrice, steamHistory)) {
                    const message = `*🎮 Promoção na Steam!*\n\n` +
                                  `*${name}*\n` +
                                  `💰 *Preço atual:* R$ ${steamPrice.toFixed(2)}\n` +
                                  `🎯 *Seu preço desejado:* R$ ${targetPrice.toFixed(2)}\n` +
                                  `🔗 ${url}`;
                    
                    try {
                        await sock.sendMessage(chatId, {
                            image: { url: image },
                            caption: message
                        });
                        logger.success('NOTIFICATION', `Promoção Steam enviada para ${isGroup ? 'grupo' : 'usuário'} ${chatId}`, { game: name, price: `R$${steamPrice.toFixed(2)}` });
                    } catch (error) {
                        logger.baileysError('SEND_NOTIFICATION_STEAM', error);
                        logger.error('NOTIFICATION', `Falha ao enviar notificação Steam para ${chatId}`, error);
                    }
                }
            }

            // Verifica Epic Games
            if (epicPrice !== null && epicgames) {
                const epicHistory = loadEpicGameHistory(gameId);
                if (shouldNotify(epicPrice, epicHistory)) {
                    const message = `*🛒 Promoção na Epic Games!*\n\n` +
                                  `*${name}*\n` +
                                  `💰 *Preço atual:* R$ ${epicPrice.toFixed(2)}\n` +
                                  `🎯 *Seu preço desejado:* R$ ${targetPrice.toFixed(2)}\n` +
                                  `🔗 ${url}`;
                    
                    try {
                        await sock.sendMessage(chatId, {
                            image: { url: image },
                            caption: message
                        });
                        logger.success('NOTIFICATION', `Promoção Epic Games enviada para ${isGroup ? 'grupo' : 'usuário'} ${chatId}`, { game: name, price: `R$${epicPrice.toFixed(2)}` });
                    } catch (error) {
                        logger.baileysError('SEND_NOTIFICATION_EPIC', error);
                        logger.error('NOTIFICATION', `Falha ao enviar notificação Epic Games para ${chatId}`, error);
                    }
                }
            }

            // Verifica Microsoft Store
            if (microsoftPrice !== null && microsoft) {
                const microsoftHistory = loadMicrosoftGameHistory(gameId);
                if (shouldNotify(microsoftPrice, microsoftHistory)) {
                    const message = `*🏪 Promoção na Microsoft Store!*\n\n` +
                                  `*${name}*\n` +
                                  `💰 *Preço atual:* R$ ${microsoftPrice.toFixed(2)}\n` +
                                  `🎯 *Seu preço desejado:* R$ ${targetPrice.toFixed(2)}\n` +
                                  `🔗 ${url}`;
                    
                    try {
                        await sock.sendMessage(chatId, {
                            image: { url: image },
                            caption: message
                        });
                        logger.success('NOTIFICATION', `Promoção Microsoft Store enviada para ${isGroup ? 'grupo' : 'usuário'} ${chatId}`, { game: name, price: `R$${microsoftPrice.toFixed(2)}` });
                    } catch (error) {
                        logger.baileysError('SEND_NOTIFICATION_MICROSOFT', error);
                        logger.error('NOTIFICATION', `Falha ao enviar notificação Microsoft Store para ${chatId}`, error);
                    }
                }
            }
        }
    }

    logger.success('NOTIFICATION', 'Processamento de notificações concluído.');
}

module.exports = {
    sendMessages
};
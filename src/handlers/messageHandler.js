/**
 * WhatsApp Message Handler
 * 
 * Processes incoming WhatsApp messages and coordinates responses.
 * Handles both direct commands and multi-step user interactions.
 * 
 * Features:
 * - Command routing and execution
 * - Multi-step conversation state management
 * - System message tracking to prevent echo loops
 * - Support for both individual users and groups
 */

const { getContentType } = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const { handleCommand } = require('./commandHandler');
const { 
    getUserState, 
    clearUserState, 
    loadMonitoredGames, 
    saveMonitoredGames,
    savePriceHistory,
    saveEpicPriceHistory,
    saveMicrosoftPriceHistory
} = require('../services/dataManager');
const { getGameInfo, fetchPriceHistoryFromITAD, checkPrice } = require('../services/apiService');

// System for tracking bot-sent messages to prevent echo loops
const sentSystemMessages = new Set();

/**
 * Records a system message sent by the bot
 * Messages are tracked for 2 minutes to prevent the bot from responding to itself
 * 
 * @param {string} text - Message text to track
 */
function trackSystemMessage(text) {
    // Remove formatting and emojis for simpler comparison
    const cleanText = text.replace(/[*_~`]/g, '').replace(/[🎮🛒🎯💰⚠️✅❌]/g, '').trim();
    sentSystemMessages.add(cleanText);
    
    // Auto-cleanup old messages after 2 minutes
    setTimeout(() => {
        sentSystemMessages.delete(cleanText);
    }, 2 * 60 * 1000);
}

/**
 * Checks if a message was sent by the bot (system message)
 * 
 * @param {string} text - Message text to check
 * @returns {boolean} True if message is from bot system
 */
function isSystemMessage(text) {
    const cleanText = text.replace(/[*_~`]/g, '').replace(/[🎮🛒🎯💰⚠️✅❌]/g, '').trim();
    
    // Check for store selection messages (Portuguese)
    const isStoreSelection = text.includes('Seleção de Loja') || 
                           text.includes('Qual(is) loja(s)') ||
                           text.includes('Digite o número correspondente') ||
                           (text.includes('1') && text.includes('Steam') && text.includes('Epic Games'));
    
    // Check for invalid option messages (Portuguese)
    const isInvalidOption = text.includes('Opção inválida') || 
                          text.includes('Por favor, digite apenas o número');
    
    return isStoreSelection || isInvalidOption || sentSystemMessages.has(cleanText);
}

/**
 * Processes multi-step conversation responses based on user state
 * 
 * @param {Object} userState - Current state of user conversation
 * @param {string} text - User's response text
 * @param {string} userId - User or group ID
 * @param {boolean} isGroup - Whether message is from a group
 * @returns {Object} Response message object
 */
async function handleUserStateResponse(userState, text, userId, isGroup) {
    logger.debug('USER_STATE', `Processando estado para usuário ${userId}`, { text });
    
    if (userState.type === 'monitor_store_selection') {
        const choice = text.trim();
        
        if (!['1', '2', '3', '4'].includes(choice)) {
            logger.warning('USER_STATE', `Escolha inválida: ${choice} por usuário ${userId}`);
            return {
                text: "⚠️ *Opção inválida!*\n\n" +
                      "Por favor, digite apenas o número:\n" +
                      "*1* - Steam\n" +
                      "*2* - Epic Games\n" +
                      "*3* - Microsoft Store\n" +
                      "*4* - Todas as lojas\n\n" +
                      "_Ou digite /cancelar para cancelar o monitoramento._"
            };
        }

        logger.success('USER_STATE', `Escolha válida: ${choice} por usuário ${userId}`);
        const { gameUrl, gameId, targetPrice } = userState;
        const monitoredGames = loadMonitoredGames();
        const storage = isGroup ? monitoredGames.groups : monitoredGames.users;
        
        try {
            // Obtém informações do jogo
            const { name, image } = await getGameInfo(gameId);
            
            // Configura monitoramento conforme escolha
            if (!storage[userId]) storage[userId] = {};
            
            const gameData = {
                url: gameUrl,
                targetPrice: targetPrice,
                epicgames: choice === '2' || choice === '4', // Epic Games: 2 (apenas Epic) ou 4 (todas)
                microsoft: choice === '3' || choice === '4' // Microsoft Store: 3 (apenas Microsoft) ou 4 (todas)
            };
            
            storage[userId][gameId] = gameData;
            saveMonitoredGames(monitoredGames);
            
            // Atualiza histórico de preços para o jogo recém-adicionado
            logger.info('MONITOR', `Atualizando histórico de preços para o jogo ${gameId}...`);
            
            // Executa atualização do histórico E preços atuais em segundo plano (não bloqueia resposta)
            (async () => {
                try {
                    logger.info('HISTORY_UPDATE', `Iniciando busca de histórico: ${name} (ID: ${gameId})`);
                    
                    // Atualiza histórico Steam (sempre)
                    await fetchPriceHistoryFromITAD(gameId, 90, 'steam');
                    
                    // Atualiza histórico Epic Games se monitorado
                    if (gameData.epicgames) {
                        await fetchPriceHistoryFromITAD(gameId, 90, 'epic');
                    }
                    
                    // Atualiza histórico Microsoft Store se monitorado
                    if (gameData.microsoft) {
                        await fetchPriceHistoryFromITAD(gameId, 90, 'microsoft');
                    }
                    
                    logger.info('PRICE_UPDATE', 'Verificando preços atuais...');
                    
                    // Verifica e salva preços ATUAIS de todas as lojas monitoradas
                    // Steam (sempre)
                    const steamPrice = await checkPrice(gameId, 'steam');
                    if (steamPrice !== null) {
                        savePriceHistory(gameId, steamPrice);
                        logger.price('PRICE_UPDATE', `Preço atual Steam salvo: Game ${gameId}`, { price: `R$${steamPrice}` });
                    }
                    
                    // Epic Games se monitorado
                    if (gameData.epicgames) {
                        const epicPrice = await checkPrice(gameId, 'epic');
                        if (epicPrice !== null) {
                            saveEpicPriceHistory(gameId, epicPrice);
                            logger.price('PRICE_UPDATE', `Preço atual Epic Games salvo: Game ${gameId}`, { price: `R$${epicPrice}` });
                        } else {
                            logger.warning('PRICE_UPDATE', `Preço atual Epic Games não encontrado: Game ${gameId}`);
                        }
                    }
                    
                    // Microsoft Store se monitorado
                    if (gameData.microsoft) {
                        const microsoftPrice = await checkPrice(gameId, 'microsoft');
                        if (microsoftPrice !== null) {
                            saveMicrosoftPriceHistory(gameId, microsoftPrice);
                            logger.price('PRICE_UPDATE', `Preço atual Microsoft Store salvo: Game ${gameId}`, { price: `R$${microsoftPrice}` });
                        } else {
                            logger.warning('PRICE_UPDATE', `Preço atual Microsoft Store não encontrado: Game ${gameId}`);
                        }
                    }
                    
                    logger.success('HISTORY_UPDATE', `Histórico e preços atuais atualizados: ${name}`, { gameId });
                } catch (error) {
                    logger.error('HISTORY_UPDATE', `Falha ao atualizar histórico: ${name} (ID: ${gameId})`, error);
                }
            })();
            
            // Limpa estado do usuário
            clearUserState(userId);
            logger.debug('USER_STATE', `Estado limpo para usuário ${userId}`);
            
            // Monta mensagem de confirmação
            let storeText = '';
            switch (choice) {
                case '1': storeText = 'Steam'; break;
                case '2': storeText = 'Epic Games'; break;
                case '3': storeText = 'Microsoft Store'; break;
                case '4': storeText = 'Steam, Epic Games e Microsoft Store'; break;
            }
            
            return {
                image: { url: image },
                caption: `✅ *Jogo monitorado com sucesso!*\n\n` +
                        `🎮 *Nome:* ${name}\n` +
                        `🛒 *Loja(s):* ${storeText}\n` +
                        `🎯 *Preço desejado:* R$${targetPrice.toFixed(2)}\n\n` +
                        `📊 *Histórico de preços sendo atualizado...*\n` +
                        `_Você receberá notificações quando o preço atingir ou ficar abaixo do valor desejado._`
            };
        } catch (error) {
            logger.error('USER_STATE', 'Erro ao processar seleção de loja', error);
            clearUserState(userId);
            return {
                text: "❌ Erro ao salvar monitoramento. Tente novamente com `/monitorar`."
            };
        }
    }
    
    if (userState.type === 'edit_store_selection') {
        const choice = text.trim();
        
        if (!['1', '2', '3', '4', '5'].includes(choice)) {
            logger.warning('USER_STATE', `Escolha inválida: ${choice} por usuário ${userId}`);
            return {
                text: "⚠️ *Opção inválida!*\n\n" +
                      "Por favor, digite apenas o número:\n" +
                      "*1* - Steam\n" +
                      "*2* - Epic Games\n" +
                      "*3* - Microsoft Store\n" +
                      "*4* - Todas as lojas\n" +
                      "*5* - Manter lojas atuais\n\n" +
                      "_Ou digite /cancelar para cancelar a edição._"
            };
        }

        logger.success('USER_STATE', `Escolha válida para edição: ${choice} por usuário ${userId}`);
        const { gameUrl, gameId, targetPrice, currentStores } = userState;
        const monitoredGames = loadMonitoredGames();
        const storage = isGroup ? monitoredGames.groups : monitoredGames.users;
        
        try {
            // Obtém informações do jogo
            const { name, image } = await getGameInfo(gameId);
            
            // Configura monitoramento conforme escolha
            const gameData = {
                url: gameUrl,
                targetPrice: targetPrice,
                epicgames: choice === '5' ? currentStores.epicgames : (choice === '2' || choice === '4'),
                microsoft: choice === '5' ? currentStores.microsoft : (choice === '3' || choice === '4')
            };
            
            // Atualiza os dados do jogo
            storage[userId][gameId] = gameData;
            saveMonitoredGames(monitoredGames);
            
            logger.success('EDIT_GAME', `Jogo ${gameId} editado com sucesso para usuário ${userId}`, {
                newPrice: targetPrice,
                epicgames: gameData.epicgames,
                microsoft: gameData.microsoft
            });
            
            // Se alterou as lojas, atualiza histórico em segundo plano
            if (choice !== '5') {
                (async () => {
                    try {
                        logger.info('HISTORY_UPDATE', `Atualizando histórico após edição: ${name} (ID: ${gameId})`);
                        
                        // Atualiza histórico Epic Games se agora está monitorado
                        if (gameData.epicgames && !currentStores.epicgames) {
                            await fetchPriceHistoryFromITAD(gameId, 90, 'epic');
                            const epicPrice = await checkPrice(gameId, 'epic');
                            if (epicPrice !== null) {
                                saveEpicPriceHistory(gameId, epicPrice);
                                logger.price('PRICE_UPDATE', `Preço atual Epic Games salvo: Game ${gameId}`, { price: `R$${epicPrice}` });
                            }
                        }
                        
                        // Atualiza histórico Microsoft Store se agora está monitorado
                        if (gameData.microsoft && !currentStores.microsoft) {
                            await fetchPriceHistoryFromITAD(gameId, 90, 'microsoft');
                            const microsoftPrice = await checkPrice(gameId, 'microsoft');
                            if (microsoftPrice !== null) {
                                saveMicrosoftPriceHistory(gameId, microsoftPrice);
                                logger.price('PRICE_UPDATE', `Preço atual Microsoft Store salvo: Game ${gameId}`, { price: `R$${microsoftPrice}` });
                            }
                        }
                        
                        logger.success('HISTORY_UPDATE', `Histórico atualizado após edição: ${name}`, { gameId });
                    } catch (error) {
                        logger.error('HISTORY_UPDATE', `Falha ao atualizar histórico após edição: ${name} (ID: ${gameId})`, error);
                    }
                })();
            }
            
            // Limpa estado do usuário
            clearUserState(userId);
            logger.debug('USER_STATE', `Estado limpo para usuário ${userId} após edição`);
            
            // Monta mensagem de confirmação
            let storeText = '';
            let storeChangeText = '';
            
            switch (choice) {
                case '1': 
                    storeText = 'Steam'; 
                    storeChangeText = '\n🔄 *Lojas atualizadas!*';
                    break;
                case '2': 
                    storeText = 'Epic Games'; 
                    storeChangeText = '\n🔄 *Lojas atualizadas!*';
                    break;
                case '3': 
                    storeText = 'Microsoft Store'; 
                    storeChangeText = '\n🔄 *Lojas atualizadas!*';
                    break;
                case '4': 
                    storeText = 'Steam, Epic Games e Microsoft Store'; 
                    storeChangeText = '\n🔄 *Lojas atualizadas!*';
                    break;
                case '5': 
                    storeText = 'Steam' + 
                               (currentStores.epicgames ? ', Epic Games' : '') + 
                               (currentStores.microsoft ? ', Microsoft Store' : '');
                    storeChangeText = '\n✅ *Lojas mantidas!*';
                    break;
            }
            
            return {
                image: { url: image },
                caption: `✅ *Monitoramento editado com sucesso!*\n\n` +
                        `🎮 *Nome:* ${name}\n` +
                        `🛒 *Loja(s):* ${storeText}${storeChangeText}\n` +
                        `🎯 *Novo preço desejado:* R$${targetPrice.toFixed(2)}\n\n` +
                        `${choice !== '5' ? '📊 *Histórico de preços sendo atualizado...*\n' : ''}` +
                        `_Você receberá notificações quando o preço atingir ou ficar abaixo do valor desejado._`
            };
        } catch (error) {
            logger.error('USER_STATE', 'Erro ao processar edição de jogo', error);
            clearUserState(userId);
            return {
                text: "❌ Erro ao editar monitoramento. Tente novamente com `/editar`."
            };
        }
    }
    
    return null;
}

// Função para processar mensagens recebidas
async function handleMessage(message, sock) {
    try {
        if (!message.message) return;

        // Extrai o conteúdo da mensagem corretamente primeiro
        const contentType = getContentType(message.message);
        let text = '';

        if (contentType === 'conversation') {
            text = message.message.conversation;
        } else if (contentType === 'extendedTextMessage') {
            text = message.message.extendedTextMessage.text;
        } else if (contentType === 'imageMessage' && message.message.imageMessage.caption) {
            text = message.message.imageMessage.caption;
        }

        // Ignora apenas mensagens de sistema enviadas pelo próprio bot
        if (message.key.fromMe && isSystemMessage(text)) {
            logger.debug('MESSAGE', `Ignorando mensagem de sistema do bot: ${text.substring(0, 50)}...`);
            return;
        }

        // Se não conseguiu extrair texto, ignora a mensagem
        if (!text) {
            logger.debug('MESSAGE', 'Mensagem não é texto ou não tem conteúdo reconhecido');
            return; // Ignora outros tipos (áudio, vídeo, etc.)
        }

        const senderId = message.key.remoteJid;
        const isGroup = senderId.endsWith('@g.us');
        const groupId = isGroup ? senderId : null;
        const userId = isGroup ? groupId : senderId;
        const isCommand = text.startsWith('/');

        // Verifica se o usuário está em um estado de conversa multi-etapa
        const userState = getUserState(userId);
        
        if (userState) {
            logger.debug('USER_STATE', `Usuário ${userId} tem estado ativo`, { type: userState.type });
        }
        
        if (userState && !isCommand) {
            logger.debug('USER_STATE', `Processando resposta de estado: ${text}`);
            const response = await handleUserStateResponse(userState, text, userId, isGroup);
            if (response) {
                logger.debug('USER_STATE', 'Enviando resposta de estado');
                try {
                    if (response.image) {
                        await sock.sendMessage(senderId, {
                            image: response.image,
                            caption: response.caption
                        });
                        trackSystemMessage(response.caption);
                    } else {
                        await sock.sendMessage(senderId, { text: response.text });
                        trackSystemMessage(response.text);
                    }
                } catch (error) {
                    logger.baileysError('SEND_STATE_RESPONSE', error);
                    logger.error('MESSAGE', 'Falha ao enviar resposta de estado', error);
                }
            }
            return;
        }

        // Comando para cancelar processo em andamento
        if (isCommand && text.toLowerCase() === '/cancelar' && userState) {
            clearUserState(userId);
            logger.user('COMMAND', `Processo cancelado por usuário ${userId}`);
            try {
                await sock.sendMessage(senderId, { text: "❌ Processo cancelado." });
            } catch (error) {
                logger.baileysError('SEND_CANCEL_MESSAGE', error);
            }
            return;
        }

        if (isCommand) {
            const [command, ...args] = text.trim().split(' ');
            logger.user('COMMAND', `Comando detectado: ${command}`, { userId, args });

            const response = await handleCommand(senderId, command, args, isGroup, groupId, sock, message);
            if (response) {
                try {
                    if (Array.isArray(response)) {
                        // Se a resposta for uma lista (caso do /consultar)
                        for (const item of response) {
                            if (item.image) {
                                await sock.sendMessage(senderId, {
                                    image: item.image,
                                    caption: item.caption
                                });
                            } else {
                                await sock.sendMessage(senderId, { text: item.text });
                            }
                        }
                    } else {
                        // Se a resposta for um único objeto
                        if (response.sticker) {
                            // Envia sticker
                            await sock.sendMessage(senderId, {
                                sticker: response.sticker
                            }, { quoted: response.quoted });
                            logger.success('MESSAGE', 'Sticker enviado com sucesso');
                        } else if (response.image) {
                            await sock.sendMessage(senderId, {
                                image: response.image,
                                caption: response.caption
                            }, response.quoted ? { quoted: response.quoted } : {});
                            trackSystemMessage(response.caption);
                        } else if (response.text) {
                            // Verifica se text existe antes de enviar
                            await sock.sendMessage(senderId, { text: response.text });
                            trackSystemMessage(response.text);
                        } else if (typeof response === 'string') {
                            // Fallback: se response for uma string direta
                            await sock.sendMessage(senderId, { text: response });
                            trackSystemMessage(response);
                            logger.warning('MESSAGE', 'Comando retornou string em vez de objeto', { command });
                        } else {
                            logger.error('MESSAGE', 'Resposta de comando em formato inválido', { response, command });
                        }
                    }
                } catch (error) {
                    logger.baileysError('SEND_COMMAND_RESPONSE', error);
                    logger.error('MESSAGE', `Falha ao enviar resposta do comando ${command}`, error);
                }
            }
        }
    } catch (error) {
        logger.error('MESSAGE', 'Falha ao processar mensagem', error);
    }
}

module.exports = {
    handleMessage,
    trackSystemMessage
};
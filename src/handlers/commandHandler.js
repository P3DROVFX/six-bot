/**
 * Command Handler
 * 
 * Processes and executes all bot commands sent by users.
 * 
 * Available Commands:
 * - /monitorar - Monitor a game for price drops
 * - /consultar - Check monitored games and current prices
 * - /remover - Remove a game from monitoring
 * - /historico - View price history chart for a game
 * - /buscar - Search for games in the database
 * - /info - Get detailed game information
 * - /stats - View bot statistics
 * - /sticker - Create sticker from image
 * - /desticker - Convert sticker to image
 * - /help - Display help menu
 * - /owner - Show bot owner information
 * 
 * Admin Commands:
 * - /adicionar - Bulk add games to global tracking
 * - /atualizar - Force update of all game prices
 * - /editar - Edit game information in database
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { 
    loadMonitoredGames, 
    saveMonitoredGames, 
    getAllGamesFromUnified,
    checkHistoryPrice,
    setUserState,
    getUserState,
    clearUserState
} = require('../services/dataManager');
const { getGameInfo, getHistoryLow, searchGames } = require('../services/apiService');
const { extractGameIdsFromText, extractUrlFromText, generatePriceHistoryChart } = require('../utils/helpers');
const { bulkAddGlobalGames, updateGlobalGamesPrices } = require('../services/gameService');
const { createSticker, convertStickerToImage } = require('../utils/stickerMaker');
const { HISTORY_FILE, OWNER_INFO } = require('../config/constants');

/**
 * Main command handler function
 * 
 * @param {string} senderId - User who sent the command
 * @param {string} command - Command name (e.g., '/monitorar')
 * @param {Array} args - Command arguments
 * @param {boolean} isGroup - Whether command was sent in a group
 * @param {string} groupId - Group ID if applicable
 * @param {Object} sock - WhatsApp socket instance
 * @param {Object} message - Original message object (for quoted messages)
 * @returns {Object|Array} Response message(s) to send back
 */
async function handleCommand(senderId, command, args, isGroup, groupId, sock, message = null) {
    const monitoredGames = loadMonitoredGames();
    const storage = isGroup ? monitoredGames.groups : monitoredGames.users;
    const id = isGroup ? groupId : senderId;

    switch (command) {
        case '/monitorar':
            if (args.length === 0 || args.length < 2) {
                return { text: "Formato incorreto. Use: /monitorar <link_do_jogo> <preço_do_jogo>" };
            }

            const input = args.join(' '); // Junta todos os argumentos em uma única string
            if (!input) {
                return { text: "Formato incorreto. Use: /monitorar <link_do_jogo> <preço_do_jogo>" };
            }

            // Regex flexível: aceita URLs com ou sem nome do jogo após o ID
            // Exemplos válidos:
            // - https://store.steampowered.com/app/1234567/
            // - https://store.steampowered.com/app/1234567/Game_Name/
            const match = input.match(/^(https:\/\/store\.steampowered\.com\/app\/\d+\/?.*?)\s+(\d+\.?\d*)$/);
            if (!match) {
                return { text: "❌ Formato inválido.\n\nUse: `/monitorar <link> <preço>`\n\nExemplo:\n`/monitorar https://store.steampowered.com/app/1234567/ 50`" };
            }

            const [_, gameUrl, targetPrice] = match;
            const gameId = gameUrl.match(/app\/(\d+)/)?.[1];

            if (!gameId) {
                return { text: "Link do jogo inválido. Certifique-se de que é um link da Steam." };
            }

            if (isNaN(targetPrice)) {
                return { text: "Preço desejado inválido. Insira um número." };
            }

            // Salva estado para continuar o processo
            setUserState(id, {
                type: 'monitor_store_selection',
                gameUrl,
                gameId,
                targetPrice: parseFloat(targetPrice)
            });

            return {
                text: `🎮 *Seleção de Loja*\n\n` +
                      `Qual(is) loja(s) você gostaria de monitorar?\n\n` +
                      `*1* - Apenas Steam\n` +
                      `*2* - Apenas Epic Games\n` +
                      `*3* - Apenas Microsoft Store\n` +
                      `*4* - Todas as lojas (Steam, Epic Games e Microsoft Store)\n\n` +
                      `_Digite o número correspondente:_`
            };

        case '/consultar':
            if (!storage[id] || Object.keys(storage[id]).length === 0) {
                return { text: "Você não está monitorando nenhum jogo no momento." };
            }

            const formatPriceLine = (historyData) => {
                if (!historyData || historyData.price === null || historyData.price === undefined) {
                    return 'Indisponível';
                }

                const priceText = `R$${historyData.price.toFixed(2)}`;
                return historyData.timestamp
                    ? `${priceText}`
                    : priceText;
            };

            // Cria uma lista de jogos monitorados com imagens
            const gamesList = [];
            for (const [gameId, gameData] of Object.entries(storage[id])) {
                const { name, image } = await getGameInfo(gameId);

                const steamHistory = checkHistoryPrice(gameId, 'steam');
                const epicHistory = gameData.epicgames ? checkHistoryPrice(gameId, 'epic') : null;
                const microsoftHistory = gameData.microsoft ? checkHistoryPrice(gameId, 'microsoft') : null;

                let priceInfo = `*${name}*\n`;
                priceInfo += `🎮 *Steam:* ${formatPriceLine(steamHistory)}\n`;

                if (gameData.epicgames) {
                    priceInfo += `🛒 *Epic Games:* ${formatPriceLine(epicHistory)}\n`;
                }

                if (gameData.microsoft) {
                    priceInfo += `🏪 *Microsoft Store:* ${formatPriceLine(microsoftHistory)}\n`;
                }

                priceInfo += `🎯 *Preço desejado:* R$${gameData.targetPrice.toFixed(2)}\n`;
                priceInfo += `🔗 ${gameData.url}`;

                if (!steamHistory && !epicHistory && !microsoftHistory) {
                    priceInfo += `\nℹ️ Ainda não há registros de preço salvos para este jogo.`;
                }

                if (image) {
                    gamesList.push({
                        image: { url: image },
                        caption: priceInfo
                    });
                } else {
                    gamesList.push({
                        text: priceInfo
                    });
                }
            }

            // Retorna a lista de jogos monitorados
            return gamesList;

        case '/remover': {
            if (args.length === 0) {
                return { text: "Formato incorreto. Use: /remover <link_do_jogo>" };
            }
            

            const gameUrlToRemove = extractUrlFromText(args.join(' '));
            const gameIdToRemove = gameUrlToRemove?.match(/app\/(\d+)/)?.[1];

            if (!gameIdToRemove || !storage[id] || !storage[id][gameIdToRemove]) {
                return { text: "Jogo não encontrado na lista." };
            }

            logger.user('REMOVE_GAME', `Removendo jogo ${gameIdToRemove} para ${isGroup ? 'grupo' : 'usuário'} ${id}`);
            // Remove o jogo da lista de monitorados
            delete storage[id][gameIdToRemove];

            // Se o usuário não tiver mais jogos monitorados, remove o usuário da lista
            if (Object.keys(storage[id]).length === 0) {
                logger.info('REMOVE_GAME', `Usuário ${id} não tem mais jogos monitorados. Removendo da lista.`);
                delete storage[id];
            }


            saveMonitoredGames(monitoredGames);
            logger.success('REMOVE_GAME', `Jogo removido com sucesso: ${gameIdToRemove}`);
            return {text: "Jogo removido com sucesso."};
        }

        case '/editar': {
            if (args.length === 0 || args.length < 2) {
                return { text: "Formato incorreto. Use: /editar <link_do_jogo> <novo_preço>" };
            }

            const inputEdit = args.join(' ');
            if (!inputEdit) {
                return { text: "Formato incorreto. Use: /editar <link_do_jogo> <novo_preço>" };
            }

            const matchEdit = inputEdit.match(/^(https:\/\/store\.steampowered\.com\/app\/\d+\/\S+)\s+(\d+\.?\d*)$/);
            if (!matchEdit) {
                return { text: "Formato inválido. Certifique-se de que o link e o novo preço estão corretos.\nExemplo: /editar https://store.steampowered.com/app/1234567/Game_Name/ 59.99" };
            }

            const [__, gameUrlEdit, newTargetPrice] = matchEdit;
            const gameIdEdit = gameUrlEdit.match(/app\/(\d+)/)?.[1];

            if (!gameIdEdit) {
                return { text: "Link do jogo inválido. Certifique-se de que é um link da Steam." };
            }

            if (isNaN(newTargetPrice)) {
                return { text: "Preço desejado inválido. Insira um número." };
            }

            // Verifica se o jogo está sendo monitorado
            if (!storage[id] || !storage[id][gameIdEdit]) {
                return { text: "❌ Este jogo não está sendo monitorado.\n\nUse */consultar* para ver seus jogos monitorados ou */monitorar* para adicionar um novo jogo." };
            }

            // Obtém os dados atuais do jogo
            const currentGameData = storage[id][gameIdEdit];
            
            logger.user('EDIT_GAME', `Editando jogo ${gameIdEdit} para ${isGroup ? 'grupo' : 'usuário'} ${id}`, {
                oldPrice: currentGameData.targetPrice,
                newPrice: parseFloat(newTargetPrice)
            });

            // Salva estado para continuar o processo de edição
            setUserState(id, {
                type: 'edit_store_selection',
                gameUrl: gameUrlEdit,
                gameId: gameIdEdit,
                targetPrice: parseFloat(newTargetPrice),
                currentStores: {
                    epicgames: currentGameData.epicgames || false,
                    microsoft: currentGameData.microsoft || false
                }
            });

            // Obtém nome do jogo para exibir
            const { name } = await getGameInfo(gameIdEdit);

            return {
                text: `✏️ *Editando Monitoramento*\n\n` +
                      `🎮 *Jogo:* ${name}\n` +
                      `💰 *Preço anterior:* R$${currentGameData.targetPrice.toFixed(2)}\n` +
                      `💰 *Novo preço:* R$${parseFloat(newTargetPrice).toFixed(2)}\n\n` +
                      `📦 *Lojas atuais:*\n` +
                      `• Steam: ✅\n` +
                      `• Epic Games: ${currentGameData.epicgames ? '✅' : '❌'}\n` +
                      `• Microsoft Store: ${currentGameData.microsoft ? '✅' : '❌'}\n\n` +
                      `Deseja alterar as lojas monitoradas?\n\n` +
                      `*1* - Apenas Steam\n` +
                      `*2* - Apenas Epic Games\n` +
                      `*3* - Apenas Microsoft Store\n` +
                      `*4* - Todas as lojas (Steam, Epic Games e Microsoft Store)\n` +
                      `*5* - Manter lojas atuais (apenas atualizar preço)\n\n` +
                      `_Digite o número correspondente:_`
            };
        }

        case '/buscar':
        case '/search':
            if (args.length === 0) {
                return { 
                    text: "🔍 *Buscar Jogos na Steam*\n\n" +
                          "Use: `/buscar <nome do jogo>`\n\n" +
                          "Exemplo:\n" +
                          "`/buscar Cyberpunk 2077`\n" +
                          "`/buscar Red Dead Redemption`\n" +
                          "`/buscar GTA`\n\n" +
                          "💡 Mostrarei até 5 jogos com links e preços da Steam!"
                };
            }

            const searchQuery = args.join(' ');
            
            logger.user('COMMAND', `Comando /buscar executado por ${senderId}`, { query: searchQuery });
            
            try {
                // Busca jogos
                const searchResults = await searchGames(searchQuery, 5);
                
                if (searchResults.length === 0) {
                    return { 
                        text: `🔍 *Busca: "${searchQuery}"*\n\n` +
                              `❌ Nenhum jogo encontrado.\n\n` +
                              `💡 *Dicas:*\n` +
                              `• Tente um nome mais simples\n` +
                              `• Verifique a ortografia\n` +
                              `• Use palavras-chave principais\n\n` +
                              `Exemplo: Em vez de "The Witcher 3: Wild Hunt", tente "Witcher 3"`
                    };
                }

                // Formata resultados
                let responseText = `🔍 *Resultados para: "${searchQuery}"*\n\n`;
                responseText += `Encontrei ${searchResults.length} jogo(s):\n\n`;

                searchResults.forEach((game, index) => {
                    responseText += `${index + 1}. 🎮 *${game.title}*\n`;
                    
                    if (game.steamUrl) {
                        responseText += `   🔗 ${game.steamUrl}\n`;
                        
                        if (game.steamPrice !== null) {
                            responseText += `   💰 Preço: R$${game.steamPrice.toFixed(2)}\n`;
                        } else {
                            responseText += `   💰 Preço: Não disponível\n`;
                        }
                    } else {
                        responseText += `   ⚠️ Link da Steam não disponível\n`;
                    }
                    
                    responseText += `\n`;
                });

                responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                responseText += `💡 *Para monitorar um jogo:*\n`;
                responseText += `\`/monitorar <link> <preço>\`\n\n`;
                responseText += `Exemplo:\n`;
                
                // Pega o primeiro jogo com link disponível como exemplo
                const exampleGame = searchResults.find(g => g.steamUrl);
                if (exampleGame && exampleGame.steamPrice !== null) {
                    const examplePrice = (exampleGame.steamPrice * 0.9).toFixed(2);
                    responseText += `\`/monitorar ${exampleGame.steamUrl} ${examplePrice}\``;
                } else if (exampleGame) {
                    responseText += `\`/monitorar ${exampleGame.steamUrl} 50\``;
                }

                logger.success('COMMAND_BUSCAR', `Busca concluída para ${senderId}`, { 
                    query: searchQuery,
                    results: searchResults.length 
                });

                return { text: responseText };

            } catch (error) {
                logger.error('COMMAND_BUSCAR', 'Erro ao buscar jogos', error);
                return { 
                    text: `❌ *Erro ao buscar jogos*\n\n` +
                          `Ocorreu um erro ao processar sua busca.\n\n` +
                          `Tente novamente em alguns instantes.`
                };
            }

        case '/addglobal': {
            if (args.length === 0) {
                return { text: "Use: /addglobal <lista_de_ids_ou_links>. Exemplo: /addglobal 730,570,578080" };
            }

            const inputText = args.join(' ');
            const ids = extractGameIdsFromText(inputText);

            if (ids.length === 0) {
                return { text: "Não consegui encontrar nenhum ID de jogo. Informe os IDs ou links completos da Steam." };
            }

            const shouldFetchInfo = ids.length <= 40;
            const shouldSeedHistory = ids.length <= 250;

            const result = await bulkAddGlobalGames(ids, {
                fetchInfo: shouldFetchInfo,
                delayMs: 250,
                seedHistory: shouldSeedHistory,
                seedHistoryMax: shouldSeedHistory ? 250 : 0,
                seedDelayMs: ids.length > 40 ? 225 : 150
            });

            const summaryLines = [];

            if (result.added.length > 0) {
                const addedPreview = result.added
                    .slice(0, 15)
                    .map(entry => `• ${entry.name} (ID ${entry.id})`)
                    .join('\n');

                summaryLines.push(`✅ Adicionados ${result.added.length} jogos à lista global.`);

                if (addedPreview) {
                    summaryLines.push('', addedPreview);
                }

                if (result.added.length > 15) {
                    summaryLines.push('', `… e mais ${result.added.length - 15} jogos.`);
                }
            }

            if (result.alreadyTracked.length > 0) {
                summaryLines.push('', `ℹ️ ${result.alreadyTracked.length} jogos já estavam na lista e foram ignorados.`);
            }

            if (result.invalid.length > 0) {
                summaryLines.push('', `⚠️ Ignorados ${result.invalid.length} valores inválidos.`);
            }

            if (result.added.length === 0 && result.alreadyTracked.length === 0) {
                summaryLines.push('Nenhum jogo foi adicionado. Verifique se os IDs estão corretos.');
            }

            if (!shouldFetchInfo && result.added.length > 0) {
                summaryLines.push('', '⏳ Os nomes serão preenchidos automaticamente na próxima verificação de preços.');
            }

            if (result.seededCount && result.seededCount > 0) {
                summaryLines.push('', `🕒 Histórico inicial salvo para ${result.seededCount} jogos.`);
            }

            if (result.added.length > result.seededCount) {
                summaryLines.push('', `🔁 ${result.added.length - result.seededCount} jogos serão atualizados no próximo ciclo automático.`);
            }

            return { text: summaryLines.filter(Boolean).join('\n') };
        }

        case '/historico': {
            // Se não há argumentos, mostra lista de jogos monitorados
            if (args.length === 0) {
                if (!storage[id] || Object.keys(storage[id]).length === 0) {
                    return { text: "Você não está monitorando nenhum jogo. Use /monitorar para adicionar jogos à sua lista." };
                }

                let gamesList = "📊 *Jogos com histórico disponível:*\n\n";
                const historyData = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) : {};
                
                for (const [gameId, gameData] of Object.entries(storage[id])) {
                    const { name } = await getGameInfo(gameId);
                    const hasHistory = historyData[gameId] && historyData[gameId].length > 0;
                    const historyCount = hasHistory ? historyData[gameId].length : 0;
                    
                    gamesList += `🎮 *${name}*\n`;
                    gamesList += `📈 Registros: ${historyCount}\n`;
                    gamesList += `🔗 ${gameData.url}\n\n`;
                }
                
                gamesList += "ℹ️ *Para ver o gráfico de um jogo específico:*\n";
                gamesList += "`/historico <link_do_jogo>`";
                
                return { text: gamesList };
            }

            const gameUrl = extractUrlFromText(args.join(' '));
            const gameId = gameUrl?.match(/app\/(\d+)/)?.[1];

            if (!gameId) {
                return { text: "❌ Link do jogo inválido. Certifique-se de que é um link válido da Steam.\n\n*Exemplo:* `/historico https://store.steampowered.com/app/1234567/`" };
            }

            try {
                // Busca as configurações das lojas monitoradas para este jogo
                let storeConfig = { steam: true, epic: false, microsoft: false };
                
                // Verifica se o jogo está sendo monitorado e quais lojas
                if (storage[id] && storage[id][gameId]) {
                    const gameData = storage[id][gameId];
                    storeConfig = {
                        steam: true, // Steam sempre ativo
                        epic: gameData.epicgames || false,
                        microsoft: gameData.microsoft || false
                    };
                }
                
                // Busca o history low da ITAD API (Steam por padrão)
                const historyLow = await getHistoryLow(gameId, 'steam');
                
                // Gera o gráfico do histórico de preços com history low e configuração de lojas
                const chartData = await generatePriceHistoryChart(gameId, historyLow, storeConfig);
                
                if (!chartData) {
                    return { text: `❌ Não há histórico de preços disponível para este jogo.\n\nO histórico só é criado quando:\n• O jogo está sendo monitorado\n• Há mudanças de preço registradas` };
                }

                // Cria a mensagem com as informações do histórico
                const changeEmoji = chartData.priceChange > 0 ? '📈' : chartData.priceChange < 0 ? '📉' : '📊';
                const changeText = chartData.priceChange > 0 ? 'aumento' : chartData.priceChange < 0 ? 'redução' : 'sem alteração';
                
                const historyMessage = `📊 *Histórico de Preços*\n\n` +
                                     `🎮 *Jogo:* ${chartData.gameName}\n` +
                                     `📅 *Período:* ${chartData.firstDate} - ${chartData.lastDate}\n` +
                                     `📈 *Total de registros:* ${chartData.totalEntries}\n\n` +
                                     `💰 *Preço mínimo:* R$ ${chartData.minPrice.toFixed(2)}\n` +
                                     `💸 *Preço máximo:* R$ ${chartData.maxPrice.toFixed(2)}\n` +
                                     `🏁 *Preço inicial:* R$ ${chartData.firstPrice.toFixed(2)}\n` +
                                     `🔄 *Preço atual:* R$ ${chartData.currentPrice.toFixed(2)}\n\n` +
                                     `${changeEmoji} *Variação:* ${chartData.priceChange.toFixed(1)}% (${changeText})`;

                return {
                    image: { url: chartData.chartUrl },
                    caption: historyMessage
                };
            } catch (error) {
                logger.error('COMMAND_HISTORICO', 'Erro ao processar comando /historico', error);
                return { text: "❌ Erro interno ao gerar o gráfico. Tente novamente em alguns instantes." };
            }
        }

        case '/updateprices': {
            // Comando para forçar atualização de preços dos jogos globais
            try {
                logger.user('COMMAND', `Comando /updateprices executado por ${id}`);
                const message = await sock.sendMessage(id, { text: "🔄 Iniciando atualização de preços dos jogos globais... Isso pode demorar alguns minutos." });
                
                const startTime = Date.now();
                const updatedPrices = await updateGlobalGamesPrices();
                const endTime = Date.now();
                const duration = Math.round((endTime - startTime) / 1000);
                
                logger.success('COMMAND_UPDATEPRICES', `Atualização concluída em ${duration}s`, { processed: Object.keys(updatedPrices).length });
                
                const responseText = `✅ *Atualização concluída!*\n\n` +
                                   `⏱️ *Tempo:* ${duration} segundos\n` +
                                   `📊 *Jogos processados:* ${Object.keys(updatedPrices).length}\n` +
                                   `🔄 *Preços atualizados:* ${Object.keys(updatedPrices).filter(id => updatedPrices[id] !== null).length}\n\n` +
                                   `*Próxima atualização automática em 6 horas.*`;
                
                return { text: responseText };
            } catch (error) {
                logger.error('COMMAND_UPDATEPRICES', 'Erro ao executar comando /updateprices', error);
                return { text: "❌ Erro ao atualizar preços. Tente novamente em alguns instantes." };
            }
        }

        case '/stats':
        case '/estatisticas': {
            try {
                const allGames = getAllGamesFromUnified();
                const gameIds = Object.keys(allGames);
                
                // Estatísticas gerais
                let totalGames = gameIds.length;
                let gamesWithPrices = 0;
                let totalPriceEntries = 0;
                
                // Estatísticas de lojas
                let gamesWithSteam = 0;
                let gamesWithEpic = 0;
                let gamesWithMicrosoft = 0;
                
                // Estatísticas de preços
                let totalCurrentPrices = 0;
                let totalHistoryLows = 0;
                let gamesOnSale = 0; // Preço atual menor que histórico
                let bestDeals = []; // Top 5 melhores ofertas
                
                // Análise de jogos monitorados pelo usuário
                let userMonitoredCount = 0;
                let userGamesAtTarget = 0;
                let userBestOpportunities = [];
                
                if (storage[id]) {
                    userMonitoredCount = Object.keys(storage[id]).length;
                }
                
                // Análise detalhada
                for (const gameId of gameIds) {
                    const game = allGames[gameId];
                    
                    // Contadores de preços
                    if (game.priceHistory) {
                        if (game.priceHistory.steam?.length > 0) {
                            gamesWithSteam++;
                            totalPriceEntries += game.priceHistory.steam.length;
                        }
                        if (game.priceHistory.epic?.length > 0) {
                            gamesWithEpic++;
                            totalPriceEntries += game.priceHistory.epic.length;
                        }
                        if (game.priceHistory.microsoft?.length > 0) {
                            gamesWithMicrosoft++;
                            totalPriceEntries += game.priceHistory.microsoft.length;
                        }
                        
                        if (game.priceHistory.steam?.length > 0 || 
                            game.priceHistory.epic?.length > 0 || 
                            game.priceHistory.microsoft?.length > 0) {
                            gamesWithPrices++;
                        }
                    }
                    
                    // Análise de ofertas (Steam)
                    if (game.priceHistory?.steam?.length > 0 && game.gameInfo) {
                        const latestPrice = game.priceHistory.steam[game.priceHistory.steam.length - 1].price;
                        const historyLow = game.gameInfo.historyLow_steam || latestPrice;
                        
                        totalCurrentPrices += latestPrice;
                        totalHistoryLows += historyLow;
                        
                        // Verifica se está em oferta (preço atual = mínimo histórico)
                        if (latestPrice === historyLow && latestPrice > 0) {
                            gamesOnSale++;
                        }
                        
                        // Calcula desconto em relação ao histórico
                        if (historyLow > 0 && latestPrice > historyLow) {
                            const discountPercent = ((latestPrice - historyLow) / latestPrice * 100);
                            bestDeals.push({
                                name: game.gameInfo.name,
                                current: latestPrice,
                                low: historyLow,
                                discount: discountPercent
                            });
                        }
                        
                        // Verifica jogos monitorados pelo usuário
                        if (storage[id] && storage[id][gameId]) {
                            const targetPrice = storage[id][gameId].targetPrice;
                            const isAtTarget = latestPrice <= targetPrice;
                            
                            if (isAtTarget) {
                                userGamesAtTarget++;
                            }
                            
                            // Calcula proximidade do preço alvo
                            const proximity = ((latestPrice - targetPrice) / targetPrice * 100);
                            userBestOpportunities.push({
                                name: game.gameInfo.name,
                                current: latestPrice,
                                target: targetPrice,
                                proximity: proximity,
                                isAtTarget: isAtTarget
                            });
                        }
                    }
                }
                
                // Ordena melhores ofertas (menor desconto = melhor oferta)
                bestDeals.sort((a, b) => a.discount - b.discount);
                const top5Deals = bestDeals.slice(0, 3);
                
                // Ordena melhores oportunidades do usuário
                userBestOpportunities.sort((a, b) => a.proximity - b.proximity);
                const top3Opportunities = userBestOpportunities.slice(0, 3);
                
                // Calcula médias
                const avgPriceEntries = gamesWithPrices > 0 ? (totalPriceEntries / gamesWithPrices).toFixed(1) : 0;
                const avgCurrentPrice = gamesWithPrices > 0 ? (totalCurrentPrices / gamesWithPrices).toFixed(2) : 0;
                const avgHistoryLow = gamesWithPrices > 0 ? (totalHistoryLows / gamesWithPrices).toFixed(2) : 0;
                
                // Monta mensagem
                let statsText = `📊 *Estatísticas do Sistema*\n\n`;
                
                // Estatísticas gerais
                statsText += `🎮 *Jogos no Banco de Dados*\n`;
                statsText += `   Total: ${totalGames} jogos\n`;
                statsText += `   Com preços: ${gamesWithPrices}\n`;
                statsText += `   Registros de preço: ${totalPriceEntries}\n\n`;
                
                // Estatísticas por loja
                statsText += `🏪 *Cobertura por Loja*\n`;
                statsText += `   🎮 Steam: ${gamesWithSteam} jogos\n`;
                statsText += `   🎯 Epic Games: ${gamesWithEpic} jogos\n`;
                statsText += `   🎪 Microsoft: ${gamesWithMicrosoft} jogos\n\n`;
                
                // Estatísticas de preços
                statsText += ` *Análise de Preços (Steam)*\n`;
                statsText += `   Preço médio atual: R$ ${avgCurrentPrice}\n`;
                statsText += `   Mínimo histórico médio: R$ ${avgHistoryLow}\n`;
                statsText += `   Jogos no mínimo histórico: ${gamesOnSale}\n\n`;
                
                // Estatísticas do usuário
                if (userMonitoredCount > 0) {
                    statsText += `👤 *Seus Jogos Monitorados*\n`;
                    statsText += `   Total monitorado: ${userMonitoredCount}\n`;
                    statsText += `   No preço alvo: ${userGamesAtTarget} 🎯\n`;
                    statsText += `   Aguardando: ${userMonitoredCount - userGamesAtTarget}\n\n`;
                    
                    // Top 3 oportunidades do usuário
                    if (top3Opportunities.length > 0) {
                        statsText += `� *Melhores Oportunidades para Você:*\n`;
                        top3Opportunities.forEach((opp, index) => {
                            const emoji = opp.isAtTarget ? '✅' : '⏳';
                            const proximityText = opp.isAtTarget 
                                ? 'NO ALVO!' 
                                : opp.proximity > 0 
                                    ? `${opp.proximity.toFixed(0)}% acima` 
                                    : `${Math.abs(opp.proximity).toFixed(0)}% abaixo`;
                            statsText += `   ${emoji} ${opp.name.substring(0, 25)}...\n`;
                            statsText += `      Atual: R$ ${opp.current.toFixed(2)} | Alvo: R$ ${opp.target.toFixed(2)}\n`;
                            statsText += `      ${proximityText}\n`;
                        });
                        statsText += `\n`;
                    }
                } else {
                    statsText += `*Seus Jogos Monitorados*\n`;
                    statsText += `   Você ainda não está monitorando jogos.\n`;
                    statsText += `   Use */monitorar* para começar!\n\n`;
                }
                
                // Top 3 melhores ofertas globais
                if (top5Deals.length > 0) {
                    statsText += `🏆 *Melhores Ofertas Globais:*\n`;
                    top5Deals.forEach((deal, index) => {
                        statsText += `   ${index + 1}. ${deal.name.substring(0, 28)}...\n`;
                        statsText += `      Preço: R$ ${deal.current.toFixed(2)} (Mín: R$ ${deal.low.toFixed(2)})\n`;
                    });
                    statsText += `\n`;
                }
                statsText += `🔄 *Estes dados são atualizados a cada 6 horas.*`;
                
                
                logger.info('COMMAND_STATS', 'Estatísticas geradas', {
                    usuario: id,
                    totalJogos: totalGames,
                    monitorados: userMonitoredCount
                });
                
                return { text: statsText };
                
            } catch (error) {
                logger.error('COMMAND_STATS', 'Erro ao gerar estatísticas', error);
                return { 
                    text: `❌ *Erro ao gerar estatísticas*\n\n${error.message}\n\n` +
                          `Tente novamente em alguns instantes.`
                };
            }
        }

        case '/sticker':
        case '/stiker':
        case '/figurinha':
        case '/s':
            try {
                // Verifica se há uma mensagem citada com mídia
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                
                if (!quotedMessage) {
                    return { 
                        text: "❌ *Como usar:*\n\n" +
                              "1️⃣ Envie uma imagem ou vídeo (máx 10s)\n" +
                              "2️⃣ Responda a imagem/vídeo com */sticker*\n\n" +
                              "Ou envie uma imagem com legenda */sticker*"
                    };
                }

                // Cria mensagem temporária com a mídia citada
                const mediaMessage = {
                    key: message.key,
                    message: quotedMessage
                };

                logger.user('COMMAND', `Comando /sticker executado por ${senderId}`);
                
                // Cria o sticker
                const stickerBuffer = await createSticker(mediaMessage, sock);
                
                // Retorna o sticker
                logger.success('COMMAND_STICKER', 'Sticker criado e pronto para envio');
                return {
                    sticker: stickerBuffer,
                    quoted: message
                };
            } catch (error) {
                logger.error('COMMAND_STICKER', 'Erro ao criar sticker', error);
                return { 
                    text: `❌ *Erro ao criar sticker*\n\n${error.message}\n\n` +
                          `💡 *Dica:* Certifique-se de enviar:\n` +
                          `• Imagem (JPG, PNG)\n` +
                          `• Vídeo ou GIF (máximo 10 segundos)`
                };
            }

        case '/toimg':
        case '/toimagem':
            try {
                // Verifica se há um sticker citado
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                
                if (!quotedMessage || !quotedMessage.stickerMessage) {
                    return { 
                        text: "❌ *Como usar:*\n\n" +
                              "Responda a um sticker com */toimg* para convertê-lo em imagem"
                    };
                }

                // Cria mensagem temporária com o sticker citado
                const stickerMessage = {
                    key: message.key,
                    message: quotedMessage
                };

                logger.user('COMMAND', `Comando /toimg executado por ${senderId}`);
                
                // Converte o sticker para imagem
                const imageBuffer = await convertStickerToImage(stickerMessage, sock);
                
                // Retorna a imagem
                logger.success('COMMAND_TOIMG', 'Sticker convertido para imagem com sucesso');
                return {
                    image: imageBuffer,
                    caption: '✅ Sticker convertido para imagem!',
                    quoted: message
                };
            } catch (error) {
                logger.error('COMMAND_TOIMG', 'Erro ao converter sticker para imagem', error);
                return { 
                    text: `❌ *Erro ao converter sticker*\n\n${error.message}\n\n` +
                          `💡 *Dica:* Certifique-se de responder a um sticker válido`
                };
            }

        case '/help':
        case '/ajuda':
            try {
                const logoPath = path.join(__dirname, '..', 'assets', 'logo_six.jpg');
                let imageBuffer = null;
                
                // Tenta ler a imagem, mas continua mesmo se falhar
                if (fs.existsSync(logoPath)) {
                    imageBuffer = fs.readFileSync(logoPath);
                    logger.debug('COMMAND_HELP', 'Logo carregada com sucesso');
                } else {
                    logger.warning('COMMAND_HELP', 'Logo não encontrada', { path: logoPath });
                }
                
                const helpText = `━━━━━━━━━━━━━━━━\n` +
                      `          *SIX BOT*     \n` +
                      `━━━━━━━━━━━━━━━━\n\n` +
                      `*📊 Monitoramento de Preços:*\n` +
                      `┣━ 🔎 \`/buscar <nome>\`\n` +
                      `┃   └─ Busca jogos na Steam\n` +
                      `┣━ 📝 \`/monitorar <link> <preço>\`\n` +
                      `┃   └─ Monitora um jogo\n` +
                      `┣━ 📋 \`/consultar\`\n` +
                      `┃   └─ Lista seus jogos monitorados\n` +
                      `┣━ ✏️ \`/editar <link> <novo_preço>\`\n` +
                      `┃   └─ Edita preço e lojas monitoradas\n` +
                      `┣━ 🗑️ \`/remover <link>\`\n` +
                      `┃   └─ Remove um jogo monitorado\n` +
                      `┣━ 📊 \`/historico <link>\`\n` +
                      `┃   └─ Gráfico de preços\n` +
                      `┗━ 📈 \`/stats\`\n` +
                      `    └─ Estatísticas detalhadas\n\n` +
                      `*🎨 Stickers:*\n` +
                      `┣━ ✨ \`/sticker\` ou \`/s\`\n` +
                      `┃   └─ Cria sticker de imagem/vídeo\n` +
                      `┗━ 🖼️ \`/toimg\`\n` +
                      `    └─ Converte sticker em imagem\n\n` +
                      `*ℹ️ Informações:*\n` +
                      `┣━ ❓ \`/help\`\n` +
                      `┃   └─ Mostra esta ajuda\n` +
                      `┗━ 📞 \`/info\`\n` +
                      `    └─ Informações e contato\n\n` +
                      `━━━━━━━━━━━━━━━━\n` +
                
                logger.info('COMMAND_HELP', 'Ajuda solicitada', { usuario: senderId });
                
                // Retorna com imagem se disponível, senão apenas texto
                if (imageBuffer) {
                    return {
                        image: imageBuffer,
                        caption: helpText
                    };
                } else {
                    return { text: helpText };
                }
            } catch (error) {
                logger.error('COMMAND_HELP', 'Erro ao processar comando de ajuda', error);
                return { 
                    text: `🤖 *SIX BOT - Ajuda*\n\n` +
                          `*Comandos Principais:*\n` +
                          `/monitorar, /consultar, /remover\n` +
                          `/historico, /stats, /sticker, /toimg\n\n` +
                          `Use */help* para ver detalhes.`
                };
            }

        case '/info':
        case '/contato':
        case '/sobre':
            try {
                const logoPath = path.join(__dirname, '..', 'assets', 'logo_six.jpg');
                let imageBuffer = null;
                
                // Tenta ler a imagem do logo
                if (fs.existsSync(logoPath)) {
                    imageBuffer = fs.readFileSync(logoPath);
                    logger.debug('COMMAND_INFO', 'Logo carregada com sucesso');
                } else {
                    logger.warning('COMMAND_INFO', 'Logo não encontrada', { path: logoPath });
                }
                
                const infoText = `╔════════════════════╗\n` +
                      `║  ℹ️ *INFORMAÇÕES*  ║\n` +
                      `╚════════════════════╝\n\n` +
                      `🤖 *Sobre o Bot*\n` +
                      `${OWNER_INFO.description}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `👤 *Desenvolvedor*\n` +
                      `${OWNER_INFO.name}\n\n` +
                      `📱 *Contato*\n` +
                      `┣━ WhatsApp: +${OWNER_INFO.whatsapp}\n` +
                      `┃   ${OWNER_INFO.whatsappLink}\n` +
                      `┣━ Email: ${OWNER_INFO.email}\n` +
                      `┗━ GitHub: ${OWNER_INFO.github}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `💡 *Recursos do Bot:*\n` +
                      `✅ Monitoramento de preços\n` +
                      `✅ Suporte a múltiplas lojas\n` +
                      `✅ Histórico de preços\n` +
                      `✅ Criação de stickers\n` +
                      `✅ Estatísticas detalhadas\n` +
                      `✅ Busca de jogos\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `🆘 *Precisa de ajuda?*\n` +
                      `Use */help* para ver todos os comandos\n` +
                      `ou entre em contato pelo WhatsApp!\n\n`;
                
                logger.info('COMMAND_INFO', 'Informações solicitadas', { usuario: senderId });
                
                // Retorna com imagem se disponível, senão apenas texto
                if (imageBuffer) {
                    return {
                        image: imageBuffer,
                        caption: infoText
                    };
                } else {
                    return { text: infoText };
                }
            } catch (error) {
                logger.error('COMMAND_INFO', 'Erro ao processar comando de informações', error);
                return { 
                    text: `ℹ️ *SIX BOT - Informações*\n\n` +
                          `👤 *Desenvolvedor:* ${OWNER_INFO.name}\n` +
                          `📱 *WhatsApp:* +${OWNER_INFO.whatsapp}\n` +
                          `📧 *Email:* ${OWNER_INFO.email}\n\n` +
                          `Use */help* para ver os comandos disponíveis.`
                };
            }
    }
}

module.exports = {
    handleCommand
};
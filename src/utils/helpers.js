/**
 * Helper Utilities
 * 
 * Collection of utility functions used across the bot.
 * 
 * Features:
 * - Text parsing for game URLs and IDs
 * - Price history chart generation
 * - Multi-store data visualization
 */

const QuickChart = require('quickchart-js');
const { loadGameHistory, loadEpicGameHistory, loadMicrosoftGameHistory } = require('../services/dataManager');
const { getGameInfo } = require('../services/apiService');

/**
 * Extracts Steam store URL from text message
 * 
 * @param {string} text - Message text to parse
 * @returns {string|null} Extracted Steam URL or null if not found
 */
function extractUrlFromText(text) {
    // Regex to capture Steam store URLs
    const urlRegex = /https:\/\/store\.steampowered\.com\/app\/\d+\/[^\s]*/g;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
}

/**
 * Extracts game IDs from text (from URLs or standalone numbers)
 * 
 * @param {string} text - Message text to parse
 * @returns {Array<string>} Array of extracted game IDs
 */
function extractGameIdsFromText(text) {
    if (!text) return [];

    const ids = new Set();

    // Extract from Steam URLs (app/123456)
    const urlRegex = /app\/(\d{3,})/gi;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(text)) !== null) {
        ids.add(urlMatch[1]);
    }

    // Extract standalone numbers (3+ digits)
    const numericRegex = /\b(\d{3,})\b/g;
    let numericMatch;
    while ((numericMatch = numericRegex.exec(text)) !== null) {
        ids.add(numericMatch[1]);
    }

    return Array.from(ids);
}

/**
 * Generates price history chart for a game across multiple stores
 * 
 * Creates a visual chart showing price trends over time using QuickChart API.
 * Supports Steam, Epic Games, and Microsoft Store data.
 * 
 * @param {string} gameId - Steam App ID
 * @param {Object|null} historyLow - Historical low price data
 * @param {Object} storeConfig - Which stores to include {steam, epic, microsoft}
 * @returns {Promise<string|null>} Chart URL or null if no data available
 */
async function generatePriceHistoryChart(gameId, historyLow = null, storeConfig = { steam: true, epic: false, microsoft: false }) {
    try {
        const { name } = await getGameInfo(gameId);

        const STORE_STYLES = {
            steam: {
                label: 'Steam',
                emoji: '🎮',
                stroke: '#0c6cf2',
                fill: 'rgba(12, 108, 242, 0.12)'
            },
            epic: {
                label: 'Epic Game Store',
                emoji: '🛒',
                stroke: '#2a2a2a',
                fill: 'rgba(42, 42, 42, 0.10)'
            },
            microsoft: {
                label: 'Microsoft Store',
                emoji: '🏪',
                stroke: '#13a10e',
                fill: 'rgba(19, 161, 14, 0.10)'
            }
        };

        const loaders = {
            steam: loadGameHistory,
            epic: loadEpicGameHistory,
            microsoft: loadMicrosoftGameHistory
        };

        const storeHistories = {};
        let globalMin = Number.POSITIVE_INFINITY;
        let globalMax = Number.NEGATIVE_INFINITY;
        const allTimestamps = new Set();

        Object.entries(storeConfig).forEach(([store, enabled]) => {
            if (!enabled) return;
            const history = loaders[store](gameId)
                ?.filter(entry => entry && entry.timestamp && entry.price !== undefined && entry.price !== null)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (history && history.length) {
                storeHistories[store] = history;
                history.forEach(entry => {
                    allTimestamps.add(entry.timestamp);
                    const price = Number(entry.price);
                    if (!Number.isNaN(price)) {
                        globalMin = Math.min(globalMin, price);
                        globalMax = Math.max(globalMax, price);
                    }
                });
            }
        });

        if (!Object.keys(storeHistories).length) {
            console.log(`Nenhum histórico encontrado para ${gameId}`);
            return null;
        }

        const orderedDates = Array.from(allTimestamps)
            .sort((a, b) => new Date(a) - new Date(b));
        const labels = orderedDates.map(ts =>
            new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        );

        const datasets = Object.entries(storeHistories).map(([store, history]) => {
            const style = STORE_STYLES[store];
            let lastValue = null;

            const prices = orderedDates.map(date => {
                const entry = history.find(item => item.timestamp === date);

                if (entry) {
                    lastValue = Number(entry.price);
                    return lastValue;
                }

                return lastValue !== null ? lastValue : null;
            });

            return {
                label: `${style.emoji} ${style.label}`,
                data: prices,
                borderColor: style.stroke,
                backgroundColor: style.fill,
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                tension: 0,
                lineTension: 0,
                stepped: true,
                steppedLine: 'after',
                fill: true,
                spanGaps: false
            };
        });

        const chartPadding = Math.max(1, Math.round((globalMax - globalMin) * 0.08));
        const paddedMin = Math.max(0, globalMin - chartPadding);
        const paddedMax = globalMax + chartPadding;

        const chart = new QuickChart();
        chart.setWidth(1100);
        chart.setHeight(600);
        chart.setBackgroundColor('#f5f7fb');
        chart.setConfig({
            type: 'line',
            data: { labels, datasets },
            options: {
                elements: {
                    line: {
                        tension: 0,
                        stepped: true
                    }
                },
                layout: {
                    padding: { top: 40, right: 30, left: 30, bottom: 30 }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `Histórico de preços — ${name}`,
                        color: '#1f2933',
                        font: {
                            family: 'Inter, "Segoe UI", sans-serif',
                            weight: '700',
                            size: 22
                        },
                        padding: { bottom: 16 }
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            usePointStyle: true,
                            padding: 18,
                            color: '#364152',
                            font: {
                                family: 'Inter, "Segoe UI", sans-serif',
                                weight: '600'
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        padding: 12,
                        backgroundColor: 'rgba(17, 24, 39, 0.92)',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        titleFont: { family: 'Inter', weight: '700' },
                        bodyFont: { family: 'Inter', weight: '500' },
                        displayColors: true,
                        callbacks: {
                            label: ctx => {
                                const value = ctx.parsed.y;
                                return `${ctx.dataset.label}: ${value !== null ? `R$ ${value.toFixed(2)}` : 'sem dado'}`;
                            }
                        }
                    }
                },
                interaction: { mode: 'nearest', intersect: false },
                scales: {
                    y: {
                        suggestedMin: paddedMin,
                        suggestedMax: paddedMax,
                        title: {
                            display: true,
                            text: 'Preço (R$)',
                            color: '#364152',
                            font: { family: 'Inter', weight: '600', size: 14 }
                        },
                        ticks: {
                            color: '#52606d',
                            font: { family: 'Inter', size: 11 },
                            callback: value => `R$ ${Number(value).toFixed(2)}`
                        },
                        grid: {
                            color: 'rgba(82, 96, 109, 0.08)',
                            borderDash: [4, 8]
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Período',
                            color: '#364152',
                            font: { family: 'Inter', weight: '600', size: 14 }
                        },
                        ticks: {
                            color: '#52606d',
                            font: { family: 'Inter', size: 11 },
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12
                        },
                        grid: {
                            color: 'rgba(82, 96, 109, 0.05)',
                            borderDash: [2, 6]
                        }
                    }
                }
            }
        });

        const allEntries = Object.values(storeHistories).flat().length;
        const firstStore = Object.values(storeHistories).find(hist => hist.length);
        const firstPrice = firstStore ? Number(firstStore[0].price) : null;
        const currentPrice = firstStore ? Number(firstStore[firstStore.length - 1].price) : null;
        const minPrice = historyLow !== null ? historyLow : globalMin;
        const variation = firstPrice && currentPrice ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;

        return {
            chartUrl: chart.getUrl(),
            gameName: name,
            totalEntries: allEntries,
            firstDate: labels[0],
            lastDate: labels[labels.length - 1],
            minPrice,
            maxPrice: globalMax,
            currentPrice,
            firstPrice,
            priceChange: variation,
            storesTracked: Object.keys(storeHistories).length
        };
    } catch (err) {
        console.error('[Histórico] Falha ao gerar gráfico:', err);
        return null;
    }
};

module.exports = {
    extractUrlFromText,
    extractGameIdsFromText,
    generatePriceHistoryChart
};
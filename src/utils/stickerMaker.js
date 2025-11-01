const logger = require('./logger');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/**
 * Gera um nome de arquivo aleatório com extensão
 * @param {string} ext - Extensão do arquivo (ex: '.webp', '.png')
 * @returns {string} Nome do arquivo aleatório
 */
function getRandom(ext) {
    return `${Math.floor(Math.random() * 10000)}${Date.now()}${ext}`;
}

/**
 * Converte uma imagem em sticker
 * @param {Buffer} mediaBuffer - Buffer da imagem
 * @param {string} tempFilePath - Caminho do arquivo temporário
 * @returns {Promise<Buffer>} Buffer do sticker em formato webp
 */
async function imageToSticker(mediaBuffer, tempFilePath) {
    return new Promise((resolve, reject) => {
        const outputPath = getRandom('.webp');
        
        ffmpeg(tempFilePath)
            .input(tempFilePath)
            .on('start', (cmd) => {
                logger.debug('STICKER', 'Iniciando conversão de imagem para sticker', { command: cmd });
            })
            .on('error', (err) => {
                logger.error('STICKER', 'Erro ao converter imagem para sticker', err);
                // Limpa arquivo temporário
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                reject(new Error('Falha ao converter imagem para sticker'));
            })
            .on('end', () => {
                logger.success('STICKER', 'Conversão de imagem para sticker concluída');
                
                try {
                    const stickerBuffer = fs.readFileSync(outputPath);
                    
                    // Limpa arquivos temporários
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    
                    resolve(stickerBuffer);
                } catch (error) {
                    logger.error('STICKER', 'Erro ao ler arquivo de sticker gerado', error);
                    reject(error);
                }
            })
            .addOutputOptions([
                `-vcodec`, `libwebp`,
                `-vf`, `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`
            ])
            .toFormat('webp')
            .save(outputPath);
    });
}

/**
 * Converte um vídeo/GIF em sticker animado
 * @param {Buffer} mediaBuffer - Buffer do vídeo/GIF
 * @param {string} tempFilePath - Caminho do arquivo temporário
 * @param {string} inputFormat - Formato do arquivo de entrada
 * @returns {Promise<Buffer>} Buffer do sticker animado em formato webp
 */
async function videoToSticker(mediaBuffer, tempFilePath, inputFormat) {
    return new Promise((resolve, reject) => {
        const outputPath = getRandom('.webp');
        
        ffmpeg(tempFilePath)
            .inputFormat(inputFormat)
            .on('start', (cmd) => {
                logger.debug('STICKER', 'Iniciando conversão de vídeo/GIF para sticker animado', { command: cmd });
            })
            .on('error', (err) => {
                logger.error('STICKER', 'Erro ao converter vídeo/GIF para sticker animado', err);
                
                // Limpa arquivo temporário
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                
                const mediaType = inputFormat === 'mp4' ? 'vídeo' : 'GIF';
                reject(new Error(`Falha ao converter ${mediaType} para sticker animado`));
            })
            .on('end', () => {
                logger.success('STICKER', 'Conversão de vídeo/GIF para sticker animado concluída');
                
                try {
                    const stickerBuffer = fs.readFileSync(outputPath);
                    
                    // Limpa arquivos temporários
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    
                    resolve(stickerBuffer);
                } catch (error) {
                    logger.error('STICKER', 'Erro ao ler arquivo de sticker animado gerado', error);
                    reject(error);
                }
            })
            .addOutputOptions([
                `-vcodec`, `libwebp`,
                `-vf`, `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`
            ])
            .toFormat('webp')
            .save(outputPath);
    });
}

/**
 * Converte um sticker em imagem PNG
 * @param {Buffer} stickerBuffer - Buffer do sticker
 * @param {string} tempFilePath - Caminho do arquivo temporário do sticker
 * @returns {Promise<Buffer>} Buffer da imagem PNG
 */
async function stickerToImage(stickerBuffer, tempFilePath) {
    return new Promise((resolve, reject) => {
        const outputPath = getRandom('.png');
        
        ffmpeg(tempFilePath)
            .on('start', (cmd) => {
                logger.debug('STICKER', 'Iniciando conversão de sticker para imagem', { command: cmd });
            })
            .on('error', (err) => {
                logger.error('STICKER', 'Erro ao converter sticker para imagem', err);
                
                // Limpa arquivo temporário
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                
                reject(new Error('Falha ao converter sticker para imagem'));
            })
            .on('end', () => {
                logger.success('STICKER', 'Conversão de sticker para imagem concluída');
                
                try {
                    const imageBuffer = fs.readFileSync(outputPath);
                    
                    // Limpa arquivos temporários
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    
                    resolve(imageBuffer);
                } catch (error) {
                    logger.error('STICKER', 'Erro ao ler arquivo de imagem gerado', error);
                    reject(error);
                }
            })
            .toFormat('png')
            .save(outputPath);
    });
}

/**
 * Processa mídia para criar sticker
 * @param {Object} message - Mensagem do Baileys
 * @param {Object} sock - Instância do socket do Baileys
 * @returns {Promise<{buffer: Buffer, type: string}>} Buffer do sticker e tipo
 */
async function processStickerMedia(message, sock) {
    try {
        const messageType = Object.keys(message.message)[0];
        logger.debug('STICKER', `Tipo de mensagem detectado: ${messageType}`);
        
        let mediaMessage = null;
        let mediaType = null;
        let isAnimated = false;
        
        // Detecta o tipo de mídia
        if (messageType === 'imageMessage') {
            mediaMessage = message.message.imageMessage;
            mediaType = 'image';
        } else if (messageType === 'videoMessage') {
            mediaMessage = message.message.videoMessage;
            mediaType = 'video';
            isAnimated = true;
            
            // Verifica se o vídeo não é muito longo (máximo 10 segundos)
            if (mediaMessage.seconds && mediaMessage.seconds > 10) {
                throw new Error('O vídeo deve ter no máximo 10 segundos para ser convertido em sticker');
            }
        } else if (messageType === 'stickerMessage') {
            mediaMessage = message.message.stickerMessage;
            mediaType = 'sticker';
        } else {
            throw new Error('Tipo de mídia não suportado. Envie uma imagem, vídeo (máx 10s) ou sticker');
        }
        
        // Baixa a mídia
        logger.info('STICKER', 'Baixando mídia...');
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        );
        
        logger.success('STICKER', `Mídia baixada com sucesso (${mediaType})`, { size: `${(buffer.length / 1024).toFixed(2)} KB` });
        
        return {
            buffer,
            type: mediaType,
            isAnimated
        };
    } catch (error) {
        logger.error('STICKER', 'Erro ao processar mídia', error);
        throw error;
    }
}

/**
 * Cria sticker a partir de uma imagem
 * @param {Object} message - Mensagem do Baileys
 * @param {Object} sock - Instância do socket do Baileys
 * @returns {Promise<Buffer>} Buffer do sticker
 */
async function createImageSticker(message, sock) {
    try {
        const { buffer, type } = await processStickerMedia(message, sock);
        
        if (type !== 'image') {
            throw new Error('Esta função aceita apenas imagens. Use createVideoSticker para vídeos/GIFs');
        }
        
        // Salva arquivo temporário
        const tempFile = getRandom('.jpg');
        fs.writeFileSync(tempFile, buffer);
        
        logger.info('STICKER', 'Convertendo imagem para sticker...');
        const stickerBuffer = await imageToSticker(buffer, tempFile);
        
        logger.success('STICKER', 'Sticker de imagem criado com sucesso', { size: `${(stickerBuffer.length / 1024).toFixed(2)} KB` });
        return stickerBuffer;
    } catch (error) {
        logger.error('STICKER', 'Erro ao criar sticker de imagem', error);
        throw error;
    }
}

/**
 * Cria sticker animado a partir de um vídeo ou GIF
 * @param {Object} message - Mensagem do Baileys
 * @param {Object} sock - Instância do socket do Baileys
 * @returns {Promise<Buffer>} Buffer do sticker animado
 */
async function createVideoSticker(message, sock) {
    try {
        const { buffer, type } = await processStickerMedia(message, sock);
        
        if (type !== 'video') {
            throw new Error('Esta função aceita apenas vídeos/GIFs. Use createImageSticker para imagens');
        }
        
        // Salva arquivo temporário
        const tempFile = getRandom('.mp4');
        fs.writeFileSync(tempFile, buffer);
        
        // Detecta formato
        const inputFormat = tempFile.endsWith('.mp4') ? 'mp4' : 'gif';
        
        logger.info('STICKER', `Convertendo ${inputFormat === 'mp4' ? 'vídeo' : 'GIF'} para sticker animado...`);
        const stickerBuffer = await videoToSticker(buffer, tempFile, inputFormat);
        
        logger.success('STICKER', 'Sticker animado criado com sucesso', { size: `${(stickerBuffer.length / 1024).toFixed(2)} KB` });
        return stickerBuffer;
    } catch (error) {
        logger.error('STICKER', 'Erro ao criar sticker animado', error);
        throw error;
    }
}

/**
 * Converte sticker para imagem
 * @param {Object} message - Mensagem do Baileys (deve ser um sticker)
 * @param {Object} sock - Instância do socket do Baileys
 * @returns {Promise<Buffer>} Buffer da imagem PNG
 */
async function convertStickerToImage(message, sock) {
    try {
        const { buffer, type } = await processStickerMedia(message, sock);
        
        if (type !== 'sticker') {
            throw new Error('Esta função aceita apenas stickers');
        }
        
        // Salva arquivo temporário
        const tempFile = getRandom('.webp');
        fs.writeFileSync(tempFile, buffer);
        
        logger.info('STICKER', 'Convertendo sticker para imagem...');
        const imageBuffer = await stickerToImage(buffer, tempFile);
        
        logger.success('STICKER', 'Imagem extraída do sticker com sucesso', { size: `${(imageBuffer.length / 1024).toFixed(2)} KB` });
        return imageBuffer;
    } catch (error) {
        logger.error('STICKER', 'Erro ao converter sticker para imagem', error);
        throw error;
    }
}

/**
 * Cria sticker automaticamente (detecta se é imagem ou vídeo)
 * @param {Object} message - Mensagem do Baileys
 * @param {Object} sock - Instância do socket do Baileys
 * @returns {Promise<Buffer>} Buffer do sticker
 */
async function createSticker(message, sock) {
    try {
        const { buffer, type, isAnimated } = await processStickerMedia(message, sock);
        
        if (type === 'sticker') {
            throw new Error('A mensagem já é um sticker. Use /toimg para converter em imagem');
        }
        
        // Salva arquivo temporário
        const extension = type === 'image' ? '.jpg' : '.mp4';
        const tempFile = getRandom(extension);
        fs.writeFileSync(tempFile, buffer);
        
        let stickerBuffer;
        
        if (isAnimated) {
            logger.info('STICKER', 'Convertendo vídeo/GIF para sticker animado...');
            const inputFormat = extension === '.mp4' ? 'mp4' : 'gif';
            stickerBuffer = await videoToSticker(buffer, tempFile, inputFormat);
        } else {
            logger.info('STICKER', 'Convertendo imagem para sticker...');
            stickerBuffer = await imageToSticker(buffer, tempFile);
        }
        
        logger.success('STICKER', 'Sticker criado com sucesso', { 
            type: isAnimated ? 'animado' : 'estático',
            size: `${(stickerBuffer.length / 1024).toFixed(2)} KB` 
        });
        
        return stickerBuffer;
    } catch (error) {
        logger.error('STICKER', 'Erro ao criar sticker', error);
        throw error;
    }
}

module.exports = {
    createSticker,
    createImageSticker,
    createVideoSticker,
    convertStickerToImage,
    processStickerMedia
};

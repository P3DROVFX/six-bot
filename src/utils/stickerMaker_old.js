const logger = require('./logger');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const Jimp = require('jimp');
const webp = require('node-webpmux');
const crypto = require('crypto');

/**
 * Gera um nome de arquivo aleatório com extensão
 * @param {string} ext - Extensão do arquivo (ex: '.webp', '.png')
 * @returns {string} Nome do arquivo aleatório
 */
function getRandom(ext) {
    return `${Math.floor(Math.random() * 10000)}${Date.now()}${ext}`;
}

/**
 * Adiciona metadados EXIF ao sticker
 * @param {Buffer} buffer - Buffer do webp
 * @param {string} pack - Nome do pacote
 * @param {string} author - Nome do autor
 * @returns {Promise<Buffer>} Buffer do sticker com EXIF
 */
async function addExif(buffer, pack = 'SIX_BOT', author = 'SIX_BOT Stickers') {
    try {
        const img = new webp.Image();
        const stickerPackId = crypto.randomBytes(32).toString('hex');
        const json = { 
            'sticker-pack-id': stickerPackId, 
            'sticker-pack-name': pack, 
            'sticker-pack-publisher': author
        };
        const exifAttr = Buffer.from([
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 
            0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
        ]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        
        await img.load(buffer);
        img.exif = exif;
        const stickerBuffer = await img.save(null);
        
        return stickerBuffer;
    } catch (err) {
        logger.error('STICKER', 'Erro ao adicionar EXIF', err);
        throw err;
    }
}

/**
 * Redimensiona imagem para 512x512
 * @param {Buffer} imageBuffer - Buffer da imagem
 * @returns {Promise<Buffer>} Buffer da imagem redimensionada
 */
async function resizeImage(imageBuffer) {
    try {
        const image = await Jimp.read(imageBuffer);
        image.resize(512, 512);
        return image.getBufferAsync(Jimp.MIME_PNG);
    } catch (err) {
        logger.error('STICKER', 'Erro ao redimensionar imagem', err);
        throw err;
    }
}

/**
 * Converte uma imagem em sticker
 * @param {Buffer} mediaBuffer - Buffer da imagem
 * @returns {Promise<Buffer>} Buffer do sticker em formato webp
 */
async function imageToSticker(mediaBuffer) {
    return new Promise((resolve, reject) => {
        const inputPath = getRandom('.png');
        const outputPath = getRandom('.webp');
        
        fs.writeFileSync(inputPath, mediaBuffer);
        
        const options = [
            "-vcodec libwebp",
            "-loop 0",
            "-lossless 1",
            "-q:v 100"
        ];
        
        ffmpeg(inputPath)
            .outputOptions(options)
            .save(outputPath)
            .on('start', (cmd) => {
                logger.debug('STICKER', 'Iniciando conversão de imagem para sticker', { command: cmd });
            })
            .on('error', (err) => {
                logger.error('STICKER', 'Erro ao converter imagem para sticker', err);
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                reject(new Error('Falha ao converter imagem para sticker'));
            })
            .on('end', () => {
                logger.success('STICKER', 'Conversão de imagem para sticker concluída');
                
                try {
                    const stickerBuffer = fs.readFileSync(outputPath);
                    
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    
                    resolve(stickerBuffer);
                } catch (error) {
                    logger.error('STICKER', 'Erro ao ler arquivo de sticker gerado', error);
                    reject(error);
                }
            });
    });
}

/**
 * Converte um vídeo/GIF em sticker animado
 * @param {Buffer} mediaBuffer - Buffer do vídeo/GIF
 * @param {number} fps - FPS do sticker animado
 * @returns {Promise<Buffer>} Buffer do sticker animado em formato webp
 */
async function videoToSticker(mediaBuffer, fps = 9) {
    return new Promise((resolve, reject) => {
        const inputPath = getRandom('.mp4');
        const outputPath = getRandom('.webp');
        
        fs.writeFileSync(inputPath, mediaBuffer);
        
        const options = [
            "-vcodec libwebp",
            "-filter:v",
            `fps=fps=${fps}`,
            "-lossless 0",
            "-compression_level 4",
            "-q:v 10",
            "-loop 1",
            "-preset picture",
            "-an",
            "-vsync 0",
            "-s 512:512"
        ];
        
        ffmpeg(inputPath)
            .outputOptions(options)
            .save(outputPath)
            .on('start', (cmd) => {
                logger.debug('STICKER', 'Iniciando conversão de vídeo/GIF para sticker animado', { command: cmd });
            })
            .on('error', (err) => {
                logger.error('STICKER', 'Erro ao converter vídeo/GIF para sticker animado', err);
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                reject(new Error('Falha ao converter vídeo/GIF para sticker animado'));
            })
            .on('end', () => {
                logger.success('STICKER', 'Conversão de vídeo/GIF para sticker animado concluída');
                
                try {
                    const stickerBuffer = fs.readFileSync(outputPath);
                    
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    
                    resolve(stickerBuffer);
                } catch (error) {
                    logger.error('STICKER', 'Erro ao ler arquivo de sticker animado gerado', error);
                    reject(error);
                }
            });
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
 * @param {Object} options - Opções do sticker
 * @returns {Promise<Buffer>} Buffer do sticker
 */
async function createSticker(message, sock, options = {}) {
    try {
        const { pack = 'SIX_BOT', author = 'SIX_BOT Stickers', fps = 9 } = options;
        
        // Detecta tipo de mensagem
        const messageType = Object.keys(message.message)[0];
        logger.debug('STICKER', `Tipo de mensagem detectado: ${messageType}`);
        
        let isAnimated = false;
        
        if (messageType === 'videoMessage') {
            isAnimated = true;
            const videoMessage = message.message.videoMessage;
            
            // Verifica duração do vídeo
            if (videoMessage.seconds && videoMessage.seconds > 10) {
                throw new Error('O vídeo deve ter no máximo 10 segundos para ser convertido em sticker');
            }
        } else if (messageType === 'stickerMessage') {
            throw new Error('A mensagem já é um sticker. Use /toimg para converter em imagem');
        } else if (messageType !== 'imageMessage') {
            throw new Error('Tipo de mídia não suportado. Envie uma imagem ou vídeo (máx 10s)');
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
        
        logger.success('STICKER', `Mídia baixada com sucesso (${messageType})`, { 
            size: `${(buffer.length / 1024).toFixed(2)} KB` 
        });
        
        let webpBuffer;
        
        if (isAnimated) {
            logger.info('STICKER', 'Convertendo vídeo para sticker animado...');
            webpBuffer = await videoToSticker(buffer, fps);
        } else {
            logger.info('STICKER', 'Convertendo imagem para sticker...');
            // Redimensiona imagem primeiro
            const resizedBuffer = await resizeImage(buffer);
            webpBuffer = await imageToSticker(resizedBuffer);
        }
        
        // Adiciona metadados EXIF
        const stickerBuffer = await addExif(webpBuffer, pack, author);
        
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

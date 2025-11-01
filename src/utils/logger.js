// Sistema de logging centralizado e padronizado

const LogLevel = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    SUCCESS: 'SUCCESS',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
    API: 'API',
    CACHE: 'CACHE',
    DATABASE: 'DATABASE',
    USER: 'USER',
    BOT: 'BOT',
    PRICE: 'PRICE'
};

const LogColors = {
    DEBUG: '\x1b[36m',      // Cyan
    INFO: '\x1b[34m',       // Blue
    SUCCESS: '\x1b[32m',    // Green
    WARNING: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',      // Red
    API: '\x1b[35m',        // Magenta
    CACHE: '\x1b[96m',      // Bright Cyan
    DATABASE: '\x1b[95m',   // Bright Magenta
    USER: '\x1b[92m',       // Bright Green
    BOT: '\x1b[94m',        // Bright Blue
    PRICE: '\x1b[93m',      // Bright Yellow
    RESET: '\x1b[0m'
};

class Logger {
    constructor() {
        this.enableColors = true;
        this.enableTimestamp = true;
    }

    formatMessage(level, category, message, data = null) {
        const timestamp = this.enableTimestamp ? `[${new Date().toISOString()}]` : '';
        const color = this.enableColors ? (LogColors[level] || LogColors.INFO) : '';
        const reset = this.enableColors ? LogColors.RESET : '';
        
        let logMessage = `${color}${timestamp}[${level}][${category}]${reset} ${message}`;
        
        if (data) {
            logMessage += `\n${color}[DATA]${reset} ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;
        }
        
        return logMessage;
    }

    debug(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.DEBUG, category, message, data));
    }

    info(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.INFO, category, message, data));
    }

    success(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.SUCCESS, category, message, data));
    }

    warning(category, message, data = null) {
        console.warn(this.formatMessage(LogLevel.WARNING, category, message, data));
    }

    error(category, message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            response: error.response?.data,
            status: error.response?.status
        } : null;
        console.error(this.formatMessage(LogLevel.ERROR, category, message, errorData));
    }

    api(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.API, category, message, data));
    }

    cache(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.CACHE, category, message, data));
    }

    database(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.DATABASE, category, message, data));
    }

    user(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.USER, category, message, data));
    }

    bot(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.BOT, category, message, data));
    }

    price(category, message, data = null) {
        console.log(this.formatMessage(LogLevel.PRICE, category, message, data));
    }

    // Função para logar erros do Baileys de forma estruturada
    baileysError(context, error) {
        const errorInfo = {
            context,
            type: error.output?.statusCode || error.name || 'Unknown',
            message: error.message,
            payload: error.output?.payload,
            data: error.data
        };

        if (error.output?.statusCode === 401) {
            this.error('BAILEYS', '🔐 Erro de autenticação - QR Code pode ter expirado', errorInfo);
        } else if (error.output?.statusCode === 404) {
            this.error('BAILEYS', '❌ Recurso não encontrado no WhatsApp', errorInfo);
        } else if (error.output?.statusCode === 500) {
            this.error('BAILEYS', '🔥 Erro interno do WhatsApp', errorInfo);
        } else if (error.message?.includes('Connection Closed')) {
            this.warning('BAILEYS', '📴 Conexão com WhatsApp fechada', errorInfo);
        } else if (error.message?.includes('Stream Errored')) {
            this.error('BAILEYS', '🌊 Erro no stream de comunicação', errorInfo);
        } else {
            this.error('BAILEYS', `⚠️ Erro não tratado: ${error.message}`, errorInfo);
        }
    }
}

// Instância singleton
const logger = new Logger();

module.exports = logger;

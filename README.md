<div align="center">

# 🎮 Game Price Monitor Bot

### Bot Inteligente do WhatsApp para Monitoramento de Preços de Jogos

[![Node.js](https://img.shields.io/badge/Node.js-16+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge)]()

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.18-blue?style=flat-square)](https://github.com/WhiskeySockets/Baileys)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Latest-green?style=flat-square&logo=ffmpeg)](https://ffmpeg.org/)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg?style=flat-square)](https://github.com/P3DROVFX/six-bot/graphs/commit-activity)

**Monitore preços de jogos em múltiplas lojas e receba notificações automáticas no WhatsApp quando o preço atingir seu alvo!**

<img src="https://raw.githubusercontent.com/P3DROVFX/six-bot/main/docs/demo.gif" alt="Demo" width="600"/>

</div>

---

## 📋 Sobre o Projeto

Bot automatizado do WhatsApp que monitora preços de jogos em tempo real através da API IsThereAnyDeal, oferecendo uma solução completa para quem quer economizar em suas compras de jogos e receber o alerta via Whatsapp.

---

## 🚀 Começando

### 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** 16.x ou superior ([Download](https://nodejs.org/))
- **FFmpeg** (necessário para stickers) ([Download](https://ffmpeg.org/download.html))
- **Git** ([Download](https://git-scm.com/))
- Conta no **WhatsApp**

### 📦 Instalação

#### 1. Clone o repositório

```bash
git clone https://github.com/P3DROVFX/six-bot.git
cd six-bot
```

#### 2. Instale as dependências

```bash
npm install
```

#### 3. Instale o FFmpeg

<details>
<summary><b>Windows</b></summary>

```powershell
# Usando Chocolatey (recomendado)
choco install ffmpeg

# Ou baixe manualmente em https://ffmpeg.org/download.html
```
</details>

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
sudo apt update && sudo apt install ffmpeg
```
</details>

<details>
<summary><b>macOS</b></summary>

```bash
# Usando Homebrew
brew install ffmpeg
```
</details>

#### 4. Configure a API Key

1. Crie uma conta gratuita em [IsThereAnyDeal](https://isthereanydeal.com/apps/my/)
2. Gere sua API Key
3. Abra `src/config/constants.js` e adicione sua chave:

```javascript
const ITAD_API_KEY = 'sua-api-key-aqui'; // Substitua com sua chave
```

#### 5. Inicie o bot

```bash
npm start
```

#### 6. Conecte ao WhatsApp

1. Um QR Code será exibido no terminal
2. Abra o WhatsApp no seu celular
3. Vá em **Aparelhos Conectados** > **Conectar um Aparelho**
4. Escaneie o QR Code

✅ **Pronto!** O bot está online e pronto para uso.

---

## 📱 Comandos

### 🎮 Monitoramento de Preços

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/buscar <nome>` | Busca jogos no banco de dados | `/buscar Cyberpunk 2077` |
| `/monitorar <link> <preço>` | Inicia monitoramento de um jogo | `/monitorar https://store.steampowered.com/app/1091500/ 150` |
| `/consultar` | Lista todos os jogos monitorados | `/consultar` |
| `/editar <link> <preço>` | Edita preço alvo de um jogo | `/editar https://store.steampowered.com/app/1091500/ 100` |
| `/remover <link>` | Remove jogo do monitoramento | `/remover https://store.steampowered.com/app/1091500/` |
| `/historico <link>` | Exibe gráfico de histórico de preços | `/historico https://store.steampowered.com/app/1091500/` |
| `/info <link>` | Informações detalhadas do jogo | `/info https://store.steampowered.com/app/1091500/` |
| `/stats` | Estatísticas do sistema | `/stats` |

### 🎨 Stickers

| Comando | Descrição | Como Usar |
|---------|-----------|-----------|
| `/sticker` ou `/s` | Cria sticker de imagem/vídeo | Responda uma imagem/vídeo com o comando |
| `/figurinha` | Alias para `/sticker` | Mesmo uso do `/sticker` |
| `/toimg` ou `/desticker` | Converte sticker em imagem PNG | Responda um sticker com o comando |

### ℹ️ Informações

| Comando | Descrição |
|---------|-----------|
| `/help` ou `/ajuda` | Menu completo com todos os comandos |
| `/owner` ou `/contato` | Informações do desenvolvedor |

### 🔧 Admin (Apenas Proprietário)

| Comando | Descrição |
|---------|-----------|
| `/addglobal <ids>` | Adiciona jogos ao monitoramento global | 
| `/updateprices` | Força atualização de todos os preços |

---

## 💡 Exemplos de Uso

### 📊 Monitorando um Jogo

<details>
<summary><b>Clique para ver o exemplo completo</b></summary>

```
👤 Você: /monitorar https://store.steampowered.com/app/1091500/ 150

🤖 Bot: 🎮 Seleção de Loja
        
        Qual(is) loja(s) você gostaria de monitorar?
        
        1 - Apenas Steam
        2 - Apenas Epic Games
        3 - Apenas Microsoft Store
        4 - Todas as lojas
        
        Digite o número correspondente:

👤 Você: 4

🤖 Bot: ✅ Jogo monitorado com sucesso!
        
        🎮 Nome: Cyberpunk 2077
        🛒 Lojas: Steam, Epic Games e Microsoft Store
        🎯 Preço alvo: R$ 150.00
        📊 Histórico sendo atualizado...
```
</details>

### 📈 Consultando Histórico de Preços

<details>
<summary><b>Clique para ver o exemplo</b></summary>

```
👤 Você: /historico https://store.steampowered.com/app/1091500/

🤖 Bot: [Envia gráfico interativo]
        
        📊 Histórico de Preços - Cyberpunk 2077
        
        📅 Período: 01/01/2025 - 01/11/2025
        📈 Total de registros: 45
        
        💰 Preço mínimo: R$ 69.96
        💸 Preço máximo: R$ 249.00
        🔄 Preço atual: R$ 149.00
        📉 Variação: -25.1% (redução)
```
</details>

### 🎨 Criando um Sticker

<details>
<summary><b>Clique para ver o exemplo</b></summary>

```
👤 Você: [Envia uma imagem ou vídeo]

👤 Você: /sticker

🤖 Bot: [Processa e envia o sticker pronto]
```
</details>

### 🔍 Buscando Jogos

<details>
<summary><b>Clique para ver o exemplo</b></summary>

```
👤 Você: /buscar Red Dead Redemption

🤖 Bot: 🔍 Resultados da busca:
        
        1. Red Dead Redemption 2
           🔗 https://store.steampowered.com/app/1174180/
           💰 R$ 249.00
           
        2. Red Dead Online
           🔗 https://store.steampowered.com/app/1404210/
           💰 R$ 19.99
```
</details>

---

### 🗂️ Arquivos de Dados

| Arquivo | Descrição |
|---------|-----------|
| `history.json` | Armazena informações e histórico de preços de todos os jogos |
| `monitored_games.json` | Lista de jogos monitorados por cada usuário/grupo |
| `baileys_auth_info/` | Sessão do WhatsApp (não compartilhar!) |

---

## 🔍 Sistema de Logging

O bot implementa um sistema de logging estruturado e colorido para facilitar debugging e monitoramento.

### 📊 Categorias de Log

<table>
<tr>
<th>Categoria</th>
<th>Cor</th>
<th>Uso</th>
</tr>
<tr>
<td><code>DEBUG</code></td>
<td>🔵 Cyan</td>
<td>Informações detalhadas de debugging</td>
</tr>
<tr>
<td><code>INFO</code></td>
<td>🔷 Blue</td>
<td>Informações gerais do sistema</td>
</tr>
<tr>
<td><code>SUCCESS</code></td>
<td>🟢 Green</td>
<td>Operações concluídas com sucesso</td>
</tr>
<tr>
<td><code>WARNING</code></td>
<td>🟡 Yellow</td>
<td>Avisos que não impedem execução</td>
</tr>
<tr>
<td><code>ERROR</code></td>
<td>🔴 Red</td>
<td>Erros que requerem atenção</td>
</tr>
<tr>
<td><code>API</code></td>
<td>🟣 Magenta</td>
<td>Requisições à API externa</td>
</tr>
<tr>
<td><code>CACHE</code></td>
<td>🔆 Bright Cyan</td>
<td>Operações de cache (hit/miss)</td>
</tr>
<tr>
<td><code>DATABASE</code></td>
<td>✨ Bright Magenta</td>
<td>Leitura/escrita de arquivos</td>
</tr>
<tr>
<td><code>USER</code></td>
<td>💚 Bright Green</td>
<td>Ações realizadas por usuários</td>
</tr>
<tr>
<td><code>BOT</code></td>
<td>💙 Bright Blue</td>
<td>Eventos internos do bot</td>
</tr>
<tr>
<td><code>PRICE</code></td>
<td>💛 Bright Yellow</td>
<td>Operações relacionadas a preços</td>
</tr>
</table>

### 📝 Exemplo de Logs

```log
[2025-11-01T15:30:45.123Z][CACHE][ITAD_LOOKUP] Cache hit - Game ID found
[DATA] { "gameId": "1091500", "itadId": "018d937f-2997-7131-b8b9" }

[2025-11-01T15:30:46.234Z][PRICE][PRICE_CHECK] Price found for game 1091500 (Steam)
[DATA] { "price": "R$149.00", "currency": "BRL" }

[2025-11-01T15:30:47.345Z][SUCCESS][NOTIFICATION] Steam promotion sent to user
[DATA] { "game": "Cyberpunk 2077", "targetPrice": "R$150.00", "currentPrice": "R$149.00" }
```

---

## ⚙️ Configuração Avançada

### 🔧 Variáveis de Ambiente

Você pode personalizar o comportamento do bot editando `src/config/constants.js`:

```javascript
// Moeda para exibição de preços
const CURRENCY = 'BRL';  // USD, EUR, etc.

// Intervalos de atualização (em milissegundos)
const UPDATE_INTERVAL = 7200000;         // 2 horas
const NOTIFICATIONS_INTERVAL = 10800000; // 3 horas

// Rate limiting (delays entre requisições)
const DEFAULT_DELAY_MS = 1000;  // 1 segundo
const BULK_DELAY_MS = 250;      // 250ms para operações em lote

// Informações do proprietário
const OWNER_INFO = {
    name: "Seu Nome",
    whatsapp: "5511999999999",
    email: "seu@email.com"
};
```

### 🎯 Personalização

**Alterar mensagens do bot:**
- Edite os textos de resposta em `src/handlers/commandHandler.js`

**Modificar logo:**
- Substitua `src/assets/logo_six.jpg` com sua própria imagem

**Ajustar limites de stickers:**
- Configure em `src/utils/stickerMaker.js` (duração máxima, qualidade, etc.)

---

## 🛠️ Tecnologias

### Stack Principal

| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| [Node.js](https://nodejs.org/) | 16+ | Runtime JavaScript |
| [Baileys](https://github.com/WhiskeySockets/Baileys) | 6.7.18 | WhatsApp Web API (multi-device) |
| [Axios](https://axios-http.com/) | 1.8.3 | Cliente HTTP para requisições |
| [FFmpeg](https://ffmpeg.org/) | Latest | Processamento de mídia (stickers) |
| [QuickChart](https://quickchart.io/) | 3.1.3 | Geração de gráficos |

### APIs Externas

- **[IsThereAnyDeal API](https://isthereanydeal.com/)** - Dados de preços de jogos
- **Steam, Epic Games, Microsoft Store** - Informações de lojas

---

## 🐛 Solução de Problemas

### ❌ Bot não conecta ao WhatsApp

**Sintomas:**
- QR Code não aparece
- Conexão não estabelece
- Erro de autenticação

**Soluções:**

```bash
# 1. Remova os dados de autenticação antigos
rm -rf baileys_auth_info/  # Linux/Mac
rmdir /s baileys_auth_info  # Windows

# 2. Reinicie o bot
npm start

# 3. Escaneie o novo QR Code
```

---

## 📜 Licença

Este projeto está licenciado sob a **Licença MIT** - veja o arquivo [LICENSE](LICENSE) para detalhes.

```
MIT License

Copyright (c) 2025 P3DROVFX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

---

## 👨‍💻 Autor

<div align="center">

**Pedro**

[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://wa.me/5587996443783)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:p3drovfx@gmail.com)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/P3DROVFX)

</div>

---

## 📊 Status do Projeto

<div align="center">

![Status](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge)
![Version](https://img.shields.io/badge/Versão-1.0.0-blue?style=for-the-badge)
![Last Update](https://img.shields.io/badge/Última_Atualização-Nov_2025-orange?style=for-the-badge)

</div>


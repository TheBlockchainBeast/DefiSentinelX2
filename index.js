const express = require('express');
const expressApp = express();
const axios = require('axios');
const path = require('path');
const port = process.env.PORT || 3000;
expressApp.use(express.static('static'));
expressApp.use(express.json());
require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

expressApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname + '/index.html'));
});

bot.command('start', (ctx) => {
    console.log(ctx.from);
    bot.telegram.sendMessage(
        ctx.chat.id,
        'Hello there! Welcome to the CryptoVerseBot.\n/x <token> - Get token information',
        {}
    );
});

bot.command('x', async (ctx) => {
    const token = ctx.message.text.split(' ')[1]; // Extract the token symbol from the command
    if (!token) {
        ctx.reply('Please provide a token symbol. Usage: /x <token>');
        return;
    }

    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/search?q=${token}`
        );

        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const pair = response.data.pairs[0]; // Assuming the API returns an array with the first result

            const honeypotResponse = await axios.get(
                `https://api.honeypot.is/v2/IsHoneypot?address=${pair.baseToken.address}`
            );

            if (honeypotResponse.data && honeypotResponse.data.honeypotResult) {
                const honeypotInfo = honeypotResponse.data.honeypotResult;
                const honeypotInfo2 = honeypotResponse.data;

                // Define emojis based on price change direction
                const priceChange5minEmoji =
                    pair.priceChange.m5 >= 0 ? '📉' : '📈';
                const priceChange1hEmoji =
                    pair.priceChange.h1 >= 0 ? '📉' : '📈';
                const priceChange24hEmoji =
                    pair.priceChange.h24 >= 0 ? '📉' : '📈';

                // Create the message text
                let message = `
<b>1️⃣ Token Information</b>

📌 Token Name: <a href="${pair.url}">${pair.baseToken.name} (${pair.baseToken.symbol})</a>
⚡ Network: ${pair.chainId}
💲 Price (USD): $${pair.priceUsd}
👥 Holders: ${honeypotInfo2.token.totalHolders}
🔖 Tax: ${honeypotInfo2.simulationResult.buyTax}% buy, ${honeypotInfo2.simulationResult.sellTax}% sell
${priceChange5minEmoji} Price Change (5min): ${pair.priceChange.m5}%
${priceChange1hEmoji} Price Change (1h): ${pair.priceChange.h1}%
${priceChange24hEmoji} Price Change (24h): ${pair.priceChange.h24}%
📊 24h Volume: ${pair.volume.h24}
💦 Liquidity (USD): $${pair.liquidity.usd}`;

                // Check if MarketCap (FDV) is available and append it to the message if it exists
                if (pair.fdv) {
                    message += `\n💎 MarketCap (FDV): $${pair.fdv}`;
                }

                message += `
🍯 Honeypot Result: ${honeypotInfo.isHoneypot ? 'Yes' : 'No'}

<b>2️⃣ Transactions</b>

5m: ${pair.txns.m5.buys} buys, ${pair.txns.m5.sells} sells
1h: ${pair.txns.h1.buys} buys, ${pair.txns.h1.sells} sells
6h: ${pair.txns.h6.buys} buys, ${pair.txns.h6.sells} sells
24h: ${pair.txns.h24.buys} buys, ${pair.txns.h24.sells} sells
        `;

                // Send the HTML message with parse_mode 'HTML'
                ctx.replyWithHTML(message, { disable_web_page_preview: true });
            } else {
                ctx.reply('Token not found.', { disable_web_page_preview: true });
            }
        }
    } catch (error) {
        console.error(error);
        ctx.reply('An error occurred while fetching token information.', {
            disable_web_page_preview: true,
        });
    }
});

bot.launch();

expressApp.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

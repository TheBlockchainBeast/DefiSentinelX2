const express = require('express');
const expressApp = express();
const axios = require('axios');
const path = require('path');
const port = process.env.PORT || 3000;
expressApp.use(express.static('static'));
expressApp.use(express.json());
require('dotenv').config();
const { Telegraf } = require('telegraf');
const schedule = require('node-schedule');


const bot = new Telegraf(process.env.BOT_TOKEN);

// Initialize an object to store token alerts
let tokenAlerts = {};

expressApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname + '/index.html'));
});

bot.command('start', (ctx) => {
    const username = ctx.from.username; // Get the username of the user
    console.log(ctx.from);
    bot.telegram.sendMessage(
        ctx.chat.id,
        `Hello @${username}! Welcome to the DeFiSentinelX Bot.

🚀 To get started, click on the /help command to learn how to use this bot effectively.`,
        {}
    );
});

bot.command('help', (ctx) => {
    const helpMessage = `
Available Bot Commands:
    
/x - Get information about a specific token.
    Usage: /x <token>
    Example: /x ETH
    
/alert - Set an alert for a specific token with a given interval.
    Usage: /alert <token> <interval>
    Example: /alert DOGE 5min
    
/stop - Stop alerts for a specific token.
    Usage: /stop <token>
    Example: /stop DOGE
    
/stopall - Stop alerts for all tokens.
    Example: /stopall
    
<b>Usage Instructions:</b>
- Use /x to get detailed information about a token.
- Use /alert to set alerts for specific tokens with intervals.
- Use /stop to stop alerts for a specific token.
- Use /stopall to stop alerts for all tokens.
    
Enjoy using DeFiSentinelX Bot for crypto market insights!
        `;

    ctx.reply(helpMessage, { disable_web_page_preview: true });
});

// Handle the /alert command to set the alert alert for a specific token
bot.command('alert', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length !== 2) {
        ctx.reply('Please provide a token and a valid interval. Usage: /alert <token> <interval>');
        return;
    }

    const token = args[0];
    const interval = args[1];

    // Define supported intervals
    const supportedIntervals = ['30sec', '1min', '5min', '30min', '1hour'];

    if (!supportedIntervals.includes(interval)) {
        ctx.reply('Invalid interval. Supported intervals: 30sec, 1min, 5min, 30min, 1hour');
        return;
    }

    // Store the interval for the token
    tokenAlerts[token] = interval;

    ctx.reply(`Set alert interval for ${token} to ${interval}.`);

    // Schedule the alert for the specified token
    scheduleAlert(token, interval, ctx);
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

<b>3️⃣ Links</b>

<a href="https://t.me/MaestroSniperBot?start=${pair.baseToken.address}">MaestroBot</a>  <a href="https://t.me/unibotsniper_bot?start=OttoBots-${pair.baseToken.address}">🦄 Unibot</a>
        `;

                // Send the HTML message with parse_mode 'HTML'
                ctx.replyWithHTML(message, { disable_web_page_preview: true });
            } else {
                ctx.reply('Token not found.', { disable_web_page_preview: true });
            }
        }
    } catch (error) {
        console.error(error);
        ctx.reply('❗️ The token don`t have liquidity yet.', {
            disable_web_page_preview: true,
        });
    }
});


function scheduleAlert(token, alert, ctx) {
    const job = schedule.scheduleJob(`*/${getAlertSeconds(alert)} * * * * *`, async () => {
        try {
            const tokenInfo = await getTokenInfo(token, ctx);

            if (tokenInfo) {
                // Create and send the alert message
                const alertMessage = `Alert for ${token}:\n${tokenInfo}`;
                bot.telegram.sendMessage(ctx.chat.id, alertMessage);
            }
        } catch (error) {
            console.error(error);
        }
    });
}

function getAlertSeconds(alert) {
    switch (alert) {
        case '30sec':
            return 30;
        case '1min':
            return 60;
        case '5min':
            return 300;
        case '30min':
            return 1800;
        case '1hour':
            return 3600;
        default:
            return 60; // Default to 1 minute
    }
}

async function getTokenInfo(token, ctx) {
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

<b>3️⃣ Links</b>

<a href="https://t.me/MaestroSniperBot?start=${pair.baseToken.address}">MaestroBot</a>  <a href="https://t.me/unibotsniper_bot?start=OttoBots-${pair.baseToken.address}">🦄 Unibot</a>
        `;

                // Send the HTML message with parse_mode 'HTML'
                ctx.replyWithHTML(message, { disable_web_page_preview: true });
            } else {
                ctx.reply('Token not found.', { disable_web_page_preview: true });
            }
        }
    } catch (error) {
        console.error(error);
        ctx.reply('❗️ The token don`t have liquidity yet.', {
            disable_web_page_preview: true,
        });
    }
}

bot.command('stop', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
        ctx.reply('Please provide a token to stop alerts. Usage: /stop <token>');
        return;
    }

    const tokensToStop = args;

    // Remove the specified tokens from the alert list and cancel the job
    tokensToStop.forEach((token) => {
        if (token in tokenAlerts) {
            // Get the alert for the token
            const alert = tokenAlerts[token].alert / 1000; // Convert to seconds

            // Cancel the scheduled alert job for the token
            tokenAlerts[token].cancel();
            delete tokenAlerts[token];

            ctx.reply(`Stopped alerts for ${token}`);
        } else {
            ctx.reply(`Token ${token} is not currently being monitored for alerts.`);
        }
    });
});

// Add a command to stop alerts for all tokens
bot.command('stopall', (ctx) => {
    // Clear all scheduled alert jobs and reset the token alerts object
    Object.keys(tokenAlerts).forEach((token) => {
        tokenAlerts[token].cancel();
    });

    // Reset the token alerts object
    tokenAlerts = {};

    ctx.reply('Stopped all alerts for tokens.');
});

// Function to schedule an alert and store the job object
function scheduleAlert(token, alert, ctx) {
    const job = schedule.scheduleJob(`*/${getAlertSeconds(alert)} * * * * *`, async () => {
        try {
            const tokenInfo = await getTokenInfo(token, ctx);

            if (tokenInfo) {
                // Create and send the alert message
                const alertMessage = `Alert for ${token}:\n${tokenInfo}`;
                bot.telegram.sendMessage(ctx.chat.id, alertMessage);
            }
        } catch (error) {
            console.error(error);
        }
    });

    // Store the job object in the tokenAlerts object
    tokenAlerts[token] = job;
}


bot.launch();

expressApp.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

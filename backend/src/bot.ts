// backend/src/bot.ts
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-ngrok-url.ngrok-free.app';

if (!BOT_TOKEN || BOT_TOKEN === 'MOCK_TOKEN_FOR_DEV') {
    console.log('⚠️ BOT_TOKEN не указан в .env. Бот не запущен.');
} else {
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    async function setBotCommands() {
        try {
            await fetch(`${TELEGRAM_API}/setChatMenuButton`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    menu_button: {
                        type: 'web_app',
                        text: '💰 Финансы',
                        web_app: { url: WEBAPP_URL }
                    }
                })
            });

            console.log('🤖 Telegram Бот и кнопка Menu Button успешно настроены!');
        } catch (err) {
            console.error('Ошибка настройки бота:', err);
        }
    }

    setBotCommands();
}
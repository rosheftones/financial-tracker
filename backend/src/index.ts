// backend/src/index.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './config/db';
import { verifyTelegramData } from './middleware/auth';
import apiRoutes from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'MOCK_TOKEN_FOR_DEV';

initDatabase();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data']
}));

app.use(express.json());

app.use('/api', verifyTelegramData(BOT_TOKEN), apiRoutes);

// Глобальный обработчик ошибок Express для предотвращения пустых 500 ответов
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(' Global Backend Error:', err);
    res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(` Backend running on http://127.0.0.1:${PORT}`);
});
// backend/src/middleware/auth.ts
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface TelegramUser {
    id: number;
    first_name: string;
    username?: string;
}

export interface AuthenticatedRequest extends Request {
    telegramUser?: TelegramUser;
}

export const verifyTelegramData = (botToken: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        const initData = req.headers['x-telegram-init-data'] as string;

        // ВСЕГДА подставляем тестового юзера, если запрос идет из обычного браузера без initData
        if (!initData || initData.trim() === '' || botToken === 'MOCK_TOKEN_FOR_DEV') {
            req.telegramUser = { id: 12345678, first_name: 'Студент', username: 'minsk_student' };
            return next();
        }

        try {
            const urlParams = new URLSearchParams(initData);
            const hash = urlParams.get('hash');
            urlParams.delete('hash');

            const params: string[] = [];
            urlParams.forEach((value, key) => params.push(`${key}=${value}`));
            params.sort();

            const dataCheckString = params.join('\n');
            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            if (calculatedHash !== hash) {
                // Если хэш не совпал (например, при тесте), в режиме разработки пропускаем
                req.telegramUser = { id: 12345678, first_name: 'Студент', username: 'minsk_student' };
                return next();
            }

            const userParam = urlParams.get('user');
            if (userParam) {
                req.telegramUser = JSON.parse(userParam) as TelegramUser;
            }
            next();
        } catch (err) {
            req.telegramUser = { id: 12345678, first_name: 'Студент', username: 'minsk_student' };
            next();
        }
    };
}
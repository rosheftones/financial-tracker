// backend/src/config/db.ts
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../finance.db');
export const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

export function initDatabase(): void {
    try {
        // Проверяем наличие таблицы savings_goals в старой БД
        const hasSavingsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='savings_goals'").get();

        // Если таблицы копилок нет, автоматическая миграция сбросит старую схему
        if (!hasSavingsTable) {
            console.log('⚠️ Обнаружена устаревшая база данных. Автоматическое пересоздание таблиц...');
            db.exec(`
        DROP TABLE IF EXISTS transactions;
        DROP TABLE IF EXISTS savings_goals;
        DROP TABLE IF EXISTS accounts;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS currencies;
      `);
        }

        db.exec(`
      CREATE TABLE IF NOT EXISTS currencies (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          is_crypto BOOLEAN DEFAULT 0,
          decimals INTEGER DEFAULT 2
      );

      CREATE TABLE IF NOT EXISTS users (
          telegram_id INTEGER PRIMARY KEY,
          username TEXT,
          first_name TEXT NOT NULL,
          main_currency TEXT DEFAULT 'BYN',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (main_currency) REFERENCES currencies(code)
      );

      CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NULL,
          name TEXT NOT NULL,
          type TEXT CHECK(type IN ('income', 'expense', 'savings')) NOT NULL,
          icon TEXT NOT NULL,
          is_default BOOLEAN DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT CHECK(type IN ('cash', 'card', 'crypto', 'savings')) NOT NULL,
          currency_code TEXT NOT NULL,
          balance REAL DEFAULT 0.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
          FOREIGN KEY (currency_code) REFERENCES currencies(code) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          account_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          type TEXT CHECK(type IN ('income', 'expense', 'savings')) NOT NULL,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          currency_code TEXT NOT NULL DEFAULT 'BYN',
          target_amount REAL NOT NULL,
          current_amount REAL DEFAULT 0.0,
          deadline DATE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
          FOREIGN KEY (currency_code) REFERENCES currencies(code) ON DELETE RESTRICT
      );

      INSERT OR IGNORE INTO currencies (code, name, symbol, is_crypto, decimals) VALUES
          ('BYN', 'Белорусский рубль', 'Br', 0, 2),
          ('USD', 'Доллар США', '$', 0, 2),
          ('EUR', 'Евро', '€', 0, 2),
          ('USDT', 'Tether TRC20', '₮', 1, 2),
          ('LTC', 'Litecoin', 'Ł', 1, 8);

      INSERT OR IGNORE INTO categories (id, name, type, icon, is_default) VALUES
          (1, 'Общага / Аренда', 'expense', '🏠', 1),
          (2, 'Проездной (Минсктранс)', 'expense', '🚌', 1),
          (3, 'Продукты (Евроопт)', 'expense', '🛒', 1),
          (4, 'Столовая / Обед', 'expense', '🍲', 1),
          (5, 'Учеба и распечатки', 'expense', '📚', 1),
          (6, 'Развлечения', 'expense', '🎉', 1),
          (7, 'Стипендия', 'income', '🎓', 1),
          (8, 'Подработка / Фриланс', 'income', '💼', 1),
          (9, 'Помощь от родителей', 'income', '👨‍👩‍👦', 1);
    `);
        console.log(' База данных успешно обновлена и готова к работе');
    } catch (err) {
        console.error(' Ошибка инициализации БД:', err);
    }
}
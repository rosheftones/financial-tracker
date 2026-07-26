// backend/src/routes/api.ts
import { Router, Response } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

let cachedUsdRate = 3.28;
let cachedEurRate = 3.55;
let lastRatesFetch = 0;

async function fetchMyFinRates(): Promise<void> {
  const now = Date.now();
  if (now - lastRatesFetch < 3600000) return;

  try {
    const response = await fetch('https://myfin.by/currency/usd/minsk', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.ok) {
      const html = await response.text();
      const usdMatch = html.match(/data-rate="([\d\.]+)"/) || html.match(/(\d\.\d{3,4})/);
      
      if (usdMatch && usdMatch[1]) {
        const parsedRate = parseFloat(usdMatch[1]);
        if (parsedRate > 2.5 && parsedRate < 4.5) {
          cachedUsdRate = parsedRate;
        }
      }
    }
    lastRatesFetch = now;
  } catch (err) {
    console.error('⚠️ Ошибка MyFin, используем резервный курс:', err);
  }
}

router.get('/init', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
    `).run(tgUser.id, tgUser.username || null, tgUser.first_name);

    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id = ?').get(tgUser.id) as { count: number };
    
    if (!accountCount || accountCount.count === 0) {
      const insertAccount = db.prepare('INSERT INTO accounts (user_id, name, type, currency_code, balance) VALUES (?, ?, ?, ?, ?)');
      insertAccount.run(tgUser.id, 'Наличные BYN', 'cash', 'BYN', 100.0);
    }

    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(tgUser.id);
    const categories = db.prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ?').all(tgUser.id);
    const transactions = db.prepare(`
      SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name, a.currency_code
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      JOIN accounts a ON t.account_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC LIMIT 30
    `).all(tgUser.id);

    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(tgUser.id);

    res.json({ user: tgUser, accounts, categories, transactions, goals });
  } catch (err: any) {
    res.status(500).json({ error: `Ошибка базы данных: ${err.message}` });
  }
});

router.get('/analytics/free-cash', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await fetchMyFinRates();

    const tgUser = req.telegramUser!;
    const accounts = db.prepare('SELECT balance, currency_code FROM accounts WHERE user_id = ?')
      .all(tgUser.id) as { balance: number; currency_code: string }[];

    let totalInByn = 0;
    accounts.forEach(acc => {
      const balanceNum = Number(acc.balance) || 0;
      if (acc.currency_code === 'BYN') totalInByn += balanceNum;
      else if (acc.currency_code === 'USD' || acc.currency_code === 'USDT') totalInByn += balanceNum * cachedUsdRate;
      else if (acc.currency_code === 'EUR') totalInByn += balanceNum * cachedEurRate;
    });

    const totalInUsd = totalInByn / cachedUsdRate;

    res.json({
      free_cash_byn: totalInByn.toFixed(2),
      free_cash_usd: totalInUsd.toFixed(2),
      usd_rate: cachedUsdRate.toFixed(2)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Добавлено строгое String() для приведения параметров URL в TypeScript
router.delete('/transactions/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const txId = parseInt(String(req.params.id), 10);

    if (isNaN(txId)) {
      res.status(400).json({ error: 'Некорректный ID транзакции' });
      return;
    }

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(txId, tgUser.id) as { id: number; account_id: number; amount: number; type: string } | undefined;

    if (!tx) {
      res.status(404).json({ error: 'Транзакция не найдена' });
      return;
    }

    const deleteTransaction = db.transaction(() => {
      const balanceModifier = tx.type === 'expense' ? tx.amount : -tx.amount;
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
        .run(balanceModifier, tx.account_id, tgUser.id);

      db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(txId, tgUser.id);
    });

    deleteTransaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/savings/goals', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const { title, target_amount, currency_code } = req.body;

    if (!title || !target_amount) {
      res.status(400).json({ error: 'Укажите название и цель' });
      return;
    }

    const result = db.prepare(`
      INSERT INTO savings_goals (user_id, title, currency_code, target_amount, current_amount)
      VALUES (?, ?, ?, ?, 0)
    `).run(tgUser.id, title, currency_code || 'BYN', parseFloat(target_amount));

    res.json({ success: true, goal_id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/savings/deposit', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const { goal_id, account_id, amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!goal_id || !account_id || isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Неверные данные перевода' });
      return;
    }

    const depositTransaction = db.transaction(() => {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?').run(parsedAmount, account_id, tgUser.id);
      db.prepare('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?').run(parsedAmount, goal_id, tgUser.id);
    });

    depositTransaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/transactions', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const { account_id, category_id, amount, type, note } = req.body;

    if (!account_id || !category_id || !amount || !type) {
      res.status(400).json({ error: 'Заполните все обязательные поля' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    const executeTransaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, amount, type, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tgUser.id, account_id, category_id, parsedAmount, type, note || null);

      const balanceModifier = type === 'income' ? parsedAmount : -parsedAmount;
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
        .run(balanceModifier, account_id, tgUser.id);

      return result.lastInsertRowid;
    });

    const newId = executeTransaction();
    res.json({ success: true, transaction_id: newId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const { name, type, icon } = req.body;
    const result = db.prepare('INSERT INTO categories (user_id, name, type, icon, is_default) VALUES (?, ?, ?, ?, 0)')
      .run(tgUser.id, name, type, icon);
    res.json({ success: true, category_id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/accounts', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;
    const { name, currency_code, balance } = req.body;
    const result = db.prepare('INSERT INTO accounts (user_id, name, type, currency_code, balance) VALUES (?, ?, ?, ?, ?)')
      .run(tgUser.id, name, 'card', currency_code, parseFloat(balance) || 0);
    res.json({ success: true, account_id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/breakdown', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tgUser = req.telegramUser!;

    const totalRow = db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND created_at >= date('now', '-30 days')
    `).get(tgUser.id) as { total: number | null };

    const totalExpense = totalRow?.total || 0;

    if (totalExpense === 0) {
      res.json({ total_expense: '0.00', categories: [], comments: ['Пока нет трат за последние 30 дней. Время копить! 🪙'] });
      return;
    }

    const categoryRows = db.prepare(`
      SELECT 
        c.name, 
        c.icon, 
        SUM(t.amount) as amount 
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.created_at >= date('now', '-30 days')
      GROUP BY c.id
      ORDER BY amount DESC
    `).all(tgUser.id) as { name: string; icon: string; amount: number }[];

    const comments: string[] = [];

    const categories = categoryRows.map(cat => {
      const percentage = parseFloat(((cat.amount / totalExpense) * 100).toFixed(1));

      if (cat.name.includes('Развлечения') && percentage > 15) {
        comments.push(`${percentage}% пришлось на развлечения в этом месяце... Хорошо отдохнули, не так ли? 🥂`);
      } else if (cat.name.includes('Продукты') && percentage > 35) {
        comments.push(`${percentage}% ушло на еду и Евроопт/Комаровку. Студенческий организм требует топлива! 🍲`);
      } else if (cat.name.includes('Общага') || cat.name.includes('Аренда')) {
        comments.push(`${percentage}% бюджета отдано за крышу над головой. Главное — есть где спать! 🏠`);
      } else if (cat.name.includes('Столовая') && percentage > 20) {
        comments.push(`Обеды в столовой забрали ${percentage}%. Пора осваивать готовку макарон по-флотски! 🍝`);
      } else if (cat.name.includes('Проездной')) {
        comments.push(`Проездной (${percentage}% от трат) сэкономил тебе кучу денег на такси по Минску! 🚌`);
      }

      return {
        name: cat.name,
        icon: cat.icon,
        amount: cat.amount.toFixed(2),
        percentage
      };
    });

    if (comments.length === 0) {
      comments.push('Отличный баланс расходов! Ни одна категория не выбивается из нормы. 👍');
    }

    res.json({
      total_expense: totalExpense.toFixed(2),
      categories,
      comments
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

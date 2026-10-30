const express = require('express');
const QRCode = require('qrcode');
const { db } = require('./db');

const router = express.Router();

// Helper for audit logs
function logAudit(userId, userName, action, target, details) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, target, details)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId || null, userName || 'Sistema', action, target, typeof details === 'object' ? JSON.stringify(details) : String(details || ''));
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// -------------------------------------------------------------
// 1. AUTHENTICATION & USERS
// -------------------------------------------------------------
router.get('/auth/users', (req, res) => {
  const users = db.prepare('SELECT id, name, username, role, pin, created_at FROM users ORDER BY id ASC').all();
  res.json({ success: true, users });
});

router.post('/auth/login', (req, res) => {
  const { username, password, pin } = req.body;
  let user;
  if (pin) {
    user = db.prepare('SELECT * FROM users WHERE pin = ?').get(pin);
  } else if (username && password) {
    user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').get(username, password);
  }

  if (!user) {
    return res.status(401).json({ success: false, message: 'Usuário, senha ou PIN inválido.' });
  }

  logAudit(user.id, user.name, 'LOGIN', 'Auth', `Usuário ${user.name} (${user.role}) logado`);
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role
    }
  });
});

// -------------------------------------------------------------
// 2. SETTINGS
// -------------------------------------------------------------
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ success: true, settings });
});

router.put('/settings', (req, res) => {
  const { settings, userName } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, message: 'Configurações inválidas.' });
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  for (const [k, v] of Object.entries(settings)) {
    upsert.run(k, String(v));
  }

  logAudit(null, userName || 'Administrador', 'UPDATE_SETTINGS', 'Configurações', settings);
  res.json({ success: true, message: 'Configurações atualizadas com sucesso.' });
});

// -------------------------------------------------------------
// 3. EVENTS & PROGRAMAÇÃO DA SEMANA
// -------------------------------------------------------------
router.get('/events', (req, res) => {
  const isPublic = req.query.public === 'true';
  const query = isPublic 
    ? 'SELECT * FROM events WHERE is_published = 1 ORDER BY sort_order ASC, event_date ASC'
    : 'SELECT * FROM events ORDER BY sort_order ASC, event_date ASC';
  const events = db.prepare(query).all();
  res.json({ success: true, events });
});

router.post('/events', (req, res) => {
  const { title, category, weekday_label, date_formatted, event_date, time_label, description, badge_text, is_published, sort_order, userName } = req.body;
  if (!title || !weekday_label || !date_formatted || !time_label) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes.' });
  }

  const stmt = db.prepare(`
    INSERT INTO events (title, category, weekday_label, date_formatted, event_date, time_label, description, badge_text, is_published, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title,
    category || 'show',
    weekday_label.toUpperCase(),
    date_formatted,
    event_date || new Date().toISOString().split('T')[0],
    time_label,
    description || '',
    badge_text || '',
    is_published !== undefined ? is_published : 1,
    sort_order || 0
  );

  logAudit(null, userName || 'Gerente', 'CREATE_EVENT', 'Eventos', { title, date: date_formatted });
  res.json({ success: true, id: Number(result.lastInsertRowid) });
});

router.put('/events/:id', (req, res) => {
  const { id } = req.params;
  const { title, category, weekday_label, date_formatted, event_date, time_label, description, badge_text, is_published, sort_order, userName } = req.body;

  const stmt = db.prepare(`
    UPDATE events
    SET title = ?, category = ?, weekday_label = ?, date_formatted = ?, event_date = ?, time_label = ?, description = ?, badge_text = ?, is_published = ?, sort_order = ?
    WHERE id = ?
  `);
  stmt.run(
    title,
    category,
    weekday_label.toUpperCase(),
    date_formatted,
    event_date,
    time_label,
    description,
    badge_text,
    is_published,
    sort_order,
    id
  );

  logAudit(null, userName || 'Gerente', 'UPDATE_EVENT', 'Eventos', { id, title });
  res.json({ success: true, message: 'Evento atualizado.' });
});

router.delete('/events/:id', (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  logAudit(null, userName || 'Gerente', 'DELETE_EVENT', 'Eventos', { id });
  res.json({ success: true, message: 'Evento excluído.' });
});

// -------------------------------------------------------------
// 4. MENU & PRODUCTS (CARDÁPIO)
// -------------------------------------------------------------
router.get('/menu/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json({ success: true, categories });
});

router.get('/menu/products', (req, res) => {
  const { category_id, search, include_hidden } = req.query;
  let sql = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    JOIN menu_categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (include_hidden !== 'true') {
    sql += ' AND p.is_hidden = 0';
  }
  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY p.sort_order ASC, p.id ASC';

  const rows = db.prepare(sql).all(...params);
  const products = rows.map(r => ({
    ...r,
    variations: r.variations_json ? JSON.parse(r.variations_json) : [],
    addons: r.addons_json ? JSON.parse(r.addons_json) : []
  }));

  res.json({ success: true, products });
});

router.post('/menu/products', (req, res) => {
  const {
    category_id, name, description, price, destination, image_url,
    is_featured, is_sold_out, is_hidden, track_stock, current_stock, min_stock, unit,
    variations, addons, userName
  } = req.body;

  if (!name || price === undefined || !category_id) {
    return res.status(400).json({ success: false, message: 'Nome, categoria e preço são obrigatórios.' });
  }

  const stmt = db.prepare(`
    INSERT INTO products (
      category_id, name, description, price, destination, image_url,
      is_featured, is_sold_out, is_hidden, track_stock, current_stock, min_stock, unit,
      variations_json, addons_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    category_id,
    name,
    description || '',
    Number(price),
    destination || 'bar',
    image_url || null,
    is_featured ? 1 : 0,
    is_sold_out ? 1 : 0,
    is_hidden ? 1 : 0,
    track_stock ? 1 : 0,
    Number(current_stock || 0),
    Number(min_stock || 5),
    unit || 'un',
    variations ? JSON.stringify(variations) : null,
    addons ? JSON.stringify(addons) : null
  );

  const prodId = Number(result.lastInsertRowid);
  if (track_stock && Number(current_stock) > 0) {
    db.prepare(`
      INSERT INTO stock_movements (product_id, type, quantity, previous_stock, new_stock, reason, user_name)
      VALUES (?, 'entrada', ?, 0, ?, 'Estoque inicial de cadastro', ?)
    `).run(prodId, Number(current_stock), Number(current_stock), userName || 'Administrador');
  }

  logAudit(null, userName || 'Administrador', 'CREATE_PRODUCT', 'Produtos', { id: prodId, name, price });
  res.json({ success: true, id: prodId, message: 'Produto cadastrado com sucesso.' });
});

router.put('/menu/products/:id', (req, res) => {
  const { id } = req.params;
  const {
    category_id, name, description, price, destination, image_url,
    is_featured, is_sold_out, is_hidden, track_stock, min_stock, unit,
    variations, addons, userName
  } = req.body;

  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const stmt = db.prepare(`
    UPDATE products
    SET category_id = ?, name = ?, description = ?, price = ?, destination = ?, image_url = ?,
        is_featured = ?, is_sold_out = ?, is_hidden = ?, track_stock = ?, min_stock = ?, unit = ?,
        variations_json = ?, addons_json = ?
    WHERE id = ?
  `);

  stmt.run(
    category_id,
    name,
    description,
    Number(price),
    destination,
    image_url,
    is_featured ? 1 : 0,
    is_sold_out ? 1 : 0,
    is_hidden ? 1 : 0,
    track_stock ? 1 : 0,
    Number(min_stock),
    unit,
    variations ? JSON.stringify(variations) : null,
    addons ? JSON.stringify(addons) : null,
    id
  );

  logAudit(null, userName || 'Administrador', 'UPDATE_PRODUCT', 'Produtos', { id, name, oldPrice: current.price, newPrice: price });
  res.json({ success: true, message: 'Produto atualizado.' });
});

router.patch('/menu/products/:id/toggle-soldout', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  const prod = db.prepare('SELECT is_sold_out, name FROM products WHERE id = ?').get(id);
  if (!prod) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const newVal = prod.is_sold_out ? 0 : 1;
  db.prepare('UPDATE products SET is_sold_out = ? WHERE id = ?').run(newVal, id);
  logAudit(null, userName || 'Equipe', 'TOGGLE_SOLDOUT', 'Produtos', { id, name: prod.name, is_sold_out: newVal });
  res.json({ success: true, is_sold_out: newVal });
});

router.patch('/menu/products/:id/toggle-hidden', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  const prod = db.prepare('SELECT is_hidden, name FROM products WHERE id = ?').get(id);
  if (!prod) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const newVal = prod.is_hidden ? 0 : 1;
  db.prepare('UPDATE products SET is_hidden = ? WHERE id = ?').run(newVal, id);
  logAudit(null, userName || 'Equipe', 'TOGGLE_HIDDEN', 'Produtos', { id, name: prod.name, is_hidden: newVal });
  res.json({ success: true, is_hidden: newVal });
});

// -------------------------------------------------------------
// 5. TABLES & COMANDAS (SALÃO)
// -------------------------------------------------------------
router.get('/tables', (req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY number ASC').all();

  // Attach totals and active orders summary for each table
  for (const table of tables) {
    const orders = db.prepare(`
      SELECT o.id, o.status, o.total_amount, o.client_name, o.origin, o.created_at
      FROM orders o
      WHERE o.table_id = ? AND o.status NOT IN ('cancelado')
    `).all(table.id);

    // Payments already made
    const paidRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_paid
      FROM payments
      WHERE table_id = ?
    `).get(table.id);

    const totalOrders = orders.reduce((acc, cur) => acc + (cur.total_amount || 0), 0);
    const totalPaid = paidRow ? paidRow.total_paid : 0;
    const balanceRemaining = Math.max(0, totalOrders - totalPaid);

    table.active_orders_count = orders.length;
    table.total_amount = totalOrders;
    table.total_paid = totalPaid;
    table.balance_remaining = balanceRemaining;
    table.orders = orders;

    // Calculate elapsed minutes if opened
    if (table.opened_at) {
      const openedTime = new Date(table.opened_at).getTime();
      const now = Date.now();
      table.elapsed_minutes = Math.max(0, Math.floor((now - openedTime) / 60000));
    } else {
      table.elapsed_minutes = 0;
    }
  }

  res.json({ success: true, tables });
});

router.get('/tables/:id', (req, res) => {
  const { id } = req.params;
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
  if (!table) return res.status(404).json({ success: false, message: 'Mesa não encontrada.' });

  // Get orders
  const orders = db.prepare(`
    SELECT * FROM orders WHERE table_id = ? AND status != 'cancelado' ORDER BY id ASC
  `).all(id);

  for (const order of orders) {
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  }

  // Get payments
  const payments = db.prepare('SELECT * FROM payments WHERE table_id = ? ORDER BY id ASC').all(id);

  const totalOrders = orders.reduce((acc, cur) => acc + cur.total_amount, 0);
  const totalPaid = payments.reduce((acc, cur) => acc + cur.amount, 0);

  res.json({
    success: true,
    table,
    orders,
    payments,
    totalOrders,
    totalPaid,
    balanceRemaining: Math.max(0, totalOrders - totalPaid)
  });
});

router.post('/tables/:id/open', (req, res) => {
  const { id } = req.params;
  const { people_count, client_name, notes, userName } = req.body;

  db.prepare(`
    UPDATE tables
    SET status = 'ocupada',
        people_count = ?,
        client_name = ?,
        notes = ?,
        opened_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(Number(people_count || 1), client_name || '', notes || '', id);

  logAudit(null, userName || 'Garçom', 'OPEN_TABLE', 'Mesas', { tableId: id, client_name, people: people_count });
  res.json({ success: true, message: 'Mesa aberta com sucesso.' });
});

router.post('/tables/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, userName } = req.body;
  if (!['livre', 'ocupada', 'aguardando_fechamento'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status inválido.' });
  }

  db.prepare('UPDATE tables SET status = ? WHERE id = ?').run(status, id);
  logAudit(null, userName || 'Equipe', 'UPDATE_TABLE_STATUS', 'Mesas', { tableId: id, status });
  res.json({ success: true, message: 'Status da mesa atualizado.' });
});

// Transfer items or table
router.post('/tables/transfer', (req, res) => {
  const { from_table_id, to_table_id, order_item_id, userName } = req.body;
  if (!from_table_id || !to_table_id) {
    return res.status(400).json({ success: false, message: 'Mesas de origem e destino são obrigatórias.' });
  }

  const destTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(to_table_id);
  if (!destTable) return res.status(404).json({ success: false, message: 'Mesa de destino não existe.' });

  // If destination is free, open it
  if (destTable.status === 'livre') {
    db.prepare("UPDATE tables SET status = 'ocupada', opened_at = CURRENT_TIMESTAMP, people_count = 2 WHERE id = ?").run(to_table_id);
  }

  if (order_item_id) {
    // Transfer single item: create or find order on destination
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(order_item_id);
    if (!item) return res.status(404).json({ success: false, message: 'Item não encontrado.' });

    // Subtract from old order
    const oldOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id);
    const newOldTotal = Math.max(0, oldOrder.total_amount - item.total_price);
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(newOldTotal, oldOrder.id);

    // Create new order on target table
    const targetOrder = db.prepare(`
      INSERT INTO orders (table_id, table_number, client_name, origin, status, total_amount, confirmed_at)
      VALUES (?, ?, ?, 'pos', 'confirmado', ?, CURRENT_TIMESTAMP)
    `).run(destTable.id, destTable.number, destTable.client_name || 'Transferido', item.total_price);

    db.prepare('UPDATE order_items SET order_id = ? WHERE id = ?').run(Number(targetOrder.lastInsertRowid), order_item_id);

    logAudit(null, userName || 'Garçom', 'TRANSFER_ITEM', 'Mesas', { item: item.product_name, from: from_table_id, to: to_table_id });
    return res.json({ success: true, message: `Item ${item.product_name} transferido para Mesa ${destTable.number}.` });
  } else {
    // Transfer all orders and payments from from_table to to_table
    db.prepare('UPDATE orders SET table_id = ?, table_number = ? WHERE table_id = ?').run(destTable.id, destTable.number, from_table_id);
    db.prepare('UPDATE payments SET table_id = ? WHERE table_id = ?').run(destTable.id, from_table_id);
    db.prepare("UPDATE tables SET status = 'livre', opened_at = NULL, client_name = NULL, notes = NULL, people_count = 0 WHERE id = ?").run(from_table_id);

    logAudit(null, userName || 'Garçom', 'TRANSFER_TABLE', 'Mesas', { from: from_table_id, to: to_table_id });
    return res.json({ success: true, message: `Consumo da Mesa transferido com sucesso para Mesa ${destTable.number}.` });
  }
});

// Merge tables
router.post('/tables/merge', (req, res) => {
  const { source_table_id, target_table_id, userName } = req.body;
  if (!source_table_id || !target_table_id || source_table_id === target_table_id) {
    return res.status(400).json({ success: false, message: 'Selecione mesas diferentes para juntar.' });
  }

  const target = db.prepare('SELECT * FROM tables WHERE id = ?').get(target_table_id);
  const source = db.prepare('SELECT * FROM tables WHERE id = ?').get(source_table_id);
  if (!target || !source) return res.status(404).json({ success: false, message: 'Mesa não encontrada.' });

  // Move all orders & payments from source to target
  db.prepare('UPDATE orders SET table_id = ?, table_number = ? WHERE table_id = ?').run(target.id, target.number, source.id);
  db.prepare('UPDATE payments SET table_id = ? WHERE table_id = ?').run(target.id, source.id);

  // Combine people count
  const newPeople = (target.people_count || 1) + (source.people_count || 1);
  db.prepare('UPDATE tables SET people_count = ? WHERE id = ?').run(newPeople, target.id);

  // Free source table
  db.prepare("UPDATE tables SET status = 'livre', opened_at = NULL, client_name = NULL, notes = NULL, people_count = 0 WHERE id = ?").run(source.id);

  logAudit(null, userName || 'Gerente', 'MERGE_TABLES', 'Mesas', { source: source.number, target: target.number });
  res.json({ success: true, message: `Mesa ${source.number} unida com sucesso à Mesa ${target.number}.` });
});

// -------------------------------------------------------------
// 6. ORDERS (PEDIDOS & QR CODE)
// -------------------------------------------------------------
router.post('/orders', (req, res) => {
  const { table_number, client_name, origin, notes, items, userName } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum item selecionado.' });
  }

  // Find table if provided
  let table = null;
  if (table_number) {
    table = db.prepare('SELECT * FROM tables WHERE number = ?').get(table_number);
    if (!table) return res.status(400).json({ success: false, message: `Mesa ${table_number} não encontrada.` });
  }

  // Check Bar setting for digital order mode
  const modeSetting = db.prepare("SELECT value FROM settings WHERE key = 'digital_order_mode'").get();
  const orderMode = modeSetting ? modeSetting.value : 'com_confirmacao';

  let initialStatus = 'confirmado';
  if (origin === 'qr_mesa' && orderMode === 'com_confirmacao') {
    initialStatus = 'aguardando_confirmacao';
  }

  // Calculate prices strictly on server side
  let grandTotal = 0;
  const processedItems = [];

  for (const it of items) {
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
    if (!prod) {
      return res.status(400).json({ success: false, message: `Produto ID ${it.product_id} não existe.` });
    }
    if (prod.is_sold_out) {
      return res.status(400).json({ success: false, message: `Produto ${prod.name} está esgotado.` });
    }
    if (prod.is_hidden) {
      return res.status(400).json({ success: false, message: `Produto ${prod.name} não está disponível no cardápio.` });
    }

    let unitPrice = prod.price;
    let variationName = '';

    // Check variations
    if (it.variation_name && prod.variations_json) {
      const vars = JSON.parse(prod.variations_json);
      const matched = vars.find(v => v.name === it.variation_name);
      if (matched) {
        unitPrice = matched.price;
        variationName = matched.name;
      }
    }

    // Check addons
    let addonsTotal = 0;
    const addonsList = [];
    if (it.addons && Array.isArray(it.addons) && prod.addons_json) {
      const availableAddons = JSON.parse(prod.addons_json);
      for (const addName of it.addons) {
        const found = availableAddons.find(a => a.name === addName);
        if (found) {
          addonsTotal += found.price;
          addonsList.push(found.name);
        }
      }
    }

    const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
    const itemTotal = (unitPrice + addonsTotal) * qty;
    grandTotal += itemTotal;

    processedItems.push({
      product_id: prod.id,
      product_name: prod.name,
      destination: prod.destination,
      quantity: qty,
      unit_price: unitPrice,
      variation_name: variationName,
      addons_text: addonsList.join(', '),
      notes: it.notes || '',
      total_price: itemTotal,
      prep_status: initialStatus === 'aguardando_confirmacao' ? 'pendente' : 'pendente',
      track_stock: prod.track_stock
    });
  }

  // Create Order in DB
  const stmtOrder = db.prepare(`
    INSERT INTO orders (
      table_id, table_number, client_name, origin, status, total_amount, notes, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const confirmedAt = initialStatus === 'confirmado' ? new Date().toISOString() : null;
  const result = stmtOrder.run(
    table ? table.id : null,
    table ? table.number : null,
    client_name || (table ? table.client_name : 'Balcão'),
    origin || 'pos',
    initialStatus,
    grandTotal,
    notes || '',
    confirmedAt
  );

  const orderId = Number(result.lastInsertRowid);

  // Insert items
  const stmtItem = db.prepare(`
    INSERT INTO order_items (
      order_id, product_id, product_name, destination, quantity, unit_price,
      variation_name, addons_text, notes, total_price, prep_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const pi of processedItems) {
    stmtItem.run(
      orderId,
      pi.product_id,
      pi.product_name,
      pi.destination,
      pi.quantity,
      pi.unit_price,
      pi.variation_name,
      pi.addons_text,
      pi.notes,
      pi.total_price,
      pi.prep_status
    );

    // If order is confirmed immediately and tracks stock, deduct inventory
    if (initialStatus === 'confirmado' && pi.track_stock) {
      const curStock = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(pi.product_id);
      const prev = curStock ? curStock.current_stock : 0;
      const nextStock = Math.max(0, prev - pi.quantity);
      db.prepare('UPDATE products SET current_stock = ? WHERE id = ?').run(nextStock, pi.product_id);
      db.prepare(`
        INSERT INTO stock_movements (product_id, type, quantity, previous_stock, new_stock, reason, user_name, reference_order_id)
        VALUES (?, 'saida_venda', ?, ?, ?, 'Baixa automática por pedido confirmado', ?, ?)
      `).run(pi.product_id, pi.quantity, prev, nextStock, userName || 'Sistema', orderId);
    }
  }

  // If table is free and order is placed, mark table as ocupada
  if (table && table.status === 'livre' && initialStatus === 'confirmado') {
    db.prepare(`
      UPDATE tables
      SET status = 'ocupada', opened_at = CURRENT_TIMESTAMP, people_count = 2, client_name = ?
      WHERE id = ?
    `).run(client_name || 'Cliente', table.id);
  }

  logAudit(null, userName || (origin === 'qr_mesa' ? 'Cliente QR' : 'Equipe'), 'CREATE_ORDER', 'Pedidos', {
    orderId,
    table: table ? table.number : 'Balcão',
    total: grandTotal,
    status: initialStatus
  });

  res.json({
    success: true,
    orderId,
    status: initialStatus,
    grandTotal,
    message: initialStatus === 'aguardando_confirmacao'
      ? 'Pedido enviado! Aguarde a confirmação de nossa equipe na sua mesa.'
      : 'Pedido confirmado e enviado para preparo!'
  });
});

// Waiter reviews pending QR orders
router.get('/orders/pending', (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE status = 'aguardando_confirmacao' ORDER BY created_at ASC
  `).all();

  for (const o of orders) {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  }

  res.json({ success: true, pendingOrders: orders });
});

// Waiter confirms a pending QR order
router.post('/orders/:id/confirm', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

  // Update order status
  db.prepare(`
    UPDATE orders
    SET status = 'confirmado', confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  // Deduct stock for tracked items
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  for (const it of items) {
    const prod = db.prepare('SELECT track_stock, current_stock FROM products WHERE id = ?').get(it.product_id);
    if (prod && prod.track_stock) {
      const prev = prod.current_stock;
      const nextStock = Math.max(0, prev - it.quantity);
      db.prepare('UPDATE products SET current_stock = ? WHERE id = ?').run(nextStock, it.product_id);
      db.prepare(`
        INSERT INTO stock_movements (product_id, type, quantity, previous_stock, new_stock, reason, user_name, reference_order_id)
        VALUES (?, 'saida_venda', ?, ?, ?, 'Baixa por confirmação de pedido QR', ?, ?)
      `).run(it.product_id, it.quantity, prev, nextStock, userName || 'Garçom', id);
    }
  }

  // Ensure table is occupied
  if (order.table_id) {
    const table = db.prepare('SELECT status FROM tables WHERE id = ?').get(order.table_id);
    if (table && table.status === 'livre') {
      db.prepare("UPDATE tables SET status = 'ocupada', opened_at = CURRENT_TIMESTAMP, people_count = 2 WHERE id = ?").run(order.table_id);
    }
  }

  logAudit(null, userName || 'Garçom', 'CONFIRM_ORDER', 'Pedidos', { orderId: id, table: order.table_number });
  res.json({ success: true, message: 'Pedido aprovado e enviado para a cozinha/bar.' });
});

// Cancel order with motive & restock
router.post('/orders/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { reason, userName } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'O motivo do cancelamento é obrigatório.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

  // Restock items if order was already confirmed
  if (order.status !== 'aguardando_confirmacao' && order.status !== 'cancelado') {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    for (const it of items) {
      const prod = db.prepare('SELECT track_stock, current_stock FROM products WHERE id = ?').get(it.product_id);
      if (prod && prod.track_stock) {
        const prev = prod.current_stock;
        const nextStock = prev + it.quantity;
        db.prepare('UPDATE products SET current_stock = ? WHERE id = ?').run(nextStock, it.product_id);
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, previous_stock, new_stock, reason, user_name, reference_order_id)
          VALUES (?, 'estorno_cancelamento', ?, ?, ?, ?, ?, ?)
        `).run(it.product_id, it.quantity, prev, nextStock, `Estorno por cancelamento do pedido #${id}: ${reason}`, userName || 'Gerente', id);
      }
    }
  }

  db.prepare(`
    UPDATE orders
    SET status = 'cancelado', cancelled_reason = ?, cancelled_by = ?
    WHERE id = ?
  `).run(reason, userName || 'Equipe', id);

  logAudit(null, userName || 'Gerente', 'CANCEL_ORDER', 'Pedidos', { orderId: id, reason });
  res.json({ success: true, message: 'Pedido cancelado com sucesso.' });
});

// Customer live order tracker (public)
router.get('/orders/track/:id', (req, res) => {
  const { id } = req.params;
  const order = db.prepare('SELECT id, table_number, client_name, status, total_amount, created_at, confirmed_at, ready_at, delivered_at FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

  const items = db.prepare('SELECT product_name, quantity, variation_name, prep_status FROM order_items WHERE order_id = ?').all(id);
  res.json({ success: true, order: { ...order, items } });
});

// -------------------------------------------------------------
// 7. KDS - KITCHEN DISPLAY & BAR DISPLAY
// -------------------------------------------------------------
// Waiter view for orders ready for delivery (MUST be before :destination)
router.get('/kds/ready-orders', (req, res) => {
  const readyOrders = db.prepare(`
    SELECT o.*, t.number as current_table_number
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.status = 'pronto'
    ORDER BY o.ready_at ASC
  `).all();

  for (const o of readyOrders) {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  }

  res.json({ success: true, readyOrders });
});

router.get('/kds/:destination', (req, res) => {
  const { destination } = req.params; // 'cozinha' or 'bar'

  // Get active items directed to this station whose order is confirmed or in prep
  const items = db.prepare(`
    SELECT 
      oi.id as item_id,
      oi.order_id,
      oi.product_name,
      oi.quantity,
      oi.variation_name,
      oi.addons_text,
      oi.notes as item_notes,
      oi.prep_status,
      oi.started_prep_at,
      o.table_number,
      o.client_name,
      o.origin,
      o.notes as order_notes,
      o.created_at as order_created_at,
      o.confirmed_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.destination = ?
      AND o.status NOT IN ('aguardando_confirmacao', 'cancelado')
      AND oi.prep_status IN ('pendente', 'em_preparo')
    ORDER BY o.confirmed_at ASC, oi.id ASC
  `).all(destination);

  // Group by order_id for organized ticket view
  const ticketsMap = {};
  for (const it of items) {
    if (!ticketsMap[it.order_id]) {
      ticketsMap[it.order_id] = {
        order_id: it.order_id,
        table_number: it.table_number,
        client_name: it.client_name,
        origin: it.origin,
        order_notes: it.order_notes,
        created_at: it.order_created_at,
        confirmed_at: it.confirmed_at,
        elapsed_minutes: it.confirmed_at 
          ? Math.max(0, Math.floor((Date.now() - new Date(it.confirmed_at).getTime()) / 60000))
          : 0,
        items: []
      };
    }
    ticketsMap[it.order_id].items.push(it);
  }

  res.json({ success: true, tickets: Object.values(ticketsMap) });
});

// Update item prep status
router.patch('/kds/items/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, userName } = req.body; // 'pendente', 'em_preparo', 'pronto', 'entregue'

  if (!['pendente', 'em_preparo', 'pronto', 'entregue'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status de preparo inválido.' });
  }

  const current = db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ success: false, message: 'Item não encontrado.' });

  let started = current.started_prep_at;
  let finished = current.finished_prep_at;

  if (status === 'em_preparo' && !started) {
    started = new Date().toISOString();
  } else if (status === 'pronto') {
    finished = new Date().toISOString();
  }

  db.prepare(`
    UPDATE order_items
    SET prep_status = ?, started_prep_at = ?, finished_prep_at = ?
    WHERE id = ?
  `).run(status, started, finished, id);

  // Check if all items in order are ready
  const orderItems = db.prepare('SELECT prep_status FROM order_items WHERE order_id = ?').all(current.order_id);
  const allReady = orderItems.every(i => i.prep_status === 'pronto' || i.prep_status === 'entregue');
  const allDelivered = orderItems.every(i => i.prep_status === 'entregue');

  if (allDelivered) {
    db.prepare("UPDATE orders SET status = 'entregue', delivered_at = CURRENT_TIMESTAMP WHERE id = ?").run(current.order_id);
  } else if (allReady) {
    db.prepare("UPDATE orders SET status = 'pronto', ready_at = CURRENT_TIMESTAMP WHERE id = ?").run(current.order_id);
  } else if (status === 'em_preparo') {
    db.prepare("UPDATE orders SET status = 'em_preparo' WHERE id = ? AND status != 'pronto'").run(current.order_id);
  }

  logAudit(null, userName || 'KDS', 'KDS_STATUS_CHANGE', 'KDS', { itemId: id, newStatus: status, orderId: current.order_id });
  res.json({ success: true, message: `Status atualizado para ${status}.` });
});



// Mark entire order as delivered
router.post('/orders/:id/mark-delivered', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;

  db.prepare("UPDATE orders SET status = 'entregue', delivered_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  db.prepare("UPDATE order_items SET prep_status = 'entregue' WHERE order_id = ?").run(id);

  logAudit(null, userName || 'Garçom', 'MARK_DELIVERED', 'Pedidos', { orderId: id });
  res.json({ success: true, message: 'Pedido entregue à mesa.' });
});

// -------------------------------------------------------------
// 8. PDV & CAIXA (CASHIER & PAYMENTS)
// -------------------------------------------------------------
router.get('/cashier/current', (req, res) => {
  const session = db.prepare(`
    SELECT * FROM cash_sessions WHERE status = 'aberto' ORDER BY id DESC LIMIT 1
  `).get();

  if (!session) {
    return res.json({ success: true, has_open_session: false });
  }

  // Calculate totals in this session
  const payments = db.prepare(`
    SELECT method, SUM(amount) as total
    FROM payments
    WHERE session_id = ?
    GROUP BY method
  `).all(session.id);

  const movements = db.prepare(`
    SELECT * FROM cash_movements WHERE session_id = ? ORDER BY id ASC
  `).all(session.id);

  let cashTotal = 0;
  let pixTotal = 0;
  let debitoTotal = 0;
  let creditoTotal = 0;
  let cortesiaTotal = 0;

  for (const p of payments) {
    if (p.method === 'dinheiro') cashTotal += p.total;
    if (p.method === 'pix') pixTotal += p.total;
    if (p.method === 'cartao_debito') debitoTotal += p.total;
    if (p.method === 'cartao_credito') creditoTotal += p.total;
    if (p.method === 'cortesia') cortesiaTotal += p.total;
  }

  let suprimentos = 0;
  let sangrias = 0;
  for (const m of movements) {
    if (m.type === 'suprimento') suprimentos += m.amount;
    if (m.type === 'sangria') sangrias += m.amount;
  }

  // Expected in drawer = initial float + cash sales + suprimentos - sangrias
  const expectedCashInDrawer = session.initial_balance + cashTotal + suprimentos - sangrias;
  const totalRevenue = cashTotal + pixTotal + debitoTotal + creditoTotal;

  res.json({
    success: true,
    has_open_session: true,
    session,
    totals: {
      initial_balance: session.initial_balance,
      cash: cashTotal,
      pix: pixTotal,
      cartao_debito: debitoTotal,
      cartao_credito: creditoTotal,
      cortesia: cortesiaTotal,
      suprimentos,
      sangrias,
      expectedCashInDrawer,
      totalRevenue
    },
    movements
  });
});

router.post('/cashier/open', (req, res) => {
  const { initial_balance, notes, userName, userId } = req.body;
  const openCheck = db.prepare("SELECT id FROM cash_sessions WHERE status = 'aberto'").get();
  if (openCheck) {
    return res.status(400).json({ success: false, message: 'Já existe um caixa aberto no momento.' });
  }

  const result = db.prepare(`
    INSERT INTO cash_sessions (user_id, opened_by, initial_balance, status, notes)
    VALUES (?, ?, ?, 'aberto', ?)
  `).run(userId || null, userName || 'Caixa', Number(initial_balance || 0), notes || '');

  logAudit(userId, userName || 'Caixa', 'OPEN_CASH_SESSION', 'Caixa', { initial_balance });
  res.json({ success: true, sessionId: Number(result.lastInsertRowid), message: 'Caixa aberto com sucesso.' });
});

router.post('/cashier/movement', (req, res) => {
  const { type, amount, reason, userName } = req.body; // 'sangria' or 'suprimento'
  if (!['sangria', 'suprimento'].includes(type) || !amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Tipo ou valor inválido.' });
  }
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'A justificativa é obrigatória.' });
  }

  const session = db.prepare("SELECT id FROM cash_sessions WHERE status = 'aberto' ORDER BY id DESC LIMIT 1").get();
  if (!session) {
    return res.status(400).json({ success: false, message: 'Não há caixa aberto no momento.' });
  }

  db.prepare(`
    INSERT INTO cash_movements (session_id, type, amount, reason, user_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(session.id, type, Number(amount), reason, userName || 'Caixa');

  logAudit(null, userName || 'Caixa', `CASH_${type.toUpperCase()}`, 'Caixa', { amount, reason });
  res.json({ success: true, message: `${type === 'sangria' ? 'Sangria' : 'Suprimento'} registrado com sucesso.` });
});

router.post('/cashier/close', (req, res) => {
  const { reported_balance, notes, userName } = req.body;
  const session = db.prepare("SELECT * FROM cash_sessions WHERE status = 'aberto' ORDER BY id DESC LIMIT 1").get();
  if (!session) {
    return res.status(400).json({ success: false, message: 'Nenhum caixa aberto para fechamento.' });
  }

  // Calculate expected
  const cashPaidRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE session_id = ? AND method = 'dinheiro'").get(session.id);
  const movements = db.prepare("SELECT type, SUM(amount) as total FROM cash_movements WHERE session_id = ? GROUP BY type").all(session.id);

  let suprimentos = 0;
  let sangrias = 0;
  for (const m of movements) {
    if (m.type === 'suprimento') suprimentos = m.total;
    if (m.type === 'sangria') sangrias = m.total;
  }

  const expected = session.initial_balance + (cashPaidRow ? cashPaidRow.total : 0) + suprimentos - sangrias;
  const reported = Number(reported_balance || 0);
  const diff = reported - expected;

  db.prepare(`
    UPDATE cash_sessions
    SET status = 'fechado',
        closed_by = ?,
        closed_at = CURRENT_TIMESTAMP,
        expected_balance = ?,
        reported_balance = ?,
        difference = ?,
        notes = ?
    WHERE id = ?
  `).run(userName || 'Caixa', expected, reported, diff, notes || '', session.id);

  logAudit(null, userName || 'Caixa', 'CLOSE_CASH_SESSION', 'Caixa', { expected, reported, difference: diff });
  res.json({
    success: true,
    expected,
    reported,
    difference: diff,
    message: 'Caixa fechado com sucesso.'
  });
});

// Process payment (supports partial payments, multi-payments, split bills)
router.post('/pos/pay', (req, res) => {
  const { table_id, order_id, amount, method, received_amount, userName } = req.body;

  if (!amount || Number(amount) <= 0 || !method) {
    return res.status(400).json({ success: false, message: 'Valor e forma de pagamento são obrigatórios.' });
  }

  const session = db.prepare("SELECT id FROM cash_sessions WHERE status = 'aberto' ORDER BY id DESC LIMIT 1").get();
  const sessionId = session ? session.id : null;

  let changeAmount = 0;
  if (method === 'dinheiro' && received_amount) {
    changeAmount = Math.max(0, Number(received_amount) - Number(amount));
  }

  const stmt = db.prepare(`
    INSERT INTO payments (
      table_id, order_id, session_id, amount, method, received_amount, change_amount, is_manual_record, received_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const result = stmt.run(
    table_id || null,
    order_id || null,
    sessionId,
    Number(amount),
    method,
    received_amount ? Number(received_amount) : null,
    changeAmount,
    userName || 'Caixa'
  );

  const paymentId = Number(result.lastInsertRowid);

  // If table_id is provided, check if total bill is now fully paid
  let tableClosed = false;
  if (table_id) {
    const ordersTotalRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE table_id = ? AND status != 'cancelado'").get(table_id);
    const paidTotalRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE table_id = ?").get(table_id);

    const totalOrders = ordersTotalRow.total;
    const totalPaid = paidTotalRow.total;

    if (totalPaid >= totalOrders && totalOrders > 0) {
      // Mark table as free
      db.prepare(`
        UPDATE tables
        SET status = 'livre', opened_at = NULL, client_name = NULL, notes = NULL, people_count = 0
        WHERE id = ?
      `).run(table_id);
      tableClosed = true;
    }
  }

  logAudit(null, userName || 'Caixa', 'RECEIVE_PAYMENT', 'PDV', {
    paymentId,
    amount,
    method,
    tableId: table_id,
    orderId: order_id,
    changeAmount
  });

  res.json({
    success: true,
    paymentId,
    changeAmount,
    tableClosed,
    message: changeAmount > 0 
      ? `Pagamento registrado! Troco: R$ ${changeAmount.toFixed(2)}`
      : 'Pagamento registrado com sucesso!'
  });
});

// Non-fiscal receipt format for printing
router.get('/pos/receipt/:id', (req, res) => {
  const { id } = req.params; // order id or payment id
  const { type } = req.query; // 'order' or 'table' or 'payment'

  let items = [];
  let tableNumber = null;
  let clientName = 'Cliente';
  let total = 0;
  let payments = [];

  if (type === 'table') {
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
    if (!table) return res.status(404).json({ success: false, message: 'Mesa não encontrada.' });
    tableNumber = table.number;
    clientName = table.client_name || `Mesa ${table.number}`;

    const orders = db.prepare("SELECT id, total_amount FROM orders WHERE table_id = ? AND status != 'cancelado'").all(id);
    for (const o of orders) {
      const its = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
      items.push(...its);
      total += o.total_amount;
    }
    payments = db.prepare('SELECT * FROM payments WHERE table_id = ?').all(id);
  } else {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    tableNumber = order.table_number;
    clientName = order.client_name;
    total = order.total_amount;
    items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(id);
  }

  res.json({
    success: true,
    receipt: {
      bar_name: 'BOTECO VIKINGS',
      subtitle: 'Comprovante de Conferência - NÃO FISCAL',
      date: new Date().toLocaleString('pt-BR'),
      table_number: tableNumber,
      client_name: clientName,
      items,
      total,
      payments,
      disclaimer: 'DOCUMENTO SEM VALOR FISCAL. CONTROLE INTERNO DO ESTABELECIMENTO.'
    }
  });
});

// -------------------------------------------------------------
// 9. ESTOQUE (INVENTORY)
// -------------------------------------------------------------
router.get('/stock', (req, res) => {
  const products = db.prepare(`
    SELECT p.id, p.name, p.category_id, p.price, p.destination, p.track_stock,
           p.current_stock, p.min_stock, p.unit, c.name as category_name
    FROM products p
    JOIN menu_categories c ON p.category_id = c.id
    WHERE p.track_stock = 1
    ORDER BY p.current_stock <= p.min_stock DESC, p.name ASC
  `).all();

  const alerts = products.filter(p => p.current_stock <= p.min_stock);

  res.json({
    success: true,
    products,
    totalTracked: products.length,
    lowStockCount: alerts.length
  });
});

router.post('/stock/movement', (req, res) => {
  const { product_id, type, quantity, reason, userName } = req.body;
  if (!product_id || !type || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({ success: false, message: 'Produto, tipo e quantidade válidos são obrigatórios.' });
  }
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'A justificativa do ajuste é obrigatória.' });
  }

  const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!prod) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const prev = prod.current_stock;
  const qty = Number(quantity);
  let next = prev;

  if (type === 'entrada') {
    next = prev + qty;
  } else if (type === 'saida_manual') {
    next = Math.max(0, prev - qty);
  } else if (type === 'ajuste') {
    next = qty; // In direct adjustment, quantity is the new physical count
  }

  db.prepare('UPDATE products SET current_stock = ?, track_stock = 1 WHERE id = ?').run(next, product_id);

  db.prepare(`
    INSERT INTO stock_movements (product_id, type, quantity, previous_stock, new_stock, reason, user_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(product_id, type, qty, prev, next, reason, userName || 'Gerente');

  logAudit(null, userName || 'Gerente', 'STOCK_MOVEMENT', 'Estoque', {
    product: prod.name,
    type,
    prev,
    next,
    reason
  });

  res.json({ success: true, newStock: next, message: 'Movimentação registrada com sucesso.' });
});

router.get('/stock/history', (req, res) => {
  const movements = db.prepare(`
    SELECT sm.*, p.name as product_name, p.unit
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    ORDER BY sm.created_at DESC
    LIMIT 100
  `).all();

  res.json({ success: true, movements });
});

// -------------------------------------------------------------
// 10. KARAOKÊ INTERATIVO — "SOLTA A VOZ, VIKINGS!"
// -------------------------------------------------------------
router.get('/karaoke/session', (req, res) => {
  const session = db.prepare('SELECT * FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  const ruleRow = db.prepare("SELECT value FROM settings WHERE key = 'karaoke_rule_info'").get();
  res.json({
    success: true,
    session: session || null,
    rule_info: ruleRow ? ruleRow.value : 'Regra de Rodízio Vikings: Todo guerreiro tem a sua vez!'
  });
});

router.get('/karaoke/songs', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM karaoke_songs WHERE is_available = 1';
  const params = [];
  if (search) {
    sql += ' AND (title LIKE ? OR artist LIKE ? OR genre LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY title ASC LIMIT 50';
  const songs = db.prepare(sql).all(...params);
  res.json({ success: true, songs });
});

// Customer registers song request
router.post('/karaoke/request', (req, res) => {
  const { client_name, table_number, song_title, song_artist, mode, partner_name, is_suggestion } = req.body;

  if (!client_name || !song_title || !song_artist) {
    return res.status(400).json({ success: false, message: 'Nome, música e artista são obrigatórios.' });
  }

  const session = db.prepare('SELECT * FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) {
    return res.status(400).json({ success: false, message: 'Nenhuma sessão de karaokê ativa no momento. Aguarde o início!' });
  }
  if (session.is_paused) {
    return res.status(400).json({ success: false, message: 'As inscrições para o karaokê estão temporariamente pausadas pela moderação.' });
  }

  // Check how many active requests the client has
  const activeCount = db.prepare(`
    SELECT count(*) as count FROM karaoke_requests
    WHERE session_id = ? AND lower(client_name) = lower(?) AND status IN ('pendente', 'aprovado', 'no_palco')
  `).get(session.id, client_name.trim());

  if (activeCount.count >= (session.max_requests_per_person || 1)) {
    return res.status(400).json({
      success: false,
      message: `Você já possui ${activeCount.count} música(s) na fila! Para dar oportunidade a outros guerreiros, aguarde sua apresentação.`
    });
  }

  // Count how many times this client has already sung tonight (fair round-robin)
  const timesSung = db.prepare(`
    SELECT count(*) as count FROM karaoke_requests
    WHERE session_id = ? AND lower(client_name) = lower(?) AND status = 'concluido'
  `).get(session.id, client_name.trim()).count;

  // Next sort order in queue
  const lastSort = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM karaoke_requests WHERE session_id = ?
  `).get(session.id).max_sort;

  const stmt = db.prepare(`
    INSERT INTO karaoke_requests (
      session_id, client_name, table_number, song_title, song_artist, mode, partner_name, is_suggestion, status, sort_order, times_sung_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)
  `);

  const result = stmt.run(
    session.id,
    client_name.trim(),
    table_number ? parseInt(table_number, 10) : null,
    song_title.trim(),
    song_artist.trim(),
    mode || 'solo',
    partner_name ? partner_name.trim() : null,
    is_suggestion ? 1 : 0,
    lastSort + 1,
    timesSung
  );

  const requestId = Number(result.lastInsertRowid);
  logAudit(null, client_name, 'KARAOKE_REQUEST', 'Karaokê', { requestId, song: `${song_title} - ${song_artist}` });

  res.json({
    success: true,
    requestId,
    message: is_suggestion 
      ? 'Música sugerida enviada para avaliação da moderação! Fique de olho no telão.'
      : 'Inscrição enviada com sucesso! Aguarde a moderação aprovar para entrar na fila oficial.'
  });
});

// Public Queue for Telão & Customer Status (hides sensitive data)
router.get('/karaoke/queue', (req, res) => {
  const session = db.prepare('SELECT * FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) {
    return res.json({ success: true, session_active: false, current: null, queue: [] });
  }

  const current = db.prepare(`
    SELECT id, client_name, table_number, song_title, song_artist, mode, partner_name, status
    FROM karaoke_requests
    WHERE session_id = ? AND status = 'no_palco'
    ORDER BY sort_order ASC
    LIMIT 1
  `).get(session.id);

  const queue = db.prepare(`
    SELECT id, client_name, table_number, song_title, song_artist, mode, partner_name, status, sort_order
    FROM karaoke_requests
    WHERE session_id = ? AND status = 'aprovado'
    ORDER BY times_sung_count ASC, sort_order ASC
  `).all(session.id);

  res.json({
    success: true,
    session_active: true,
    current: current || null,
    queue
  });
});

// Single client tracking status
router.get('/karaoke/my-status/:id', (req, res) => {
  const { id } = req.params;
  const reqItem = db.prepare('SELECT * FROM karaoke_requests WHERE id = ?').get(id);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Inscrição não encontrada.' });

  // Calculate position in queue if approved
  let position = null;
  if (reqItem.status === 'aprovado') {
    const ahead = db.prepare(`
      SELECT count(*) as count FROM karaoke_requests
      WHERE session_id = ? AND status = 'aprovado' AND (
        times_sung_count < ? OR (times_sung_count = ? AND sort_order < ?)
      )
    `).get(reqItem.session_id, reqItem.times_sung_count, reqItem.times_sung_count, reqItem.sort_order).count;
    position = ahead + 1;
  }

  res.json({
    success: true,
    request: reqItem,
    position
  });
});

// Customer can voluntarily cancel / give up their own request
router.post('/karaoke/cancel-my-request/:id', (req, res) => {
  const { id } = req.params;
  const reqItem = db.prepare('SELECT * FROM karaoke_requests WHERE id = ?').get(id);
  if (!reqItem) return res.status(404).json({ success: false, message: 'Inscrição não encontrada.' });

  db.prepare("UPDATE karaoke_requests SET status = 'desistiu' WHERE id = ?").run(id);
  logAudit(null, reqItem.client_name, 'KARAOKE_CANCEL_OWN', 'Karaokê', { id, song: reqItem.song_title });
  res.json({ success: true, message: 'Você desistiu da inscrição na fila.' });
});

// Admin Queue (contains pendentes, aprovados, no_palco, recusados, etc.)
router.get('/karaoke/admin/queue', (req, res) => {
  const session = db.prepare('SELECT * FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) {
    return res.json({ success: true, session: null, requests: [] });
  }

  const requests = db.prepare(`
    SELECT * FROM karaoke_requests
    WHERE session_id = ? AND status NOT IN ('concluido', 'desistiu')
    ORDER BY 
      CASE status 
        WHEN 'no_palco' THEN 1
        WHEN 'aprovado' THEN 2
        WHEN 'pendente' THEN 3
        WHEN 'pulado' THEN 4
        ELSE 5
      END,
      times_sung_count ASC,
      sort_order ASC
  `).all(session.id);

  res.json({ success: true, session, requests });
});

// Admin actions on karaoke
router.post('/karaoke/admin/approve/:id', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  db.prepare("UPDATE karaoke_requests SET status = 'aprovado' WHERE id = ?").run(id);
  logAudit(null, userName || 'Moderação Karaokê', 'APPROVE_KARAOKE', 'Karaokê', { id });
  res.json({ success: true, message: 'Inscrição aprovada e colocada na fila.' });
});

router.post('/karaoke/admin/reject/:id', (req, res) => {
  const { id } = req.params;
  const { reason, userName } = req.body;
  db.prepare("UPDATE karaoke_requests SET status = 'recusado', reject_reason = ? WHERE id = ?").run(reason || 'Não aprovado pela moderação', id);
  logAudit(null, userName || 'Moderação Karaokê', 'REJECT_KARAOKE', 'Karaokê', { id, reason });
  res.json({ success: true, message: 'Inscrição recusada.' });
});

router.post('/karaoke/admin/call-next', (req, res) => {
  const { userName } = req.body;
  const session = db.prepare('SELECT id FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) return res.status(400).json({ success: false, message: 'Nenhuma sessão ativa.' });

  // Mark current 'no_palco' as concluido
  const current = db.prepare("SELECT * FROM karaoke_requests WHERE session_id = ? AND status = 'no_palco'").get(session.id);
  if (current) {
    db.prepare(`
      UPDATE karaoke_requests 
      SET status = 'concluido', finished_at = CURRENT_TIMESTAMP, times_sung_count = times_sung_count + 1
      WHERE id = ?
    `).run(current.id);
  }

  // Find next approved
  const next = db.prepare(`
    SELECT * FROM karaoke_requests
    WHERE session_id = ? AND status = 'aprovado'
    ORDER BY times_sung_count ASC, sort_order ASC
    LIMIT 1
  `).get(session.id);

  if (!next) {
    return res.json({ success: true, message: 'Nenhum próximo participante aprovado na fila.' });
  }

  db.prepare("UPDATE karaoke_requests SET status = 'no_palco', called_at = CURRENT_TIMESTAMP WHERE id = ?").run(next.id);
  logAudit(null, userName || 'Moderação Karaokê', 'CALL_NEXT_KARAOKE', 'Karaokê', { participant: next.client_name, song: next.song_title });

  res.json({ success: true, current: next, message: `${next.client_name} chamado para o palco!` });
});

router.post('/karaoke/admin/finish/:id', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  db.prepare(`
    UPDATE karaoke_requests 
    SET status = 'concluido', finished_at = CURRENT_TIMESTAMP, times_sung_count = times_sung_count + 1
    WHERE id = ?
  `).run(id);
  logAudit(null, userName || 'Moderação Karaokê', 'FINISH_KARAOKE', 'Karaokê', { id });
  res.json({ success: true, message: 'Apresentação concluída com sucesso!' });
});

router.post('/karaoke/admin/skip/:id', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  db.prepare("UPDATE karaoke_requests SET status = 'pulado' WHERE id = ?").run(id);
  logAudit(null, userName || 'Moderação Karaokê', 'SKIP_KARAOKE', 'Karaokê', { id });
  res.json({ success: true, message: 'Participante pulado temporariamente.' });
});

router.post('/karaoke/admin/reorder', (req, res) => {
  const { request_id, direction, userName } = req.body; // 'up' or 'down'
  const target = db.prepare('SELECT * FROM karaoke_requests WHERE id = ?').get(request_id);
  if (!target) return res.status(404).json({ success: false, message: 'Inscrição não encontrada.' });

  const neighbor = direction === 'up'
    ? db.prepare('SELECT * FROM karaoke_requests WHERE session_id = ? AND status = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1').get(target.session_id, target.status, target.sort_order)
    : db.prepare('SELECT * FROM karaoke_requests WHERE session_id = ? AND status = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1').get(target.session_id, target.status, target.sort_order);

  if (neighbor) {
    db.prepare('UPDATE karaoke_requests SET sort_order = ? WHERE id = ?').run(neighbor.sort_order, target.id);
    db.prepare('UPDATE karaoke_requests SET sort_order = ? WHERE id = ?').run(target.sort_order, neighbor.id);
    logAudit(null, userName || 'Moderação Karaokê', 'REORDER_KARAOKE', 'Karaokê', { id: target.id, direction });
  }

  res.json({ success: true, message: 'Fila reorganizada.' });
});

router.post('/karaoke/admin/toggle-pause', (req, res) => {
  const { userName } = req.body;
  const session = db.prepare('SELECT * FROM karaoke_sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) return res.status(400).json({ success: false, message: 'Nenhuma sessão ativa.' });

  const newPaused = session.is_paused ? 0 : 1;
  db.prepare('UPDATE karaoke_sessions SET is_paused = ? WHERE id = ?').run(newPaused, session.id);
  logAudit(null, userName || 'Moderação Karaokê', 'TOGGLE_PAUSE_KARAOKE', 'Karaokê', { is_paused: newPaused });

  res.json({ success: true, is_paused: newPaused, message: newPaused ? 'Inscrições pausadas!' : 'Inscrições liberadas!' });
});

// -------------------------------------------------------------
// 11. REPORTS & AUDIT LOGS
// -------------------------------------------------------------
router.get('/reports/summary', (req, res) => {
  // Orders total (Total Vendido)
  const soldRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total, count(*) as count FROM orders WHERE status != 'cancelado'").get();
  
  // Received payments (Total Recebido)
  const receivedRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments").get();
  
  // Open balance (Em Aberto)
  const openBalance = Math.max(0, soldRow.total - receivedRow.total);
  
  // Average Ticket
  const avgTicket = soldRow.count > 0 ? (soldRow.total / soldRow.count) : 0;
  
  // Open tables
  const openTablesCount = db.prepare("SELECT count(*) as count FROM tables WHERE status = 'ocupada'").get().count;
  
  // Active kitchen/bar orders
  const activeOrdersCount = db.prepare("SELECT count(*) as count FROM orders WHERE status IN ('confirmado', 'em_preparo')").get().count;
  
  // Karaoke waiting
  const karaokeWaitingCount = db.prepare("SELECT count(*) as count FROM karaoke_requests WHERE status IN ('pendente', 'aprovado')").get().count;

  res.json({
    success: true,
    metrics: {
      totalSold: soldRow.total,
      totalReceived: receivedRow.total,
      openBalance,
      avgTicket,
      ordersCount: soldRow.count,
      openTablesCount,
      activeOrdersCount,
      karaokeWaitingCount
    }
  });
});

router.get('/reports/top-products', (req, res) => {
  const top = db.prepare(`
    SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'cancelado'
    GROUP BY oi.product_name
    ORDER BY total_qty DESC
    LIMIT 10
  `).all();

  res.json({ success: true, topProducts: top });
});

router.get('/reports/payments-by-method', (req, res) => {
  const methods = db.prepare(`
    SELECT method, SUM(amount) as total, count(*) as count
    FROM payments
    GROUP BY method
    ORDER BY total DESC
  `).all();

  res.json({ success: true, methods });
});

router.get('/reports/cancellations', (req, res) => {
  const cancellations = db.prepare(`
    SELECT id, table_number, client_name, total_amount, cancelled_reason, cancelled_by, created_at
    FROM orders
    WHERE status = 'cancelado'
    ORDER BY id DESC
  `).all();

  res.json({ success: true, cancellations });
});

router.get('/reports/export-csv', (req, res) => {
  const orders = db.prepare(`
    SELECT id, table_number, client_name, origin, status, total_amount, created_at
    FROM orders
    ORDER BY id DESC
  `).all();

  let csv = 'ID;Mesa;Cliente;Origem;Status;Valor_Total;Data_Hora\n';
  for (const o of orders) {
    csv += `${o.id};${o.table_number || 'Balcão'};"${o.client_name || ''}";${o.origin};${o.status};${(o.total_amount || 0).toFixed(2)};${o.created_at}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="boteco_vikings_relatorio_vendas.csv"');
  res.send('\uFEFF' + csv);
});

router.get('/audit', (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
  res.json({ success: true, logs });
});

// -------------------------------------------------------------
// 12. QR CODE GENERATOR API
// -------------------------------------------------------------
router.get('/qrcode', async (req, res) => {
  const { text } = req.query;
  if (!text) return res.status(400).send('Text required');

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 2,
      width: 250,
      color: {
        dark: '#221004',
        light: '#F6E7CB'
      }
    });
    res.json({ success: true, dataUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vikings.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

function initSchema() {
  db.exec(`
    -- Configuration & Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Users and Staff RBAC
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL, -- 'administrador', 'gerente', 'caixa', 'garcom', 'cozinha', 'bar', 'karaoke'
      pin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Events & Weekly Schedule
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- 'show', 'karaoke', 'jogo', 'especial', 'promo'
      weekday_label TEXT NOT NULL, -- e.g. 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'
      date_formatted TEXT NOT NULL, -- e.g. '06/NOV', '07/NOV'
      event_date DATE NOT NULL,
      time_label TEXT NOT NULL, -- e.g. 'a partir das 19h'
      description TEXT,
      image_url TEXT,
      badge_text TEXT,
      is_published INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Menu Categories
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      destination TEXT DEFAULT 'bar', -- 'bar', 'cozinha', 'direto'
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    -- Menu Products
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES menu_categories(id),
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      destination TEXT NOT NULL DEFAULT 'bar', -- 'cozinha', 'bar', 'direto'
      image_url TEXT,
      is_featured INTEGER DEFAULT 0,
      is_sold_out INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      track_stock INTEGER DEFAULT 0,
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 5,
      unit TEXT DEFAULT 'un',
      variations_json TEXT, -- e.g. [{"name": "Pint 500ml", "price": 18.00}, {"name": "Caneca 300ml", "price": 12.00}]
      addons_json TEXT, -- e.g. [{"name": "Bacon extra", "price": 4.00}, {"name": "Queijo Gouda", "price": 5.00}]
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Stock Movement Logs
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      type TEXT NOT NULL, -- 'entrada', 'saida_venda', 'ajuste', 'estorno_cancelamento'
      quantity REAL NOT NULL,
      previous_stock REAL NOT NULL,
      new_stock REAL NOT NULL,
      reason TEXT,
      user_name TEXT,
      reference_order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tables and Comandas
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER UNIQUE NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'livre', -- 'livre', 'ocupada', 'aguardando_fechamento'
      people_count INTEGER DEFAULT 0,
      opened_at DATETIME,
      client_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customer Orders
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER REFERENCES tables(id),
      table_number INTEGER,
      comanda_code TEXT,
      client_name TEXT,
      origin TEXT NOT NULL DEFAULT 'pos', -- 'pos', 'qr_mesa', 'balcao'
      status TEXT NOT NULL DEFAULT 'confirmado', -- 'aguardando_confirmacao', 'confirmado', 'em_preparo', 'pronto', 'entregue', 'cancelado'
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      cancelled_reason TEXT,
      cancelled_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      ready_at DATETIME,
      delivered_at DATETIME
    );

    -- Order Items
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      destination TEXT NOT NULL, -- 'cozinha', 'bar', 'direto'
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      variation_name TEXT,
      addons_text TEXT,
      notes TEXT,
      total_price REAL NOT NULL,
      prep_status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'em_preparo', 'pronto', 'entregue'
      started_prep_at DATETIME,
      finished_prep_at DATETIME
    );

    -- Cash Drawer Registers (Caixa)
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      opened_by TEXT NOT NULL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      initial_balance REAL NOT NULL DEFAULT 0,
      closed_by TEXT,
      closed_at DATETIME,
      expected_balance REAL DEFAULT 0,
      reported_balance REAL DEFAULT 0,
      difference REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'aberto', -- 'aberto', 'fechado'
      notes TEXT
    );

    -- Cash Drawer Operations (Sangria, Suprimento)
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
      type TEXT NOT NULL, -- 'suprimento', 'sangria'
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      user_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payments Recorded
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER REFERENCES tables(id),
      order_id INTEGER REFERENCES orders(id),
      session_id INTEGER REFERENCES cash_sessions(id),
      amount REAL NOT NULL,
      method TEXT NOT NULL, -- 'dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'cortesia'
      received_amount REAL, -- for cash change calculation
      change_amount REAL,
      is_manual_record INTEGER DEFAULT 1, -- explicitly flags non-integrated manual registration
      received_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Karaoke Songs Catalog
    CREATE TABLE IF NOT EXISTS karaoke_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      genre TEXT,
      language TEXT DEFAULT 'PT',
      difficulty TEXT DEFAULT 'Média',
      is_available INTEGER DEFAULT 1
    );

    -- Karaoke Sessions
    CREATE TABLE IF NOT EXISTS karaoke_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_paused INTEGER DEFAULT 0, -- pause new registrations
      max_requests_per_person INTEGER DEFAULT 1,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );

    -- Karaoke Queue & Requests
    CREATE TABLE IF NOT EXISTS karaoke_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES karaoke_sessions(id),
      client_name TEXT NOT NULL,
      table_number INTEGER,
      song_title TEXT NOT NULL,
      song_artist TEXT NOT NULL,
      mode TEXT DEFAULT 'solo', -- 'solo', 'dupla'
      partner_name TEXT,
      is_suggestion INTEGER DEFAULT 0, -- 1 if not from catalog
      status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'aprovado', 'no_palco', 'concluido', 'recusado', 'pulado', 'desistiu'
      reject_reason TEXT,
      sort_order INTEGER DEFAULT 0,
      times_sung_count INTEGER DEFAULT 0, -- for round-robin fairness
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME,
      finished_at DATETIME
    );
  `);
}

function seedDefaultData() {
  // Check if already seeded
  const checkSettings = db.prepare("SELECT count(*) as count FROM settings WHERE key = 'bar_name'").get();
  if (checkSettings.count > 0) {
    return;
  }

  // Settings
  const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  insertSetting.run('bar_name', 'Boteco Vikings');
  insertSetting.run('tagline', 'O Boteco Raiz com Espírito Nórdico');
  insertSetting.run('phone', '(11) 98765-4321');
  insertSetting.run('whatsapp', '5511987654321');
  insertSetting.run('address', 'Rua dos Guerreiros, 980 - Bairro Boêmio');
  insertSetting.run('hours', 'Terça a Domingo: a partir das 17h até o último guerreiro');
  insertSetting.run('digital_order_mode', 'com_confirmacao'); // 'apenas_consulta' ou 'com_confirmacao'
  insertSetting.run('karaoke_rule_info', 'Regra de Rodízio Vikings: Todo guerreiro tem a sua vez! Participantes que ainda não cantaram têm preferência sobre repetições.');

  // Default Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, username, password_hash, role, pin)
    VALUES (?, ?, ?, ?, ?)
  `);
  // Simple demonstration hashes (in production, use bcrypt/argon2)
  insertUser.run('Ragnar Administrador', 'admin', 'admin123', 'administrador', '1010');
  insertUser.run('Lagertha Gerente', 'gerente', 'gerente123', 'gerente', '2020');
  insertUser.run('Bjorn Caixa', 'caixa', 'caixa123', 'caixa', '3030');
  insertUser.run('Floki Garçom', 'garcom', 'garcom123', 'garcom', '4040');
  insertUser.run('Chef Ivar (Cozinha)', 'cozinha', 'cozinha123', 'cozinha', '5050');
  insertUser.run('Barman Rollo (Bar)', 'bar', 'bar123', 'bar', '6060');
  insertUser.run('Harald Karaokê', 'karaoke', 'karaoke123', 'karaoke', '7070');

  // Audit initial log
  db.prepare(`
    INSERT INTO audit_logs (user_id, user_name, action, target, details)
    VALUES (1, 'Sistema', 'SISTEMA_INICIADO', 'Database', 'Carga inicial do banco de dados concluída')
  `).run();

  // Tables 1 to 16
  const insertTable = db.prepare("INSERT INTO tables (number, label, status, people_count) VALUES (?, ?, 'livre', 0)");
  for (let i = 1; i <= 16; i++) {
    insertTable.run(i, `Mesa ${i}`);
  }

  // Pre-open Table 3 and Table 7 for demo
  db.prepare(`
    UPDATE tables 
    SET status = 'ocupada', people_count = 4, opened_at = datetime('now', '-45 minutes'), client_name = 'Turma do Erick'
    WHERE number = 3
  `).run();

  db.prepare(`
    UPDATE tables 
    SET status = 'ocupada', people_count = 2, opened_at = datetime('now', '-20 minutes'), client_name = 'Astrid & Helga'
    WHERE number = 7
  `).run();

  // Categories
  const insertCat = db.prepare(`
    INSERT INTO menu_categories (name, slug, description, destination, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertCat.run('Chopps & Cervejas', 'chopps', 'Chopp geladíssimo tirado na pressão e artesanais nórdicas', 'bar', 1);
  insertCat.run('Drinks Vikings & Autorais', 'drinks', 'Coquetéis artesanais inspirados nas lendas escandinavas', 'bar', 2);
  insertCat.run('Porções & Petiscos da Casa', 'porcoes', 'Porções fartas, fritas sequinhas e carnes na tábua', 'cozinha', 3);
  insertCat.run('Burgers & Sandubas Raiz', 'burgers', 'Hambúrgueres artesanais na brasa no pão brioche', 'cozinha', 4);
  insertCat.run('Doses & Destilados', 'doses', 'Cachaças envelhecidas, hidromel e destilados nobres', 'bar', 5);
  insertCat.run('Sobremesas', 'sobremesas', 'Para adoçar a vitória após o banquete', 'cozinha', 6);
  insertCat.run('Bebidas Sem Álcool', 'sem-alcool', 'Sucos naturais, refrigerantes e mocktails', 'bar', 7);

  // Products
  const insertProd = db.prepare(`
    INSERT INTO products (
      category_id, name, description, price, destination, image_url, 
      is_featured, is_sold_out, track_stock, current_stock, min_stock, unit, variations_json, addons_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Chopps (cat 1)
  insertProd.run(
    1,
    'Chopp Pilsen Vikings',
    'Chopp artesanal leve, dourado, espuma densa e refrescância máxima.',
    12.00,
    'bar',
    'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 140, 30, 'caneca',
    JSON.stringify([
      { name: 'Caneca 300ml', price: 12.00 },
      { name: 'Pint Nórdico 500ml', price: 18.00 },
      { name: 'Torre de Chopp 2.5L', price: 79.00 }
    ]),
    JSON.stringify([]),
    1
  );

  insertProd.run(
    1,
    'Chopp IPA Valhalla',
    'IPA aromática com lúpulos cítricos marcantes e amargor potente equilibrado.',
    16.00,
    'bar',
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 65, 20, 'caneca',
    JSON.stringify([
      { name: 'Caneca 300ml', price: 16.00 },
      { name: 'Pint Nórdico 500ml', price: 23.00 }
    ]),
    JSON.stringify([]),
    2
  );

  insertProd.run(
    1,
    'Chopp Stout Barba Negra',
    'Cerveja escura com notas torradas de café e cacau holandês.',
    17.00,
    'bar',
    'https://images.unsplash.com/photo-1518542698889-ca82282f08d5?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 40, 15, 'caneca',
    null, null, 3
  );

  // Drinks (cat 2)
  insertProd.run(
    2,
    'Martelo de Thor (Caipirinha Especial)',
    'Cachaça artesanal envelhecida em barril de carvalho, limão tahiti, siciliano e rapadura ralada.',
    26.00,
    'bar',
    'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&q=80',
    1, 0, 0, 0, 0, 'taça',
    JSON.stringify([
      { name: 'Com Cachaça Artesanal', price: 26.00 },
      { name: 'Com Vodka Smirnoff', price: 28.00 },
      { name: 'Com Vodka Absolut', price: 34.00 }
    ]),
    JSON.stringify([
      { name: 'Pimenta dedo-de-moça', price: 2.00 },
      { name: 'Borda com sal especiado', price: 2.00 }
    ]),
    1
  );

  insertProd.run(
    2,
    'Fúria de Odin (Gin Tônica Boteco)',
    'Gin infusionado com zimbro, xarope artesanal de frutas vermelhas, tônica e alecrim maçaricado.',
    32.00,
    'bar',
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    1, 0, 0, 0, 0, 'taça',
    null, null, 2
  );

  insertProd.run(
    2,
    'Sangue Viking (Hidromel Sour)',
    'Hidromel tradicional, suco fresco de limão cravo, clara pasteurizada e gotas de angostura.',
    30.00,
    'bar',
    'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 28, 10, 'copo',
    null, null, 3
  );

  // Porções (cat 3)
  insertProd.run(
    3,
    'Tábua do Conquistador (Picanha na Chapa)',
    'Tiras suculentas de picanha grelhada com cebola caramelizada na manteiga de garrafa, farofa crocante e vinagrete da casa.',
    89.90,
    'cozinha',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 18, 5, 'tábua',
    null,
    JSON.stringify([
      { name: 'Pão de alho extra (2un)', price: 10.00 },
      { name: 'Queijo coalho tostado', price: 14.00 },
      { name: 'Mandioca frita', price: 12.00 }
    ]),
    1
  );

  insertProd.run(
    3,
    'Torresmo de Rolo Vikings',
    'Torresmo crocante por fora, pururucado na hora, carne macia e suculenta por dentro. Acompanha geleia de pimenta defumada.',
    48.00,
    'cozinha',
    'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 25, 8, 'porção',
    null, null, 2
  );

  insertProd.run(
    3,
    'Batata Rústica com Cheddar e Costela Desfiada',
    'Batatas rústicas cortadas à mão, alecrim, creme de cheddar cremoso e costela bovina desfiada no bafo.',
    42.00,
    'cozinha',
    'https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 30, 10, 'porção',
    null,
    JSON.stringify([
      { name: 'Bacon crocante em cubos', price: 6.00 },
      { name: 'Cheddar extra', price: 5.00 }
    ]),
    3
  );

  insertProd.run(
    3,
    'Bolinho de Costela com Provolone (8un)',
    'Massa cremosa de costela desfiada temperada com especiarias, recheada com queijo provolone derretido.',
    38.00,
    'cozinha',
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 15, 6, 'porção',
    null, null, 4
  );

  // Burgers (cat 4)
  insertProd.run(
    4,
    'Burger Vikings Vikingo (180g)',
    'Hambúrguer 180g angus na brasa, queijo cheddar inglês, fatias grossas de bacon artesanal, maionese defumada no pão brioche.',
    38.00,
    'cozinha',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    1, 0, 1, 45, 10, 'un',
    null,
    JSON.stringify([
      { name: 'Blend extra 180g', price: 14.00 },
      { name: 'Ovo frito caipira', price: 4.00 },
      { name: 'Batata frita individual', price: 9.00 }
    ]),
    1
  );

  // Doses (cat 5)
  insertProd.run(
    5,
    'Dose de Hidromel Artesanal',
    'Fermentado milenar de mel silvestre, notas florais e toque suave adocicado.',
    15.00,
    'bar',
    'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 35, 10, 'dose',
    null, null, 1
  );

  // Sem Álcool (cat 7)
  insertProd.run(
    7,
    'Refrigerante Lata 350ml',
    'Coca-Cola, Guaraná Antarctica ou Água Tônica.',
    7.50,
    'bar',
    'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 120, 30, 'lata',
    JSON.stringify([
      { name: 'Coca-Cola Tradicional', price: 7.50 },
      { name: 'Coca-Cola Zero', price: 7.50 },
      { name: 'Guaraná Antarctica', price: 7.50 }
    ]),
    null, 1
  );

  insertProd.run(
    7,
    'Água Mineral 500ml',
    'Com ou sem gás.',
    5.00,
    'bar',
    'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=600&q=80',
    0, 0, 1, 80, 20, 'garrafa',
    JSON.stringify([
      { name: 'Sem Gás', price: 5.00 },
      { name: 'Com Gás', price: 5.00 }
    ]),
    null, 2
  );

  // Weekly Events (Programação da Semana com o formato de faixas da identidade)
  const insertEvent = db.prepare(`
    INSERT INTO events (
      title, category, weekday_label, date_formatted, event_date, time_label, description, badge_text, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertEvent.run(
    'Solta a Voz, Vikings! Noite de Karaokê Raiz',
    'karaoke',
    'QUINTA',
    '06/NOV',
    '2026-11-06',
    'A partir das 20h',
    'Comande o microfone no telão do Vikings! Chopp em dobro até as 21h e prêmio em cerveja para as 3 melhores apresentações.',
    'KARAOKÊ NIGHT',
    1
  );

  insertEvent.run(
    'Rock Clássico & Pop Acústico com Banda Berserker',
    'show',
    'SEXTA',
    '07/NOV',
    '2026-11-07',
    'A partir das 20h30',
    'Grandes hinos do Creedence, Pink Floyd, Queen, Legião e Capital com a energia do Boteco Vikings.',
    'MÚSICA AO VIVO',
    2
  );

  insertEvent.run(
    'Sábado de Boteco & Clássicos do Samba Rock',
    'show',
    'SÁBADO',
    '08/NOV',
    '2026-11-08',
    'A partir das 19h',
    'Aquecimento perfeito com tábuas de carne na chapa, caipirinhas artesanais e roda de boteco ao vivo.',
    'SHOW AO VIVO',
    3
  );

  insertEvent.run(
    'Transmissão Especial: Final do Campeonato na Telona',
    'jogo',
    'DOMINGO',
    '09/NOV',
    '2026-11-09',
    'A partir das 16h',
    'Transmissão em alta definição no telão e televisores do salão. Balde de cerveja com desconto durante todo o jogo.',
    'FUTEBOL & CHOPP',
    4
  );

  // Demo Karaoke Session and Songs Catalog
  const insertKaraokeSession = db.prepare(`
    INSERT INTO karaoke_sessions (name, is_active, is_paused, max_requests_per_person)
    VALUES ('Noite Vikings Solta a Voz', 1, 0, 1)
  `);
  insertKaraokeSession.run();

  const insertSong = db.prepare(`
    INSERT INTO karaoke_songs (title, artist, genre, difficulty)
    VALUES (?, ?, ?, ?)
  `);
  const songs = [
    ['Evidências', 'Chitãozinho & Xororó', 'Sertanejo', 'Média'],
    ['Bohemian Rhapsody', 'Queen', 'Rock', 'Difícil'],
    ['Tempo Perdido', 'Legião Urbana', 'Rock Nacional', 'Fácil'],
    ['Cheia de Manias', 'Raça Negra', 'Pagode', 'Fácil'],
    ['Sweet Child O\' Mine', 'Guns N\' Roses', 'Rock', 'Difícil'],
    ['Garçom', 'Reginaldo Rossi', 'Brega Raiz', 'Fácil'],
    ['Wonderwall', 'Oasis', 'Pop/Rock', 'Fácil'],
    ['Dormi na Praça', 'Bruno & Marrone', 'Sertanejo', 'Fácil'],
    ['Primeiros Erros', 'Capital Inicial', 'Rock Nacional', 'Fácil'],
    ['I Want It That Way', 'Backstreet Boys', 'Pop', 'Média'],
    ['Anna Júlia', 'Los Hermanos', 'Rock Nacional', 'Fácil'],
    ['Pense em Mim', 'Leandro & Leonardo', 'Sertanejo', 'Fácil'],
    ['Don\'t Stop Believin\'', 'Journey', 'Rock', 'Média'],
    ['Lanterna dos Afogados', 'Os Paralamas do Sucesso', 'Rock Nacional', 'Média'],
    ['Deixa Acontecer', 'Grupo Revelação', 'Pagode', 'Fácil'],
    ['Apenas Mais Uma de Amor', 'Lulu Santos', 'MPB/Pop', 'Fácil']
  ];
  for (const s of songs) {
    insertSong.run(s[0], s[1], s[2], s[3]);
  }

  // Pre-seed some demo karaoke queue requests
  const insertRequest = db.prepare(`
    INSERT INTO karaoke_requests (
      session_id, client_name, table_number, song_title, song_artist, mode, partner_name, status, sort_order, times_sung_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRequest.run(1, 'Rodrigo Viking', 3, 'Evidências', 'Chitãozinho & Xororó', 'solo', null, 'no_palco', 1, 0);
  insertRequest.run(1, 'Camila & Lucas', 7, 'Tempo Perdido', 'Legião Urbana', 'dupla', 'Lucas', 'aprovado', 2, 0);
  insertRequest.run(1, 'Gustavo Guitar', 5, 'Sweet Child O\' Mine', 'Guns N\' Roses', 'solo', null, 'aprovado', 3, 0);
  insertRequest.run(1, 'Patrícia Solta a Voz', 2, 'Cheia de Manias', 'Raça Negra', 'solo', null, 'pendente', 4, 0);

  // Pre-seed an open cash register session
  const insertCashSession = db.prepare(`
    INSERT INTO cash_sessions (user_id, opened_by, initial_balance, status, notes)
    VALUES (3, 'Bjorn Caixa', 250.00, 'aberto', 'Abertura de caixa do turno da noite')
  `);
  insertCashSession.run();

  // Create demo active orders on Table 3 and 7
  const insertOrder = db.prepare(`
    INSERT INTO orders (table_id, table_number, client_name, origin, status, total_amount, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-30 minutes'))
  `);

  const order1 = insertOrder.run(3, 3, 'Turma do Erick', 'pos', 'confirmado', 101.90);
  const order1Id = Number(order1.lastInsertRowid);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (
      order_id, product_id, product_name, destination, quantity, unit_price, variation_name, addons_text, notes, total_price, prep_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertOrderItem.run(order1Id, 1, 'Chopp Pilsen Vikings', 'bar', 3, 12.00, 'Caneca 300ml', '', 'Bem gelado com colarinho', 36.00, 'entregue');
  insertOrderItem.run(order1Id, 7, 'Tábua do Conquistador (Picanha na Chapa)', 'cozinha', 1, 89.90, '', 'Ponto da carne: ao ponto', 'Sem cebola em uma das pontas', 89.90, 'em_preparo');

  // Update order total
  db.prepare("UPDATE orders SET total_amount = 125.90 WHERE id = ?").run(order1Id);
}

initSchema();
seedDefaultData();

module.exports = { db };

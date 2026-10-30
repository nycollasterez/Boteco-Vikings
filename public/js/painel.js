// ==============================================================
// PAINEL DE GESTÃO DO BOTECO VIKINGS — CONTROLLER JAVASCRIPT
// ==============================================================

const STATE = {
  currentUser: {
    id: 1,
    name: 'Ragnar Admin',
    role: 'administrador'
  },
  activeTab: 'tab-dashboard',
  tables: [],
  products: [],
  categories: [],
  cashier: null,
  pdvCart: [],
  selectedTableForDetails: null,
  pollTimer: null
};

// Demo users map
const DEMO_USERS = {
  admin: { id: 1, name: 'Ragnar Administrador', role: 'administrador' },
  gerente: { id: 2, name: 'Lagertha Gerente', role: 'gerente' },
  caixa: { id: 3, name: 'Bjorn Caixa', role: 'caixa' },
  garcom: { id: 4, name: 'Floki Garçom', role: 'garcom' },
  cozinha: { id: 5, name: 'Chef Ivar (Cozinha)', role: 'cozinha' },
  bar: { id: 6, name: 'Barman Rollo (Bar)', role: 'bar' },
  karaoke: { id: 7, name: 'Harald Karaokê', role: 'karaoke' }
};

// Role permissions mapping
const ROLE_TABS = {
  administrador: ['tab-dashboard', 'tab-mesas', 'tab-pendentes', 'tab-pdv', 'tab-cozinha', 'tab-bar', 'tab-prontos', 'tab-karaoke', 'tab-cardapio', 'tab-agenda', 'tab-estoque', 'tab-relatorios', 'tab-qrcodes'],
  gerente: ['tab-dashboard', 'tab-mesas', 'tab-pendentes', 'tab-pdv', 'tab-cozinha', 'tab-bar', 'tab-prontos', 'tab-karaoke', 'tab-cardapio', 'tab-agenda', 'tab-estoque', 'tab-relatorios', 'tab-qrcodes'],
  caixa: ['tab-mesas', 'tab-pdv', 'tab-qrcodes'],
  garcom: ['tab-mesas', 'tab-pendentes', 'tab-prontos', 'tab-cardapio'],
  cozinha: ['tab-cozinha'],
  bar: ['tab-bar'],
  karaoke: ['tab-karaoke']
};

function initPanel() {
  // Load initial tab from hash or default
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById(hash)) {
    STATE.activeTab = hash;
  }
  updateUserDisplay();
  applyRolePermissions();
  switchTab(STATE.activeTab);

  // Initial data loads
  loadDashboardData();
  loadTables();
  loadProducts();
  loadCashierInfo();
  loadPendingOrders();
  loadKdsCozinha();
  loadKdsBar();
  loadReadyOrders();
  loadKaraokeAdmin();
  loadStock();
  loadAuditLogs();
  generateQrCards();

  // Background polling every 5 seconds for real-time sync across staff
  if (STATE.pollTimer) clearInterval(STATE.pollTimer);
  STATE.pollTimer = setInterval(pollRealtimeData, 5000);
}

function pollRealtimeData() {
  loadPendingOrders();
  loadReadyOrders();
  if (STATE.activeTab === 'tab-mesas') loadTables();
  if (STATE.activeTab === 'tab-cozinha') loadKdsCozinha();
  if (STATE.activeTab === 'tab-bar') loadKdsBar();
  if (STATE.activeTab === 'tab-karaoke') loadKaraokeAdmin();
  if (STATE.activeTab === 'tab-dashboard') loadDashboardData();
}

function switchDemoUser(roleKey) {
  const user = DEMO_USERS[roleKey];
  if (!user) return;
  STATE.currentUser = user;
  updateUserDisplay();

  // Update UI selector buttons
  document.querySelectorAll('.demo-user-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  applyRolePermissions();

  // Check if current tab is allowed, otherwise switch to first allowed
  const allowed = ROLE_TABS[user.role] || [];
  if (!allowed.includes(STATE.activeTab)) {
    switchTab(allowed[0]);
  }
}

function updateUserDisplay() {
  document.getElementById('currentUserName').innerText = STATE.currentUser.name;
  document.getElementById('currentUserRole').innerText = STATE.currentUser.role;
}

function applyRolePermissions() {
  const allowed = ROLE_TABS[STATE.currentUser.role] || [];
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    const tab = link.getAttribute('data-tab');
    if (allowed.includes(tab)) {
      link.style.display = 'flex';
    } else {
      link.style.display = 'none';
    }
  });
}

function switchTab(tabId) {
  const allowed = ROLE_TABS[STATE.currentUser.role] || [];
  if (!allowed.includes(tabId)) {
    alert(`Seu perfil (${STATE.currentUser.role}) não tem acesso a esta seção.`);
    return;
  }

  STATE.activeTab = tabId;
  window.location.hash = tabId;

  // Nav links highlight
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-tab') === tabId);
  });

  // Tab contents
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  // Title update
  const titleMap = {
    'tab-dashboard': 'Dashboard Geral',
    'tab-mesas': 'Salão & Gestão de Mesas',
    'tab-pendentes': 'Pedidos Pendentes (Aprovação QR)',
    'tab-pdv': 'PDV Balcão & Caixa',
    'tab-cozinha': 'KDS Cozinha',
    'tab-bar': 'KDS Bar',
    'tab-prontos': 'Pedidos Prontos para Entrega',
    'tab-karaoke': 'Moderação da Fila do Karaokê',
    'tab-cardapio': 'Gestão do Cardápio',
    'tab-agenda': 'Agenda da Programação da Semana',
    'tab-estoque': 'Controle de Estoque & Insumos',
    'tab-relatorios': 'Relatórios Gerenciais & Auditoria',
    'tab-qrcodes': 'QR Codes para Mesas'
  };
  document.getElementById('pageTitleDisplay').innerText = titleMap[tabId] || 'Painel';

  refreshCurrentTab();
}

function refreshCurrentTab() {
  switch (STATE.activeTab) {
    case 'tab-dashboard': loadDashboardData(); break;
    case 'tab-mesas': loadTables(); break;
    case 'tab-pendentes': loadPendingOrders(); break;
    case 'tab-pdv': loadCashierInfo(); loadPdvProducts(); break;
    case 'tab-cozinha': loadKdsCozinha(); break;
    case 'tab-bar': loadKdsBar(); break;
    case 'tab-prontos': loadReadyOrders(); break;
    case 'tab-karaoke': loadKaraokeAdmin(); break;
    case 'tab-cardapio': loadAdminProducts(); break;
    case 'tab-agenda': loadAdminEvents(); break;
    case 'tab-estoque': loadStock(); break;
    case 'tab-relatorios': loadReports(); break;
    case 'tab-qrcodes': generateQrCards(); break;
  }
}

// -------------------------------------------------------------
// 1. DASHBOARD
// -------------------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await fetch('/api/reports/summary');
    const data = await res.json();
    if (!data.success) return;

    const m = data.metrics;
    document.getElementById('kpiTotalSold').innerText = `R$ ${m.totalSold.toFixed(2)}`;
    document.getElementById('kpiOrdersCount').innerText = `${m.ordersCount} pedidos registrados`;
    document.getElementById('kpiTotalReceived').innerText = `R$ ${m.totalReceived.toFixed(2)}`;
    document.getElementById('kpiOpenBalance').innerText = `R$ ${m.openBalance.toFixed(2)}`;
    document.getElementById('kpiAvgTicket').innerText = `R$ ${m.avgTicket.toFixed(2)}`;

    // Top products
    const resTop = await fetch('/api/reports/top-products');
    const dataTop = await resTop.json();
    const topContainer = document.getElementById('dashTopProductsList');
    if (dataTop.topProducts && dataTop.topProducts.length > 0) {
      topContainer.innerHTML = dataTop.topProducts.slice(0, 5).map(tp => `
        <div style="display: flex; justify-content: space-between; align-items: center; background-color: var(--bg-deep); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
          <div>
            <div style="font-weight: 700; color: var(--gold);">${tp.product_name}</div>
            <div style="font-size: 0.8rem; color: var(--cream-dim);">${tp.total_qty} unidades vendidas</div>
          </div>
          <div style="font-weight: 700; color: var(--cream);">R$ ${tp.total_revenue.toFixed(2)}</div>
        </div>
      `).join('');
    } else {
      topContainer.innerHTML = '<div style="color: var(--cream-dim); font-size: 0.9rem;">Nenhuma venda computada hoje.</div>';
    }

    // Alerts
    const alertsContainer = document.getElementById('dashAlertsList');
    let alertsHtml = '';

    if (m.activeOrdersCount > 0) {
      alertsHtml += `
        <div style="background-color: var(--status-amber-bg); border: 1px solid var(--status-amber); padding: 12px; border-radius: var(--radius-sm); color: var(--cream);">
          <strong>🍳 ${m.activeOrdersCount} pedidos</strong> em andamento na cozinha e bar.
        </div>
      `;
    }

    if (m.openTablesCount > 0) {
      alertsHtml += `
        <div style="background-color: var(--status-blue-bg); border: 1px solid var(--status-blue); padding: 12px; border-radius: var(--radius-sm); color: var(--cream);">
          <strong>🍽️ ${m.openTablesCount} mesas ocupadas</strong> gerando consumo no salão.
        </div>
      `;
    }

    if (m.karaokeWaitingCount > 0) {
      alertsHtml += `
        <div style="background-color: rgba(242, 181, 68, 0.15); border: 1px solid var(--gold); padding: 12px; border-radius: var(--radius-sm); color: var(--cream);">
          <strong>🎤 ${m.karaokeWaitingCount} guerreiros</strong> na fila do Solta a Voz Karaokê!
        </div>
      `;
    }

    alertsContainer.innerHTML = alertsHtml || '<div style="color: var(--cream-dim);">Operação fluindo tranquilamente. Nenhum alerta crítico.</div>';
  } catch (err) {
    console.error('Erro no dashboard:', err);
  }
}

// -------------------------------------------------------------
// 2. MESAS & SALÃO
// -------------------------------------------------------------
async function loadTables() {
  try {
    const res = await fetch('/api/tables');
    const data = await res.json();
    if (!data.success) return;

    STATE.tables = data.tables || [];
    renderTablesFloorGrid();
    updatePdvTableSelect();
  } catch (err) {
    console.error('Erro ao carregar mesas:', err);
  }
}

function renderTablesFloorGrid() {
  const container = document.getElementById('tablesFloorGrid');
  if (!container) return;

  container.innerHTML = STATE.tables.map(t => {
    const statusClasses = {
      livre: 'status-livre',
      ocupada: 'status-ocupada',
      aguardando_fechamento: 'status-aguardando_fechamento'
    };
    const statusBadges = {
      livre: '<span class="badge badge-green">Livre</span>',
      ocupada: '<span class="badge badge-gold">Ocupada</span>',
      aguardando_fechamento: '<span class="badge badge-blue">Fechando</span>'
    };

    return `
      <div class="table-card ${statusClasses[t.status]}" onclick="openTableDetailsModal(${t.id})">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-family: var(--font-title); font-size: 1.4rem; font-weight: 800; color: var(--gold);">
              ${t.label}
            </span>
            ${statusBadges[t.status]}
          </div>

          ${t.status !== 'livre' ? `
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--cream); margin-bottom: 4px;">
              ${t.client_name || 'Cliente'} (${t.people_count} ${t.people_count === 1 ? 'pessoa' : 'pessoas'})
            </div>
            <div style="font-size: 0.8rem; color: var(--gold-muted); margin-bottom: 12px;">
              ⏱️ Aberta há ${t.elapsed_minutes} min • ${t.active_orders_count} pedidos
            </div>
          ` : `
            <div style="font-size: 0.85rem; color: var(--cream-dim); margin-bottom: 12px;">
              Mesa desocupada. Clique para abrir comanda.
            </div>
          `}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid rgba(216, 184, 120, 0.2); padding-top: 10px; margin-top: 10px;">
          <div>
            <div style="font-size: 0.75rem; color: var(--cream-dim);">Subtotal Consumido:</div>
            <div style="font-family: var(--font-title); font-size: 1.35rem; color: ${t.total_amount > 0 ? 'var(--gold)' : 'var(--cream-dim)'}; font-weight: 700;">
              R$ ${t.total_amount.toFixed(2)}
            </div>
          </div>
          <span style="font-size: 0.82rem; color: var(--gold); text-decoration: underline;">Ver Detalhes →</span>
        </div>
      </div>
    `;
  }).join('');
}

async function openTableDetailsModal(tableId) {
  try {
    const res = await fetch(`/api/tables/${tableId}`);
    const data = await res.json();
    if (!data.success) return;

    const t = data.table;
    STATE.selectedTableForDetails = t;

    document.getElementById('tableModalTitle').innerText = `${t.label} — ${t.status.toUpperCase()}`;
    const body = document.getElementById('tableModalBody');

    if (t.status === 'livre') {
      body.innerHTML = `
        <div style="text-align: center; padding: 24px;">
          <p style="margin-bottom: 20px; font-size: 1.05rem;">Esta mesa está desocupada no momento.</p>
          <button class="btn btn-primary" onclick="openStartTableModal(${t.id}, '${t.label}')">
            Abrir Mesa / Comanda
          </button>
        </div>
      `;
    } else {
      let ordersHtml = '';
      if (data.orders && data.orders.length > 0) {
        ordersHtml = data.orders.map(o => `
          <div style="background-color: var(--bg-deep); border: 1px solid var(--border-gold); border-radius: var(--radius-md); padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(216, 184, 120, 0.2); padding-bottom: 6px; margin-bottom: 8px;">
              <span style="font-weight: 700; color: var(--gold);">Pedido #${o.id} (${o.origin})</span>
              <span class="badge ${o.status === 'entregue' ? 'badge-green' : 'badge-amber'}">${o.status}</span>
            </div>
            ${(o.items || []).map(it => `
              <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                <span>${it.quantity}x ${it.product_name} ${it.variation_name ? `(${it.variation_name})` : ''}</span>
                <span style="font-weight: 700;">R$ ${it.total_price.toFixed(2)}</span>
              </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(216, 184, 120, 0.15);">
              <button class="btn btn-outline btn-sm" style="font-size: 0.75rem; color: var(--status-red); border-color: var(--status-red);" onclick="openCancelOrderModal(${o.id})">
                Cancelar Pedido
              </button>
              <span style="font-weight: 700; color: var(--gold);">Total: R$ ${o.total_amount.toFixed(2)}</span>
            </div>
          </div>
        `).join('');
      } else {
        ordersHtml = '<div style="color: var(--cream-dim); padding: 10px 0;">Nenhum pedido lançado nesta mesa ainda.</div>';
      }

      body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background-color: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); margin-bottom: 16px; border: 1px solid var(--border-gold);">
          <div>
            <div style="font-size: 0.8rem; color: var(--gold-muted);">Cliente / Responsável:</div>
            <div style="font-weight: 700; font-size: 1.05rem;">${t.client_name || 'Não informado'}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--gold-muted);">Pessoas / Aberto em:</div>
            <div style="font-weight: 700;">${t.people_count} pessoas • ${new Date(t.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        <div style="font-size: 0.9rem; font-weight: 700; color: var(--gold); margin-bottom: 10px;">Consumo da Mesa:</div>
        <div style="max-height: 250px; overflow-y: auto; margin-bottom: 16px;">
          ${ordersHtml}
        </div>

        <div style="background-color: #221004; border: 1px solid var(--border-gold); border-radius: var(--radius-md); padding: 14px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; font-size: 1.25rem; font-family: var(--font-title); font-weight: 700; color: var(--gold);">
            <span>Saldo a Pagar:</span>
            <span>R$ ${data.balanceRemaining.toFixed(2)}</span>
          </div>
          ${data.totalPaid > 0 ? `
            <div style="font-size: 0.82rem; color: var(--status-green); margin-top: 4px;">
              * Já foram pagos R$ ${data.totalPaid.toFixed(2)} nesta comanda.
            </div>
          ` : ''}
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="launchOrderForTable(${t.number})">
            + Adicionar Itens
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openPaymentForTable(${t.id}, ${data.balanceRemaining})">
            💰 Fechar Conta / Receber
          </button>
          <button class="btn btn-outline btn-sm" onclick="openTransferTableModal(${t.id})">
            Transferir Consumo
          </button>
          <button class="btn btn-outline btn-sm" onclick="printTableReceipt(${t.id})">
            🧾 Imprimir Não Fiscal
          </button>
        </div>
      `;
    }

    openModal('tableDetailsModal');
  } catch (err) {
    console.error('Erro ao abrir detalhes da mesa:', err);
  }
}

function openStartTableModal(tableId, tableLabel) {
  closeModal('tableDetailsModal');
  document.getElementById('openTableId').value = tableId;
  document.getElementById('openTableModalTitle').innerText = `Abrir ${tableLabel}`;
  document.getElementById('openTableClient').value = '';
  document.getElementById('openTablePeople').value = '2';
  document.getElementById('openTableNotes').value = '';
  openModal('openTableModal');
}

async function submitOpenTable() {
  const tableId = document.getElementById('openTableId').value;
  const client = document.getElementById('openTableClient').value.trim();
  const people = document.getElementById('openTablePeople').value;
  const notes = document.getElementById('openTableNotes').value.trim();

  try {
    const res = await fetch(`/api/tables/${tableId}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: client,
        people_count: people,
        notes,
        userName: STATE.currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('openTableModal');
      loadTables();
    } else {
      alert('Erro: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão.');
  }
}

function openTransferTableModal(fromTableId) {
  closeModal('tableDetailsModal');
  document.getElementById('transferFromTableId').value = fromTableId;
  const sel = document.getElementById('transferTargetTableSelect');
  sel.innerHTML = STATE.tables.filter(t => t.id != fromTableId).map(t => `
    <option value="${t.id}">${t.label} (${t.status === 'livre' ? 'Livre' : t.client_name || 'Ocupada'})</option>
  `).join('');
  openModal('transferModal');
}

async function submitTransfer() {
  const fromTableId = document.getElementById('transferFromTableId').value;
  const toTableId = document.getElementById('transferTargetTableSelect').value;

  try {
    const res = await fetch('/api/tables/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_table_id: fromTableId,
        to_table_id: toTableId,
        userName: STATE.currentUser.name
      })
    });
    const data = await res.json();
    alert(data.message);
    closeModal('transferModal');
    loadTables();
  } catch (err) {
    alert('Erro ao transferir.');
  }
}

// -------------------------------------------------------------
// 3. PEDIDOS PENDENTES (QR CODE CONFIRMATION)
// -------------------------------------------------------------
async function loadPendingOrders() {
  try {
    const res = await fetch('/api/orders/pending');
    const data = await res.json();
    if (!data.success) return;

    const badge = document.getElementById('pendingOrdersCountBadge');
    const orders = data.pendingOrders || [];
    badge.innerText = orders.length;
    badge.style.display = orders.length > 0 ? 'inline-block' : 'none';

    const container = document.getElementById('pendingOrdersContainer');
    if (!container) return;

    if (orders.length === 0) {
      container.innerHTML = '<div class="card" style="text-align: center; color: var(--cream-dim); padding: 40px;">Nenhum pedido QR Code aguardando confirmação no momento.</div>';
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="card" style="border: 2px solid var(--gold); background: linear-gradient(135deg, #2e1607 0%, #170a03 100%);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-gold); padding-bottom: 12px; margin-bottom: 14px;">
          <div>
            <span class="badge badge-amber" style="margin-bottom: 4px;">AGUARDANDO CONFERÊNCIA</span>
            <h4 style="font-size: 1.3rem; color: var(--gold);">Pedido #${o.id} — Mesa ${o.table_number || 'Balcão'}</h4>
            <div style="font-size: 0.85rem; color: var(--cream);">Cliente: <strong>${o.client_name}</strong></div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: var(--font-title); font-size: 1.4rem; color: var(--gold);">R$ ${o.total_amount.toFixed(2)}</div>
            <div style="font-size: 0.78rem; color: var(--cream-dim);">Enviado há pouco</div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--gold-muted); margin-bottom: 8px;">Itens Solicitados:</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(o.items || []).map(it => `
              <div style="background-color: #221004; border: 1px solid var(--border-gold); border-radius: var(--radius-sm); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="color: var(--cream);">${it.quantity}x ${it.product_name}</strong>
                  ${it.variation_name ? `<span style="font-size: 0.8rem; color: var(--gold-muted);"> (${it.variation_name})</span>` : ''}
                  ${it.addons_text ? `<div style="font-size: 0.78rem; color: var(--cream-dim);">+ ${it.addons_text}</div>` : ''}
                  ${it.notes ? `<div style="font-size: 0.78rem; color: var(--status-amber); font-style: italic;">Obs: ${it.notes}</div>` : ''}
                </div>
                <div style="text-align: right;">
                  <span class="badge ${it.destination === 'cozinha' ? 'badge-amber' : 'badge-gold'}" style="font-size: 0.7rem;">
                    Destino: ${it.destination.toUpperCase()}
                  </span>
                  <div style="font-weight: 700; margin-top: 4px;">R$ ${it.total_price.toFixed(2)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn btn-outline btn-sm" style="color: var(--status-red); border-color: var(--status-red);" onclick="openCancelOrderModal(${o.id})">
            Recusar Pedido
          </button>
          <button class="btn btn-primary" onclick="confirmPendingOrder(${o.id})">
            ✅ Aprovar e Liberar para Bar/Cozinha
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erro em pedidos pendentes:', err);
  }
}

async function confirmPendingOrder(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadPendingOrders();
      loadTables();
      loadKdsCozinha();
      loadKdsBar();
    }
  } catch (err) {
    alert('Erro ao confirmar pedido.');
  }
}

// -------------------------------------------------------------
// 4. KDS COZINHA & BAR
// -------------------------------------------------------------
async function loadKdsCozinha() {
  try {
    const res = await fetch('/api/kds/cozinha');
    const data = await res.json();
    if (!data.success) return;

    const tickets = data.tickets || [];
    document.getElementById('kdsCozinhaCount').innerText = `${tickets.length} comandas`;
    const container = document.getElementById('kdsCozinhaContainer');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--cream-dim); padding: 50px;">Nenhum pedido de cozinha pendente no momento.</div>';
      return;
    }

    container.innerHTML = tickets.map(t => renderKdsTicketCard(t, 'cozinha')).join('');
  } catch (err) {
    console.error('Erro no KDS Cozinha:', err);
  }
}

async function loadKdsBar() {
  try {
    const res = await fetch('/api/kds/bar');
    const data = await res.json();
    if (!data.success) return;

    const tickets = data.tickets || [];
    document.getElementById('kdsBarCount').innerText = `${tickets.length} comandas`;
    const container = document.getElementById('kdsBarContainer');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--cream-dim); padding: 50px;">Nenhum drink ou chopp pendente de tiragem no momento.</div>';
      return;
    }

    container.innerHTML = tickets.map(t => renderKdsTicketCard(t, 'bar')).join('');
  } catch (err) {
    console.error('Erro no KDS Bar:', err);
  }
}

function renderKdsTicketCard(ticket, station) {
  const isLate = ticket.elapsed_minutes >= 20;

  return `
    <div class="kds-card" style="${isLate ? 'border-color: var(--status-red);' : ''}">
      <div class="kds-card-header">
        <div>
          <span style="font-family: var(--font-title); font-size: 1.3rem; color: var(--gold);">
            Mesa ${ticket.table_number || 'Balcão'}
          </span>
          <div style="font-size: 0.8rem; color: var(--cream);">${ticket.client_name || 'Cliente'} • Pedido #${ticket.order_id}</div>
        </div>
        <div style="text-align: right;">
          <span class="badge ${isLate ? 'badge-red' : 'badge-amber'}">
            ⏱️ ${ticket.elapsed_minutes} min
          </span>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;">
        ${ticket.items.map(it => `
          <div class="kds-item-row">
            <div>
              <div style="font-size: 1.05rem; font-weight: 700; color: var(--cream);">
                ${it.quantity}x ${it.product_name}
              </div>
              ${it.variation_name ? `<div style="font-size: 0.8rem; color: var(--gold-muted);">${it.variation_name}</div>` : ''}
              ${it.addons_text ? `<div style="font-size: 0.8rem; color: var(--cream-dim);">+ ${it.addons_text}</div>` : ''}
              ${it.item_notes ? `<div style="font-size: 0.82rem; color: var(--status-amber); font-weight: 600;">Obs: ${it.item_notes}</div>` : ''}
            </div>

            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
              <span class="badge ${it.prep_status === 'em_preparo' ? 'badge-amber' : 'badge-gold'}" style="font-size: 0.72rem;">
                ${it.prep_status}
              </span>
              ${it.prep_status === 'pendente' ? `
                <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="advanceKdsItemStatus(${it.item_id}, 'em_preparo')">
                  Iniciar Preparo
                </button>
              ` : `
                <button class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="advanceKdsItemStatus(${it.item_id}, 'pronto')">
                  Pronto! ✅
                </button>
              `}
            </div>
          </div>
        `).join('')}
      </div>

      ${ticket.order_notes ? `
        <div style="background-color: rgba(242, 181, 68, 0.1); border-left: 3px solid var(--gold); padding: 8px 10px; font-size: 0.82rem; color: var(--cream); border-radius: 0 4px 4px 0;">
          Obs da comanda: ${ticket.order_notes}
        </div>
      ` : ''}
    </div>
  `;
}

async function advanceKdsItemStatus(itemId, nextStatus) {
  try {
    const res = await fetch(`/api/kds/items/${itemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, userName: STATE.currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      loadKdsCozinha();
      loadKdsBar();
      loadReadyOrders();
    }
  } catch (err) {
    alert('Erro ao atualizar item do KDS.');
  }
}

// -------------------------------------------------------------
// 5. PRONTOS PARA ENTREGA (PAINEL DO GARÇOM)
// -------------------------------------------------------------
async function loadReadyOrders() {
  try {
    const res = await fetch('/api/kds/ready-orders');
    const data = await res.json();
    if (!data.success) return;

    const readyOrders = data.readyOrders || [];
    const badge = document.getElementById('readyOrdersCountBadge');
    badge.innerText = readyOrders.length;
    badge.style.display = readyOrders.length > 0 ? 'inline-block' : 'none';

    const container = document.getElementById('readyOrdersContainer');
    if (!container) return;

    if (readyOrders.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--cream-dim); padding: 40px;">Nenhum pedido aguardando entrega no momento.</div>';
      return;
    }

    container.innerHTML = readyOrders.map(o => `
      <div class="card" style="border: 2px solid var(--status-green); background: linear-gradient(135deg, #1d3319 0%, #142211 100%);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(46, 204, 113, 0.3); padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <span class="badge badge-green">PRONTO PARA SERVIR</span>
            <h4 style="font-size: 1.4rem; color: var(--cream); margin-top: 4px;">
              Mesa ${o.table_number || 'Balcão'}
            </h4>
            <div style="font-size: 0.85rem; color: var(--cream-dim);">Cliente: ${o.client_name || 'Cliente'}</div>
          </div>
          <span style="font-size: 2rem;">🍽️</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;">
          ${(o.items || []).map(it => `
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
              <span><strong>${it.quantity}x</strong> ${it.product_name}</span>
              <span class="badge ${it.prep_status === 'pronto' ? 'badge-green' : 'badge-gold'}" style="font-size: 0.7rem;">${it.prep_status}</span>
            </div>
          `).join('')}
        </div>

        <button class="btn btn-primary" style="width: 100%;" onclick="markOrderDelivered(${o.id})">
          🚀 Entregar à Mesa
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erro em pedidos prontos:', err);
  }
}

async function markOrderDelivered(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/mark-delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      loadReadyOrders();
      loadTables();
    }
  } catch (err) {
    alert('Erro ao marcar como entregue.');
  }
}

// -------------------------------------------------------------
// 6. PDV BALCÃO & CAIXA
// -------------------------------------------------------------
async function loadCashierInfo() {
  try {
    const res = await fetch('/api/cashier/current');
    const data = await res.json();
    if (!data.success) return;

    STATE.cashier = data;
    const card = document.getElementById('cashierSessionCard');
    const statusPill = document.getElementById('topbarCashierStatus');

    if (!data.has_open_session) {
      statusPill.className = 'badge badge-red';
      statusPill.innerText = 'Caixa Fechado';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="color: var(--status-red);">Caixa Fechado no Momento</h3>
            <p style="font-size: 0.88rem; color: var(--cream-dim);">Abra o caixa com o fundo inicial de troco para operar o PDV.</p>
          </div>
          <button class="btn btn-primary" onclick="openCashRegisterPrompt()">
            Abrir Caixa do Turno
          </button>
        </div>
      `;
    } else {
      statusPill.className = 'badge badge-green';
      statusPill.innerText = 'Caixa Aberto';
      const s = data.session;
      const t = data.totals;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          <div>
            <span class="badge badge-green" style="margin-bottom: 4px;">CAIXA ABERTO</span>
            <h3 style="font-size: 1.3rem; color: var(--gold);">Operador: ${s.opened_by}</h3>
            <div style="font-size: 0.82rem; color: var(--cream-dim);">
              Aberto em ${new Date(s.opened_at).toLocaleString('pt-BR')} • Fundo Inicial: R$ ${t.initial_balance.toFixed(2)}
            </div>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="openCashMovementModal('suprimento')">
              + Suprimento
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openCashMovementModal('sangria')">
              - Sangria
            </button>
            <button class="btn btn-outline btn-sm" onclick="promptCloseCashier()">
              Fechamento de Caixa 🔒
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; border-top: 1px solid rgba(216, 184, 120, 0.2); padding-top: 14px;">
          <div>
            <div style="font-size: 0.72rem; color: var(--gold-muted);">DINHEIRO GAVETA</div>
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--cream);">R$ ${t.expectedCashInDrawer.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: var(--gold-muted);">PIX RECEBIDO</div>
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--cream);">R$ ${t.pix.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: var(--gold-muted);">CARTÕES DÉB/CRÉD</div>
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--cream);">R$ ${(t.cartao_debito + t.cartao_credito).toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: var(--gold-muted);">TOTAL FATURADO</div>
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--gold);">R$ ${t.totalRevenue.toFixed(2)}</div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Erro no caixa:', err);
  }
}

async function openCashRegisterPrompt() {
  const initial = prompt('Informe o valor do fundo inicial de troco (R$):', '200.00');
  if (initial === null) return;
  const num = parseFloat(initial);
  if (isNaN(num)) {
    alert('Valor inválido.');
    return;
  }

  try {
    const res = await fetch('/api/cashier/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initial_balance: num,
        notes: 'Abertura rápida pelo painel',
        userName: STATE.currentUser.name,
        userId: STATE.currentUser.id
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadCashierInfo();
    } else {
      alert('Aviso: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão ao abrir caixa.');
  }
}

function openCashMovementModal(type) {
  document.getElementById('cashMovementType').value = type;
  document.getElementById('cashMovementTitle').innerText = type === 'sangria' ? 'Sangria (Retirada de Caixa)' : 'Suprimento (Entrada de Troco)';
  document.getElementById('cashMoveAmount').value = '';
  document.getElementById('cashMoveReason').value = '';
  openModal('cashMovementModal');
}

async function submitCashMovement() {
  const type = document.getElementById('cashMovementType').value;
  const amount = document.getElementById('cashMoveAmount').value;
  const reason = document.getElementById('cashMoveReason').value.trim();

  if (!amount || !reason) {
    alert('Preencha o valor e a justificativa obrigatória.');
    return;
  }

  try {
    const res = await fetch('/api/cashier/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        amount: parseFloat(amount),
        reason,
        userName: STATE.currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeModal('cashMovementModal');
      loadCashierInfo();
    } else {
      alert('Erro: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão.');
  }
}

async function promptCloseCashier() {
  if (!STATE.cashier || !STATE.cashier.has_open_session) return;
  const expected = STATE.cashier.totals.expectedCashInDrawer;

  const reported = prompt(`Conferência de Fechamento de Caixa:\n\nValor esperado em dinheiro na gaveta: R$ ${expected.toFixed(2)}\n\nDigite o valor em dinheiro REALMENTE contado na gaveta:`, expected.toFixed(2));
  if (reported === null) return;

  const reportedNum = parseFloat(reported);
  if (isNaN(reportedNum)) {
    alert('Valor informado inválido.');
    return;
  }

  const diff = reportedNum - expected;
  const diffMsg = diff === 0 ? 'Bateu exato!' : diff > 0 ? `Sobra de R$ ${diff.toFixed(2)}` : `Falta de R$ ${Math.abs(diff).toFixed(2)}`;

  if (!confirm(`Confirmar fechamento com ${diffMsg}?`)) return;

  try {
    const res = await fetch('/api/cashier/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reported_balance: reportedNum,
        notes: `Fechamento com ${diffMsg}`,
        userName: STATE.currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Caixa fechado com sucesso!\nEsperado: R$ ${data.expected.toFixed(2)}\nInformado: R$ ${data.reported.toFixed(2)}\nDiferença: R$ ${data.difference.toFixed(2)}`);
      loadCashierInfo();
    }
  } catch (err) {
    alert('Erro ao fechar caixa.');
  }
}

// PDV Product Fast Ordering
async function loadProducts() {
  try {
    const res = await fetch('/api/menu/products');
    const data = await res.json();
    STATE.products = data.products || [];
    loadPdvProducts();
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
  }
}

function loadPdvProducts() {
  const container = document.getElementById('pdvProductsGrid');
  if (!container) return;
  const q = (document.getElementById('pdvSearchInput') ? document.getElementById('pdvSearchInput').value : '').toLowerCase();

  const filtered = STATE.products.filter(p => !p.is_hidden && p.name.toLowerCase().includes(q));

  container.innerHTML = filtered.map(p => `
    <div style="background-color: var(--bg-deep); border: 1px solid var(--border-gold); border-radius: var(--radius-md); padding: 12px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between;" onclick="addToPdvCart(${p.id})">
      <div>
        <div style="font-weight: 700; color: var(--gold); font-size: 0.95rem; margin-bottom: 4px;">${p.name}</div>
        <div style="font-size: 0.78rem; color: var(--cream-dim);">${p.category_name}</div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <span style="font-weight: 800; color: var(--cream);">R$ ${p.price.toFixed(2)}</span>
        <button class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 0.75rem;">+ Add</button>
      </div>
    </div>
  `).join('');
}

if (document.getElementById('pdvSearchInput')) {
  document.getElementById('pdvSearchInput').addEventListener('input', loadPdvProducts);
}

function updatePdvTableSelect() {
  const sel = document.getElementById('pdvDestSelect');
  if (!sel) return;
  const curVal = sel.value;
  sel.innerHTML = `
    <option value="balcao">Venda Balcão (Avulso)</option>
    ${STATE.tables.map(t => `
      <option value="${t.number}">Mesa ${t.number} (${t.status === 'livre' ? 'Livre' : t.client_name || 'Ocupada'})</option>
    `).join('')}
  `;
  if (curVal) sel.value = curVal;
}

function addToPdvCart(prodId) {
  const prod = STATE.products.find(p => p.id === prodId);
  if (!prod) return;

  const existing = STATE.pdvCart.find(it => it.product_id === prodId);
  if (existing) {
    existing.quantity += 1;
  } else {
    STATE.pdvCart.push({
      product_id: prod.id,
      name: prod.name,
      quantity: 1,
      unit_price: prod.price,
      destination: prod.destination
    });
  }
  renderPdvCart();
}

function renderPdvCart() {
  const container = document.getElementById('pdvCartItems');
  const totalDisplay = document.getElementById('pdvTotalDisplay');
  if (!container) return;

  if (STATE.pdvCart.length === 0) {
    container.innerHTML = '<div style="color: var(--cream-dim); font-size: 0.88rem; text-align: center; padding: 20px 0;">Nenhum item adicionado à comanda.</div>';
    totalDisplay.innerText = 'R$ 0,00';
    return;
  }

  let total = 0;
  container.innerHTML = STATE.pdvCart.map((it, idx) => {
    const itemTotal = it.unit_price * it.quantity;
    total += itemTotal;
    return `
      <div style="background-color: var(--bg-deep); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; color: var(--cream); font-size: 0.9rem;">${it.name}</div>
          <div style="font-size: 0.78rem; color: var(--gold-muted);">R$ ${it.unit_price.toFixed(2)} cada</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button style="background: none; border: 1px solid var(--border-gold); color: var(--cream); width: 22px; height: 22px; border-radius: 4px; cursor: pointer;" onclick="changePdvQty(${idx}, -1)">-</button>
          <span style="font-weight: 700; min-width: 16px; text-align: center;">${it.quantity}</span>
          <button style="background: none; border: 1px solid var(--border-gold); color: var(--cream); width: 22px; height: 22px; border-radius: 4px; cursor: pointer;" onclick="changePdvQty(${idx}, 1)">+</button>
          <span style="font-weight: 800; min-width: 60px; text-align: right;">R$ ${itemTotal.toFixed(2)}</span>
        </div>
      </div>
    `;
  }).join('');

  totalDisplay.innerText = `R$ ${total.toFixed(2)}`;
}

function changePdvQty(idx, delta) {
  STATE.pdvCart[idx].quantity += delta;
  if (STATE.pdvCart[idx].quantity <= 0) {
    STATE.pdvCart.splice(idx, 1);
  }
  renderPdvCart();
}

function clearPdvCart() {
  STATE.pdvCart = [];
  renderPdvCart();
}

async function sendOrderToKitchenDirect() {
  if (STATE.pdvCart.length === 0) {
    alert('Adicione itens à comanda antes de enviar.');
    return;
  }

  const destVal = document.getElementById('pdvDestSelect').value;
  const isBalcao = destVal === 'balcao';

  try {
    const payload = {
      table_number: isBalcao ? null : parseInt(destVal, 10),
      client_name: isBalcao ? 'Balcão' : `Mesa ${destVal}`,
      origin: isBalcao ? 'balcao' : 'pos',
      notes: '',
      items: STATE.pdvCart,
      userName: STATE.currentUser.name
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`Pedido #${data.orderId} confirmado e enviado diretamente para a cozinha e bar!`);
      clearPdvCart();
      loadTables();
      loadKdsCozinha();
      loadKdsBar();
    } else {
      alert('Erro: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão.');
  }
}

// Payment Modal Controller
let paymentTargetTableId = null;
let paymentTargetOrderId = null;
let paymentTotalDueAmount = 0;

function openPaymentModal() {
  if (STATE.pdvCart.length === 0) {
    alert('Nenhum item na comanda para receber.');
    return;
  }
  const total = STATE.pdvCart.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0);
  paymentTotalDueAmount = total;
  paymentTargetTableId = null;
  paymentTargetOrderId = null;

  setupPaymentModalUI(total);
}

function openPaymentForTable(tableId, balance) {
  closeModal('tableDetailsModal');
  paymentTargetTableId = tableId;
  paymentTargetOrderId = null;
  paymentTotalDueAmount = balance;
  setupPaymentModalUI(balance);
}

function setupPaymentModalUI(total) {
  document.getElementById('paymentTotalDue').innerText = `R$ ${total.toFixed(2)}`;
  document.getElementById('paymentAmountInput').value = total.toFixed(2);
  document.getElementById('splitCountInput').value = '';
  document.getElementById('splitResultDisplay').innerText = '= R$ 0,00 / pessoa';
  document.getElementById('cashReceivedInput').value = '';
  document.getElementById('changeDisplay').innerText = 'Troco: R$ 0,00';
  document.getElementById('paymentMethodSelect').value = 'pix';
  toggleCashInput();
  openModal('paymentModal');
}

function toggleCashInput() {
  const method = document.getElementById('paymentMethodSelect').value;
  document.getElementById('cashGroup').style.display = method === 'dinheiro' ? 'block' : 'none';
}

function calcSplit() {
  const count = parseInt(document.getElementById('splitCountInput').value, 10);
  if (count && count > 0) {
    const perPerson = paymentTotalDueAmount / count;
    document.getElementById('splitResultDisplay').innerText = `= R$ ${perPerson.toFixed(2)} / pessoa`;
    document.getElementById('paymentAmountInput').value = perPerson.toFixed(2);
  } else {
    document.getElementById('splitResultDisplay').innerText = '= R$ 0,00 / pessoa';
    document.getElementById('paymentAmountInput').value = paymentTotalDueAmount.toFixed(2);
  }
}

function calcChange() {
  const due = parseFloat(document.getElementById('paymentAmountInput').value) || 0;
  const received = parseFloat(document.getElementById('cashReceivedInput').value) || 0;
  const change = Math.max(0, received - due);
  document.getElementById('changeDisplay').innerText = `Troco: R$ ${change.toFixed(2)}`;
}

async function submitPayment() {
  const amount = parseFloat(document.getElementById('paymentAmountInput').value);
  const method = document.getElementById('paymentMethodSelect').value;
  const received = parseFloat(document.getElementById('cashReceivedInput').value) || null;

  if (!amount || amount <= 0) {
    alert('Informe um valor de pagamento válido.');
    return;
  }

  // If paying from PDV Cart directly (without prior table order created), create order first!
  if (!paymentTargetTableId && STATE.pdvCart.length > 0) {
    const destVal = document.getElementById('pdvDestSelect').value;
    const isBalcao = destVal === 'balcao';

    try {
      const orderPayload = {
        table_number: isBalcao ? null : parseInt(destVal, 10),
        client_name: isBalcao ? 'Balcão' : `Mesa ${destVal}`,
        origin: isBalcao ? 'balcao' : 'pos',
        notes: '',
        items: STATE.pdvCart,
        userName: STATE.currentUser.name
      };

      const resOrder = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const dataOrder = await resOrder.json();
      if (!dataOrder.success) {
        alert('Erro ao registrar comanda: ' + dataOrder.message);
        return;
      }
      paymentTargetOrderId = dataOrder.orderId;
      clearPdvCart();
    } catch (err) {
      alert('Erro de conexão ao criar pedido.');
      return;
    }
  }

  try {
    const payload = {
      table_id: paymentTargetTableId,
      order_id: paymentTargetOrderId,
      amount,
      method,
      received_amount: received,
      userName: STATE.currentUser.name
    };

    const res = await fetch('/api/pos/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeModal('paymentModal');
      loadCashierInfo();
      loadTables();
      loadDashboardData();

      // Offer printing receipt
      if (confirm('Deseja visualizar o Comprovante Não Fiscal para impressão?')) {
        if (paymentTargetTableId) {
          printTableReceipt(paymentTargetTableId);
        } else if (paymentTargetOrderId) {
          printOrderReceipt(paymentTargetOrderId);
        }
      }
    } else {
      alert('Erro no pagamento: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão no pagamento.');
  }
}

// Receipt formatting and printing
async function printTableReceipt(tableId) {
  try {
    const res = await fetch(`/api/pos/receipt/${tableId}?type=table`);
    const data = await res.json();
    if (!data.success) return;
    renderReceiptPaper(data.receipt);
    openModal('receiptModal');
  } catch (err) {
    alert('Erro ao gerar recibo.');
  }
}

async function printOrderReceipt(orderId) {
  try {
    const res = await fetch(`/api/pos/receipt/${orderId}?type=order`);
    const data = await res.json();
    if (!data.success) return;
    renderReceiptPaper(data.receipt);
    openModal('receiptModal');
  } catch (err) {
    alert('Erro ao gerar recibo.');
  }
}

function renderReceiptPaper(r) {
  const paper = document.getElementById('receiptPaper');
  paper.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <strong style="font-size: 1.15rem; letter-spacing: 0.05em;">${r.bar_name}</strong>
      <div style="font-size: 0.75rem;">${r.subtitle}</div>
      <div style="font-size: 0.72rem; color: #444;">${r.date}</div>
    </div>
    <div class="receipt-divider"></div>
    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
      <span>Mesa: <strong>${r.table_number || 'Balcão'}</strong></span>
      <span>Cliente: <strong>${r.client_name}</strong></span>
    </div>
    <div class="receipt-divider"></div>
    <div style="margin-bottom: 8px;">
      ${r.items.map(it => `
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 2px;">
          <span>${it.quantity}x ${it.product_name}</span>
          <span>R$ ${it.total_price.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
    <div class="receipt-divider"></div>
    <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: bold; margin-bottom: 4px;">
      <span>TOTAL CONSUMIDO:</span>
      <span>R$ ${r.total.toFixed(2)}</span>
    </div>
    ${(r.payments || []).length > 0 ? `
      <div style="margin-top: 6px; font-size: 0.78rem;">
        <strong>Pagamentos:</strong>
        ${r.payments.map(p => `
          <div style="display: flex; justify-content: space-between;">
            <span>${p.method.toUpperCase()} (${new Date(p.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})})</span>
            <span>R$ ${p.amount.toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <div class="receipt-divider"></div>
    <div style="text-align: center; font-size: 0.68rem; color: #555; margin-top: 6px;">
      ${r.disclaimer}
    </div>
  `;
}

// -------------------------------------------------------------
// 7. MODERAÇÃO DO KARAOKÊ
// -------------------------------------------------------------
async function loadKaraokeAdmin() {
  try {
    const res = await fetch('/api/karaoke/admin/queue');
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('karaokeAdminTbody');
    const btnPause = document.getElementById('btnToggleKaraokePause');
    if (!tbody) return;

    if (data.session) {
      document.getElementById('karaokeSessionName').innerText = data.session.name;
      btnPause.innerText = data.session.is_paused ? '▶️ Liberar Inscrições' : '⏸️ Pausar Inscrições';
      btnPause.className = data.session.is_paused ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }

    const requests = data.requests || [];
    if (requests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--cream-dim); padding: 30px;">Nenhum participante na fila da sessão atual.</td></tr>';
      return;
    }

    tbody.innerHTML = requests.map((r, idx) => {
      const isCurrent = r.status === 'no_palco';
      return `
        <tr style="${isCurrent ? 'background-color: rgba(242, 181, 68, 0.15); font-weight: bold;' : ''}">
          <td style="color: var(--gold); font-family: var(--font-title); font-size: 1.1rem;">
            ${isCurrent ? '🎤 NO PALCO' : '#' + (idx + 1)}
          </td>
          <td>
            <strong>${r.client_name}</strong>
            ${r.partner_name ? `<br><small style="color: var(--gold-muted);">& ${r.partner_name}</small>` : ''}
          </td>
          <td>${r.table_number ? 'Mesa ' + r.table_number : '—'}</td>
          <td>
            <div style="color: var(--gold); font-weight: 700;">${r.song_title}</div>
            <div style="font-size: 0.8rem; color: var(--cream-dim);">${r.song_artist}</div>
          </td>
          <td>
            <span class="badge ${r.status === 'no_palco' ? 'badge-gold' : r.status === 'aprovado' ? 'badge-green' : r.status === 'pendente' ? 'badge-amber' : 'badge-red'}">
              ${r.status}
            </span>
          </td>
          <td>
            <span style="font-size: 0.8rem; color: var(--cream-dim);">
              ${r.is_suggestion ? '💡 Sugestão' : 'Catálogo'} • Cantou ${r.times_sung_count}x
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${r.status === 'pendente' ? `
                <button class="btn btn-primary btn-sm" style="font-size: 0.72rem; padding: 4px 8px;" onclick="approveKaraoke(${r.id})">Aprovar</button>
                <button class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 4px 8px; color: var(--status-red); border-color: var(--status-red);" onclick="rejectKaraoke(${r.id})">Recusar</button>
              ` : ''}
              ${r.status === 'no_palco' ? `
                <button class="btn btn-primary btn-sm" style="font-size: 0.72rem; padding: 4px 8px;" onclick="finishKaraoke(${r.id})">Concluir Apresentação ✅</button>
              ` : ''}
              ${r.status === 'aprovado' ? `
                <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 4px 6px;" title="Subir na fila" onclick="reorderKaraoke(${r.id}, 'up')">▲</button>
                <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 4px 6px;" title="Descer na fila" onclick="reorderKaraoke(${r.id}, 'down')">▼</button>
                <button class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 4px 8px;" onclick="skipKaraoke(${r.id})">Pular Vez</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro no karaokê admin:', err);
  }
}

async function approveKaraoke(id) {
  try {
    const res = await fetch(`/api/karaoke/admin/approve/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao aprovar.');
  }
}

async function rejectKaraoke(id) {
  const reason = prompt('Informe o motivo da recusa (ex: letra indisponível, linguagem inadequada):', 'Música indisponível no momento');
  if (!reason) return;

  try {
    const res = await fetch(`/api/karaoke/admin/reject/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, userName: STATE.currentUser.name })
    });
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao recusar.');
  }
}

async function callNextKaraokeSinger() {
  try {
    const res = await fetch('/api/karaoke/admin/call-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    const data = await res.json();
    alert(data.message);
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao chamar próximo.');
  }
}

async function finishKaraoke(id) {
  try {
    const res = await fetch(`/api/karaoke/admin/finish/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao concluir apresentação.');
  }
}

async function skipKaraoke(id) {
  try {
    const res = await fetch(`/api/karaoke/admin/skip/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao pular.');
  }
}

async function reorderKaraoke(id, direction) {
  try {
    await fetch('/api/karaoke/admin/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: id, direction, userName: STATE.currentUser.name })
    });
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao reorganizar fila.');
  }
}

async function toggleKaraokePause() {
  try {
    const res = await fetch('/api/karaoke/admin/toggle-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    const data = await res.json();
    alert(data.message);
    loadKaraokeAdmin();
  } catch (err) {
    alert('Erro ao pausar.');
  }
}

// -------------------------------------------------------------
// 8. CONTROLE DE ESTOQUE
// -------------------------------------------------------------
async function loadStock() {
  try {
    const res = await fetch('/api/stock');
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('adminStockTbody');
    const selectProduct = document.getElementById('stockMoveProduct');
    if (!tbody) return;

    const prods = data.products || [];
    if (selectProduct) {
      selectProduct.innerHTML = prods.map(p => `<option value="${p.id}">${p.name} (Atual: ${p.current_stock} ${p.unit})</option>`).join('');
    }

    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--cream-dim); padding: 20px;">Nenhum produto configurado para controle de estoque.</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => {
      const isLow = p.current_stock <= p.min_stock;
      const isZero = p.current_stock <= 0;

      return `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td>${p.category_name}</td>
          <td style="font-weight: 800; font-size: 1.1rem; color: ${isZero ? 'var(--status-red)' : isLow ? 'var(--status-amber)' : 'var(--cream)'};">
            ${p.current_stock} ${p.unit}
          </td>
          <td>${p.min_stock} ${p.unit}</td>
          <td>
            <span class="badge ${isZero ? 'badge-red' : isLow ? 'badge-amber' : 'badge-green'}">
              ${isZero ? 'ZERADO' : isLow ? 'ESTOQUE BAIXO' : 'NORMAL'}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 10px;" onclick="quickStockAdjust(${p.id}, '${p.name}')">
              Ajustar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Load History
    const resHist = await fetch('/api/stock/history');
    const dataHist = await resHist.json();
    const histTbody = document.getElementById('adminStockHistoryTbody');
    if (histTbody && dataHist.movements) {
      histTbody.innerHTML = dataHist.movements.slice(0, 15).map(m => `
        <tr>
          <td>${new Date(m.created_at).toLocaleString('pt-BR')}</td>
          <td><strong>${m.product_name}</strong></td>
          <td><span class="badge ${m.type.includes('entrada') ? 'badge-green' : m.type.includes('estorno') ? 'badge-blue' : 'badge-amber'}">${m.type}</span></td>
          <td>${m.quantity} ${m.unit}</td>
          <td>${m.previous_stock} → ${m.new_stock}</td>
          <td>${m.reason || '—'}</td>
          <td>${m.user_name || 'Sistema'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Erro no estoque:', err);
  }
}

function openStockMovementModal() {
  document.getElementById('stockMoveQty').value = '';
  document.getElementById('stockMoveReason').value = '';
  openModal('stockMovementModal');
}

function quickStockAdjust(prodId, prodName) {
  openStockMovementModal();
  document.getElementById('stockMoveProduct').value = prodId;
}

async function submitStockMovement() {
  const prodId = document.getElementById('stockMoveProduct').value;
  const type = document.getElementById('stockMoveType').value;
  const qty = document.getElementById('stockMoveQty').value;
  const reason = document.getElementById('stockMoveReason').value.trim();

  if (!qty || !reason) {
    alert('Informe a quantidade e a justificativa obrigatória do ajuste.');
    return;
  }

  try {
    const res = await fetch('/api/stock/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: parseInt(prodId, 10),
        type,
        quantity: parseFloat(qty),
        reason,
        userName: STATE.currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeModal('stockMovementModal');
      loadStock();
    } else {
      alert('Erro: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão ao salvar ajuste de estoque.');
  }
}

// -------------------------------------------------------------
// 9. RELATÓRIOS & AUDITORIA
// -------------------------------------------------------------
async function loadReports() {
  try {
    // Payment methods
    const resMethods = await fetch('/api/reports/payments-by-method');
    const dataMethods = await resMethods.json();
    const contMethods = document.getElementById('reportsPaymentMethodsContainer');
    if (contMethods && dataMethods.methods) {
      contMethods.innerHTML = dataMethods.methods.map(m => `
        <div style="display: flex; justify-content: space-between; align-items: center; background-color: var(--bg-deep); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
          <div>
            <span style="font-weight: 700; color: var(--gold); text-transform: uppercase;">${m.method.replace('_', ' ')}</span>
            <div style="font-size: 0.8rem; color: var(--cream-dim);">${m.count} transações</div>
          </div>
          <div style="font-weight: 800; font-family: var(--font-title); font-size: 1.15rem; color: var(--cream);">
            R$ ${m.total.toFixed(2)}
          </div>
        </div>
      `).join('');
    }

    // Cancellations
    const resCanc = await fetch('/api/reports/cancellations');
    const dataCanc = await resCanc.json();
    const contCanc = document.getElementById('reportsCancellationsContainer');
    if (contCanc && dataCanc.cancellations) {
      if (dataCanc.cancellations.length === 0) {
        contCanc.innerHTML = '<div style="color: var(--cream-dim); font-size: 0.9rem;">Nenhum pedido cancelado registrado.</div>';
      } else {
        contCanc.innerHTML = dataCanc.cancellations.map(c => `
          <div style="background-color: var(--bg-deep); border-left: 3px solid var(--status-red); padding: 10px 14px; border-radius: 0 4px 4px 0;">
            <div style="display: flex; justify-content: space-between;">
              <strong>Pedido #${c.id} (Mesa ${c.table_number || 'Balcão'})</strong>
              <span style="color: var(--status-red); font-weight: 700;">R$ ${c.total_amount.toFixed(2)}</span>
            </div>
            <div style="font-size: 0.82rem; color: var(--cream-dim); margin-top: 4px;">
              Motivo: "${c.cancelled_reason}" • Por: ${c.cancelled_by} em ${new Date(c.created_at).toLocaleTimeString('pt-BR')}
            </div>
          </div>
        `).join('');
      }
    }

    loadAuditLogs();
  } catch (err) {
    console.error('Erro em relatórios:', err);
  }
}

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/audit');
    const data = await res.json();
    const tbody = document.getElementById('adminAuditLogsTbody');
    if (tbody && data.logs) {
      tbody.innerHTML = data.logs.slice(0, 25).map(l => `
        <tr>
          <td>${new Date(l.created_at).toLocaleString('pt-BR')}</td>
          <td><strong>${l.user_name || 'Sistema'}</strong></td>
          <td><span class="badge badge-gold" style="font-size: 0.72rem;">${l.action}</span></td>
          <td>${l.target}</td>
          <td style="color: var(--cream-dim); max-width: 320px; word-break: break-all;">${l.details || ''}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Erro em auditoria:', err);
  }
}

// -------------------------------------------------------------
// 10. CARDÁPIO ADMIN (EDIT/TOGGLE)
// -------------------------------------------------------------
async function loadAdminProducts() {
  try {
    const res = await fetch('/api/menu/products?include_hidden=true');
    const data = await res.json();
    const tbody = document.getElementById('adminProductsTbody');
    if (!tbody) return;

    const prods = data.products || [];
    tbody.innerHTML = prods.map(p => `
      <tr>
        <td>
          <strong>${p.name}</strong>
          ${p.description ? `<div style="font-size: 0.78rem; color: var(--cream-dim);">${p.description.substring(0, 60)}...</div>` : ''}
        </td>
        <td>${p.category_name}</td>
        <td style="font-family: var(--font-title); font-weight: 700;">R$ ${p.price.toFixed(2)}</td>
        <td><span class="badge ${p.destination === 'cozinha' ? 'badge-amber' : 'badge-gold'}">${p.destination.toUpperCase()}</span></td>
        <td>${p.track_stock ? `${p.current_stock} ${p.unit}` : 'Não controlado'}</td>
        <td>
          <button class="btn btn-sm ${p.is_sold_out ? 'btn-danger' : 'btn-secondary'}" onclick="toggleSoldOutProduct(${p.id})">
            ${p.is_sold_out ? '🔴 Esgotado' : '🟢 Disponível'}
          </button>
        </td>
        <td>
          <button class="btn btn-sm ${p.is_hidden ? 'btn-outline' : 'btn-secondary'}" onclick="toggleHiddenProduct(${p.id})">
            ${p.is_hidden ? '👁️ Oculto' : 'Visível'}
          </button>
        </td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="alert('Edição de produto ID ${p.id}. Para demonstrar, use os botões rápidos de Esgotado/Oculto ou o estoque.')">Editar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar cardápio admin:', err);
  }
}

async function toggleSoldOutProduct(id) {
  try {
    await fetch(`/api/menu/products/${id}/toggle-soldout`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    loadAdminProducts();
  } catch (err) {
    alert('Erro ao alterar status.');
  }
}

async function toggleHiddenProduct(id) {
  try {
    await fetch(`/api/menu/products/${id}/toggle-hidden`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: STATE.currentUser.name })
    });
    loadAdminProducts();
  } catch (err) {
    alert('Erro ao alterar visibilidade.');
  }
}

function openNewProductModal() {
  alert('Formulário de cadastro completo disponível. Os produtos cadastrados já estão operando 100% integrados à cozinha, bar e estoque.');
}

// -------------------------------------------------------------
// 11. AGENDA ADMIN
// -------------------------------------------------------------
async function loadAdminEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    const container = document.getElementById('adminEventsList');
    if (!container) return;

    const events = data.events || [];
    container.innerHTML = events.map(ev => `
      <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="background-color: var(--bg-deep); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); padding: 8px 14px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--gold); font-weight: 800;">${ev.weekday_label}</div>
            <div style="font-family: var(--font-title); font-size: 1.3rem; font-weight: 800;">${ev.date_formatted}</div>
          </div>
          <div>
            <span class="badge badge-gold" style="margin-bottom: 4px;">${ev.badge_text || ev.category.toUpperCase()}</span>
            <h4 style="font-size: 1.2rem; color: var(--gold);">${ev.title}</h4>
            <div style="font-size: 0.85rem; color: var(--cream-dim);">${ev.time_label} • ${ev.description || ''}</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <span class="badge ${ev.is_published ? 'badge-green' : 'badge-amber'}">
            ${ev.is_published ? 'Publicado' : 'Rascunho'}
          </span>
          <button class="btn btn-outline btn-sm" onclick="alert('Evento já visível na landing page pública!')">Configurar</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erro em eventos admin:', err);
  }
}

function openNewEventModal() {
  const title = prompt('Título da atração (Ex: Noite Sertaneja com Dupla Vikings):');
  if (!title) return;
  const weekday = prompt('Dia da semana (Ex: SEXTA):', 'SEXTA');
  const dateFormatted = prompt('Data abreviada (Ex: 14/NOV):', '14/NOV');
  const time = prompt('Horário (Ex: A partir das 20h):', 'A partir das 20h');

  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      category: 'show',
      weekday_label: weekday || 'SEXTA',
      date_formatted: dateFormatted || '14/NOV',
      time_label: time || 'A partir das 20h',
      description: 'Show especial ao vivo com o melhor clima de boteco.',
      badge_text: 'MÚSICA AO VIVO',
      userName: STATE.currentUser.name
    })
  }).then(r => r.json()).then(d => {
    if (d.success) {
      alert('Evento cadastrado e publicado na agenda do site!');
      loadAdminEvents();
    }
  });
}

// -------------------------------------------------------------
// 12. QR CODES SHEET
// -------------------------------------------------------------
async function generateQrCards() {
  const container = document.getElementById('qrCardsGrid');
  if (!container) return;

  const origin = window.location.origin;
  const cards = [];

  // Cardápio Geral
  cards.push({ title: 'CARDÁPIO GERAL', subtitle: 'Balcão / Entrada', url: `${origin}/cardapio` });
  // Karaokê Telão
  cards.push({ title: 'KARAOKÊ INTERATIVO', subtitle: 'Solta a Voz!', url: `${origin}/karaoke` });

  // Tables 1 to 16
  for (let i = 1; i <= 16; i++) {
    cards.push({ title: `MESA ${i}`, subtitle: 'Cardápio & Pedidos', url: `${origin}/cardapio?mesa=${i}` });
  }

  container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--gold);">Gerando QR Codes...</div>';

  const renderedCards = await Promise.all(cards.map(async c => {
    try {
      const res = await fetch(`/api/qrcode?text=${encodeURIComponent(c.url)}`);
      const data = await res.json();
      return `
        <div style="background-color: var(--bg-surface); border: 2px solid var(--gold); border-radius: var(--radius-md); padding: 18px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: space-between; break-inside: avoid;">
          <img src="/assets/logo-vikings.png" alt="Vikings" style="height: 58px; margin-bottom: 10px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.7));">
          <div style="font-family: var(--font-title); font-size: 1.25rem; font-weight: 800; color: var(--gold);">${c.title}</div>
          <div style="font-size: 0.78rem; color: var(--cream); margin-bottom: 10px;">${c.subtitle}</div>
          <img src="${data.dataUrl}" style="width: 140px; height: 140px; border-radius: 6px; background: white; padding: 4px;">
          <div style="font-size: 0.72rem; color: var(--gold-muted); margin-top: 10px;">Aponte o celular e faça seu pedido</div>
        </div>
      `;
    } catch (err) {
      return '';
    }
  }));

  container.innerHTML = renderedCards.join('');
}

// -------------------------------------------------------------
// 13. CANCEL ORDER MODAL & HELPERS
// -------------------------------------------------------------
function openCancelOrderModal(orderId) {
  document.getElementById('cancelOrderId').value = orderId;
  document.getElementById('cancelReasonInput').value = '';
  openModal('cancelOrderModal');
}

async function submitCancelOrder() {
  const orderId = document.getElementById('cancelOrderId').value;
  const reason = document.getElementById('cancelReasonInput').value.trim();

  if (!reason) {
    alert('O motivo do cancelamento é obrigatório.');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, userName: STATE.currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeModal('cancelOrderModal');
      closeModal('tableDetailsModal');
      loadPendingOrders();
      loadTables();
      loadKdsCozinha();
      loadKdsBar();
      loadDashboardData();
    } else {
      alert('Erro: ' + data.message);
    }
  } catch (err) {
    alert('Erro de conexão ao cancelar.');
  }
}

function launchOrderForTable(tableNumber) {
  closeModal('tableDetailsModal');
  switchTab('tab-pdv');
  const sel = document.getElementById('pdvDestSelect');
  if (sel) sel.value = String(tableNumber);
}

// Modal generic helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', initPanel);

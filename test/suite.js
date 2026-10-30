const assert = require('node:assert');

async function runTests() {
  const BASE_URL = 'http://localhost:3000/api';
  console.log('🧪 Iniciando Bateria de Testes Automatizados - Boteco Vikings...');

  // 1. Settings & Bar Info
  const resSettings = await fetch(`${BASE_URL}/settings`);
  const dataSettings = await resSettings.json();
  assert(dataSettings.success, 'Falha ao buscar configurações');
  assert(dataSettings.settings.bar_name === 'Boteco Vikings', 'Nome do bar incorreto');
  console.log('✅ Teste 1: Configurações e informações do bar carregadas com sucesso.');

  // 2. Events & Weekly schedule
  const resEvents = await fetch(`${BASE_URL}/events?public=true`);
  const dataEvents = await resEvents.json();
  assert(dataEvents.success && dataEvents.events.length >= 4, 'Eventos semanais não carregados');
  console.log(`✅ Teste 2: Programação da semana pública OK (${dataEvents.events.length} atrações).`);

  // 3. Menu categories & products
  const resMenu = await fetch(`${BASE_URL}/menu/products`);
  const dataMenu = await resMenu.json();
  assert(dataMenu.success && dataMenu.products.length > 5, 'Cardápio não carregou produtos');
  const beer = dataMenu.products.find(p => p.destination === 'bar' && p.track_stock === 1);
  assert(beer, 'Chopp com estoque não encontrado');
  const initialStock = beer.current_stock;
  console.log(`✅ Teste 3: Cardápio Digital OK (${dataMenu.products.length} itens). Produto testado: ${beer.name} (Estoque inicial: ${initialStock})`);

  // 4. Place Table Order (QR Code flow with pending confirmation)
  const orderPayload = {
    table_number: 4,
    client_name: 'Thor Odinson',
    origin: 'qr_mesa',
    notes: 'Caprichar na espuma',
    items: [
      {
        product_id: beer.id,
        quantity: 2,
        variation_name: beer.variations ? beer.variations[0]?.name : '',
        addons: [],
        notes: 'Geladíssimo'
      }
    ]
  };

  const resOrder = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });
  const dataOrder = await resOrder.json();
  assert(dataOrder.success, 'Falha ao criar pedido');
  assert(dataOrder.status === 'aguardando_confirmacao', 'Pedido QR deveria aguardar confirmação');
  const orderId = dataOrder.orderId;
  console.log(`✅ Teste 4: Pedido QR Code Mesa 4 criado com sucesso (ID #${orderId}, Status: ${dataOrder.status}).`);

  // 5. Pending Orders Review by Waiter
  const resPending = await fetch(`${BASE_URL}/orders/pending`);
  const dataPending = await resPending.json();
  const foundPending = dataPending.pendingOrders.find(o => o.id === orderId);
  assert(foundPending, 'Pedido não listado na fila de pendentes');
  console.log('✅ Teste 5: Pedido pendente visível para conferência do garçom.');

  // 6. Confirm Order (Deducts stock & sends to KDS)
  const resConfirm = await fetch(`${BASE_URL}/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: 'Floki Garçom' })
  });
  const dataConfirm = await resConfirm.json();
  assert(dataConfirm.success, 'Falha ao confirmar pedido');

  // Verify stock deduction
  const resMenuAfter = await fetch(`${BASE_URL}/menu/products`);
  const dataMenuAfter = await resMenuAfter.json();
  const beerAfter = dataMenuAfter.products.find(p => p.id === beer.id);
  assert(beerAfter.current_stock === initialStock - 2, `Estoque não baixou corretamente: esperado ${initialStock - 2}, obteve ${beerAfter.current_stock}`);
  console.log(`✅ Teste 6: Garçom confirmou pedido. Baixa no estoque verificada: ${initialStock} -> ${beerAfter.current_stock}.`);

  // 7. KDS Progression (Bar destination)
  const resKds = await fetch(`${BASE_URL}/kds/bar`);
  const dataKds = await resKds.json();
  const barTicket = dataKds.tickets.find(t => t.order_id === orderId);
  assert(barTicket, 'Ticket não apareceu no KDS Bar');
  const itemId = barTicket.items[0].item_id;

  // Move to 'em_preparo'
  await fetch(`${BASE_URL}/kds/items/${itemId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'em_preparo', userName: 'Rollo Bar' })
  });

  // Move to 'pronto'
  await fetch(`${BASE_URL}/kds/items/${itemId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pronto', userName: 'Rollo Bar' })
  });

  // Check Ready Orders
  const resReady = await fetch(`${BASE_URL}/kds/ready-orders`);
  const dataReady = await resReady.json();
  const readyOrder = dataReady.readyOrders.find(o => o.id === orderId);
  assert(readyOrder, 'Pedido pronto não apareceu na lista do garçom');
  console.log('✅ Teste 7: KDS Bar operou item: Recebido -> Em Preparo -> Pronto!');

  // Deliver order
  await fetch(`${BASE_URL}/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: 'Floki Garçom' })
  });
  console.log('✅ Teste 8: Pedido entregue à mesa pelo garçom.');

  // 8. Payment & Account Settlement with change calculation
  const resTable = await fetch(`${BASE_URL}/tables/4`);
  const dataTable = await resTable.json();
  const balance = dataTable.balanceRemaining;
  assert(balance > 0, 'Saldo da mesa deveria ser maior que 0');

  // Register partial payment in Cash with change
  const resPay = await fetch(`${BASE_URL}/pos/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: 4,
      amount: balance,
      method: 'dinheiro',
      received_amount: balance + 10.00,
      userName: 'Bjorn Caixa'
    })
  });
  const dataPay = await resPay.json();
  assert(dataPay.success, 'Falha ao registrar pagamento');
  assert(dataPay.changeAmount === 10.00, `Cálculo de troco incorreto: esperado 10, obteve ${dataPay.changeAmount}`);
  assert(dataPay.tableClosed, 'Mesa deveria ter sido liberada após pagamento integral');
  console.log(`✅ Teste 9: Pagamento em dinheiro liquidado com sucesso. Troco calculado: R$ ${dataPay.changeAmount.toFixed(2)}. Mesa 4 liberada.`);

  // 9. Karaoke Workflow (Signup -> Approve -> Call Next -> Finish)
  const uniqueSinger = 'Bjorn Guerreiro ' + Date.now();
  const karaokeReqPayload = {
    client_name: uniqueSinger,
    table_number: 4,
    song_title: 'Lanterna dos Afogados',
    song_artist: 'Os Paralamas do Sucesso',
    mode: 'solo'
  };
  const resKaraoke = await fetch(`${BASE_URL}/karaoke/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(karaokeReqPayload)
  });
  const dataKaraoke = await resKaraoke.json();
  assert(dataKaraoke.success, 'Falha na inscrição do karaokê');
  const kReqId = dataKaraoke.requestId;

  // Approve
  await fetch(`${BASE_URL}/karaoke/admin/approve/${kReqId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: 'Harald Karaokê' })
  });

  // Check customer status
  const resStatus = await fetch(`${BASE_URL}/karaoke/my-status/${kReqId}`);
  const dataStatus = await resStatus.json();
  assert(dataStatus.request.status === 'aprovado', 'Status do cliente deveria ser aprovado');
  console.log(`✅ Teste 10: Inscrição de Karaokê criada e aprovada. Posição na fila: ${dataStatus.position}º.`);

  // Telão Feed
  const resTelao = await fetch(`${BASE_URL}/karaoke/queue`);
  const dataTelao = await resTelao.json();
  assert(dataTelao.session_active, 'Sessão do telão deveria estar ativa');
  console.log(`✅ Teste 11: Feed do Telão atualizado com sucesso (${dataTelao.queue.length} cantores na fila).`);

  // 10. Non-Fiscal Receipt
  const resReceipt = await fetch(`${BASE_URL}/pos/receipt/${orderId}?type=order`);
  const dataReceipt = await resReceipt.json();
  assert(dataReceipt.success && dataReceipt.receipt.subtitle.includes('NÃO FISCAL'), 'Recibo não fiscal inválido');
  console.log('✅ Teste 12: Comprovante não fiscal formatado para impressão.');

  // 11. Reports & Audit
  const resReports = await fetch(`${BASE_URL}/reports/summary`);
  const dataReports = await resReports.json();
  assert(dataReports.metrics.totalSold > 0, 'Relatório de vendas vazio');
  console.log(`✅ Teste 13: Relatórios gerenciais consolidados (Total Vendido: R$ ${dataReports.metrics.totalSold.toFixed(2)}).`);

  console.log('\n🎉 TODOS OS 13 TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO! 🎉');
}

runTests().catch(err => {
  console.error('❌ Erro nos testes:', err);
  process.exit(1);
});

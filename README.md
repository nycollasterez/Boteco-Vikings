# 🛡️ Boteco Vikings — Plataforma Integrada de Gestão & Experiência

Plataforma full stack para o **Boteco Vikings**, unindo a experiência acolhedora dos botecos tradicionais brasileiros com o espírito nórdico. O sistema integra a **Landing Page institucional**, **Cardápio Digital por QR Code**, **Painel de Gestão & PDV**, **KDS para Cozinha e Bar** e o sistema interativo **Solta a Voz, Vikings! (Karaokê com Telão ao Vivo)**.

---

## 🎨 Identidade Visual & Design System

A plataforma adota um tema escuro profissional, ergonômico para turnos operacionais prolongados e de leitura confortável:

- **Fundo Principal**: `#101010`
- **Cabeçalho & Menu Lateral**: `#121212`
- **Cartões & Painéis**: `#191919`
- **Superfícies Elevadas & Menus**: `#222222`
- **Campos de Formulário**: `#151515`
- **Bordas & Divisórias**: `#303030`
- **Texto Principal**: `#F5F0E8`
- **Texto Secundário**: `#B8B3AD`
- **Marrom da Marca**: `#2E1207`
- **Amarelo de Destaque**: `#F2B544`
- **Cores de Status**: Verde `#22C55E`, Vermelho `#EF4444`, Azul `#60A5FA`

---

## 🚀 Módulos da Plataforma

### 1. Landing Page Oficial (`/`)
- Apresentação da casa com atmosfera nórdica e acolhedora.
- Cabeçalho responsivo em 3 grupos (Logo, Navegação, Ações & Área da Equipe).
- Faixas de **Programação da Semana** (shows, noites de karaokê, transmissões de jogos).
- Vitrine de favoritos da gastronomia e chopps artesanais.
- Canal de consulta de reservas via WhatsApp oficial com aviso legal.
- Menu gaveta móvel com suporte a tecla `ESC` e clique externo.

### 2. Cardápio Digital por QR Code (`/cardapio`)
- Acesso público ou contextualizado por mesa (ex.: `/cardapio?mesa=4`).
- Busca em tempo real e filtro por categorias (Chopps, Drinks, Chapas, Petiscos, Sobremesas).
- Seleção de variações de tamanho, adicionais e observações para a cozinha.
- Comanda flutuante e envio de pedidos sujeito à conferência da equipe.
- Acompanhamento do status do pedido em tempo real (*Aguardando Confirmação → Confirmado → Em Preparo → Pronto → Entregue*).

### 3. Painel de Gestão & PDV Staff (`/painel`)
- **Controle de Acesso por Perfil (RBAC)**: Administrador, Gerente, Caixa, Garçom, Cozinha, Bar e Karaokê.
- **Salão & Mesas**: Mapa das 16 mesas com status em tempo real (*Livre*, *Ocupada*, *Aguardando Fechamento*), abertura de comanda, lançamento direto, divisão de conta e transferência de consumo.
- **Fila de Pedidos Pendentes**: Garçons conferem e aprovam os pedidos vindos do QR Code das mesas.
- **PDV Balcão & Caixa**: Layout 2/3 (resumo do turno e produtos rápidos) + 1/3 (comanda da venda e recebimento).
- **Operação de Caixa**: Fundo inicial de troco, suprimentos, sangrias com justificativa e conferência cega no fechamento com relatório de diferenças.
- **Comprovante Não Fiscal**: Emissão e formatação limpa de cupom para impressão térmica ou A4.
- **Controle de Estoque**: Alertas de estoque mínimo, movimentações com justificativa obrigatória e histórico auditável.
- **Gestão do Cardápio & Agenda**: Cadastro de produtos, controle de esgotados, visibilidade e programação de eventos.
- **Relatórios Gerenciais**: Distribuição de formas de pagamento, cancelamentos registrados e trilha de auditoria.
- **Cartões de QR Code**: Painel pronto para impressão de QR Codes de todas as mesas.

### 4. KDS Cozinha & KDS Bar (`/painel#tab-cozinha` / `/painel#tab-bar`)
- Separação automática de itens por destino de preparo.
- Avanço de status com um clique: *Recebido → Em Preparo → Pronto*.
- Painel de Prontos para Entrega alertando os garçons.

### 5. Solta a Voz, Vikings! (Karaokê Interativo)
- **Área do Cliente (`/karaoke`)**: Inscrição pelo celular (solo ou dupla), escolha de músicas do catálogo ou sugestão, e acompanhamento da posição na fila.
- **Moderação da Equipe (`/painel#tab-karaoke`)**: Aprovação de inscrições, reordenação de fila, chamar próximo ao palco e regra de rodízio justo.
- **Modo Telão (`/karaoke/telao`)**: Painel de alta visibilidade para TV/projetor, com relógio ao vivo, cantor e música atual no palco, próximos da fila e QR Code para novas inscrições.

---

## 🛠️ Tecnologias Utilizadas

- **Runtime**: [Node.js](https://nodejs.org/) (v22+)
- **Servidor Web & API**: [Express.js](https://expressjs.com/) v5
- **Banco de Dados**: SQLite Nativo (`node:sqlite` / `DatabaseSync`) com suporte a WAL mode e auto-seeding.
- **Frontend**: HTML5, CSS3 Moderno (Custom Properties & Tokens) e Vanilla JavaScript assíncrono.
- **QR Code**: Biblioteca `qrcode` para geração dinâmica de dados em Base64.
- **Testes Automatizados**: Bateria de testes de integração com `node:assert`.

---

## ⚙️ Instalação e Execução

### Pré-requisitos
- Node.js instalado (versão 22.0.0 ou superior recomendada).

### Passos

1. **Clone o repositório**:
```bash
git clone https://github.com/SEU_USUARIO/boteco-vikings.git
cd boteco-vikings
```

2. **Instale as dependências**:
```bash
npm install
```

3. **Inicie o servidor**:
```bash
npm start
```
*O banco de dados SQLite (`data/vikings.db`) é criado e populado automaticamente com os dados padrão no primeiro início.*

4. **Acesse no navegador**:
- Site Oficial: [http://localhost:3000/](http://localhost:3000/)
- Cardápio Digital: [http://localhost:3000/cardapio](http://localhost:3000/cardapio)
- Painel Staff & PDV: [http://localhost:3000/painel](http://localhost:3000/painel)
- Telão do Karaokê: [http://localhost:3000/karaoke/telao](http://localhost:3000/karaoke/telao)

---

## 🧪 Testes Automatizados

O projeto inclui uma bateria completa de 13 testes de integração que cobrem todo o fluxo operacional (configurações, eventos, cardápio, pedidos via QR Code, conferência do garçom, baixa de estoque, avanço no KDS, fechamento de conta, troco em dinheiro, moderação de karaokê e auditoria):

```bash
npm test
```

---

## 👥 Perfis de Acesso para Demonstração

No topo do painel administrativo (`/painel`), utilize o seletor **Demonstração:** para alternar entre os perfis:

| Perfil | Usuário Demo | Permissões |
|---|---|---|
| **Administrador** | Ragnar | Acesso irrestrito a todos os módulos, relatórios e configurações |
| **Gerente** | Lagertha | Salão, KDS, estoque, eventos, moderação e auditoria |
| **Caixa** | Bjorn | Operação do PDV, sangrias, suprimentos e fechamento de caixa |
| **Garçom** | Floki | Abertura de mesas, conferência de pedidos QR e entrega |
| **Cozinha** | Chef Ivar | KDS exclusivo da cozinha e petiscaria |
| **Bar** | Rollo | KDS exclusivo de chopps, coquetéis e doses |
| **Karaokê** | Harald | Moderação de fila e controle do telão |

---

## 📄 Licença

Este projeto é desenvolvido para o **Boteco Vikings**. Todos os direitos reservados.

// ===== Smart Kirana AI Assistant — Core Engine =====

const APP = {
  STORAGE_KEY: 'kirana_inventory',
  API_KEY_STORAGE: 'kirana_gemini_key',
  inventory: [],
  geminiKey: '',

  // ===== Initialize =====
  init() {
    this.inventory = this.load();
    this.geminiKey = localStorage.getItem(this.API_KEY_STORAGE) || '';
    this.render();
    this.bindEvents();
    if (this.geminiKey) {
      document.getElementById('apiKeyInput').value = '••••••••••••••••';
    }
  },

  // ===== LocalStorage =====
  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.inventory));
  },

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch { return []; }
  },

  // ===== Decision Engine =====
  getDemand(product) {
    const { stock, dailySales } = product;
    if (dailySales <= 0) return 'LOW';
    if (dailySales * 3 > stock) return 'HIGH';
    if (dailySales * 5 < stock) return 'LOW';
    return 'MEDIUM';
  },

  getPricingSuggestion(demand) {
    if (demand === 'HIGH') return { action: 'INCREASE', label: '↑ Increase 10-15%', class: 'badge-increase' };
    if (demand === 'LOW') return { action: 'DISCOUNT', label: '↓ Discount 10-20%', class: 'badge-discount' };
    return { action: 'STABLE', label: '→ Hold Price', class: 'badge-stable' };
  },

  getAlerts() {
    const alerts = [];
    this.inventory.forEach(p => {
      const demand = this.getDemand(p);
      if (p.stock <= 0) {
        alerts.push({ type: 'danger', icon: '🚫', msg: `<b>${p.name}</b> is OUT OF STOCK! Restock immediately.` });
      } else if (demand === 'HIGH' && p.stock < p.dailySales * 2) {
        alerts.push({ type: 'danger', icon: '🔴', msg: `<b>${p.name}</b> — critically low! Only ${p.stock} left, sells ~${p.dailySales}/day.` });
      } else if (demand === 'HIGH') {
        alerts.push({ type: 'warning', icon: '⚠️', msg: `<b>${p.name}</b> — high demand, stock may run out in ~${Math.ceil(p.stock / p.dailySales)} days.` });
      }
      if (demand === 'LOW') {
        alerts.push({ type: 'info', icon: '📦', msg: `<b>${p.name}</b> is overstocked. Consider a discount to move inventory.` });
      }
    });
    return alerts;
  },

  getStats() {
    const total = this.inventory.length;
    const lowStock = this.inventory.filter(p => this.getDemand(p) === 'HIGH' && p.stock < p.dailySales * 3).length;
    const highDemand = this.inventory.filter(p => this.getDemand(p) === 'HIGH').length;
    const totalValue = this.inventory.reduce((s, p) => s + p.price * p.stock, 0);
    return { total, lowStock, highDemand, totalValue };
  },

  getDemandDistribution() {
    let high = 0, medium = 0, low = 0;
    this.inventory.forEach(p => {
      const d = this.getDemand(p);
      if (d === 'HIGH') high++;
      else if (d === 'MEDIUM') medium++;
      else low++;
    });
    return { high, medium, low };
  },

  // ===== Add Product =====
  addProduct(name, stock, price, dailySales) {
    if (!name.trim()) return;
    this.inventory.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      stock: Math.max(0, parseInt(stock) || 0),
      price: Math.max(0, parseFloat(price) || 0),
      dailySales: Math.max(0, parseInt(dailySales) || 0),
      addedAt: new Date().toISOString()
    });
    this.save();
    this.render();
    this.toast('✅', `${name} added to inventory`);
  },

  deleteProduct(id) {
    const p = this.inventory.find(i => i.id === id);
    this.inventory = this.inventory.filter(i => i.id !== id);
    this.save();
    this.render();
    if (p) this.toast('🗑️', `${p.name} removed`);
  },

  // ===== Gemini AI Integration =====
  async generateInsights() {
    const key = this.geminiKey;
    if (!key) {
      this.toast('⚠️', 'Please enter your Gemini API key first');
      return;
    }
    if (this.inventory.length === 0) {
      this.toast('📦', 'Add some products first');
      return;
    }

    const box = document.getElementById('insightsContent');
    box.className = 'insights-box loading';
    box.innerHTML = '<span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span>';

    const inventoryData = this.inventory.map(p => ({
      name: p.name,
      stock: p.stock,
      price: p.price,
      dailySales: p.dailySales,
      demand: this.getDemand(p),
      pricing: this.getPricingSuggestion(this.getDemand(p)).label
    }));

    const prompt = `You are a smart business advisor for an Indian kirana (grocery) shop. Analyze this inventory data and provide actionable insights in a concise format:

INVENTORY:
${JSON.stringify(inventoryData, null, 2)}

Provide:
1. 🔍 Top 3 business insights (1 line each)
2. 💰 Revenue optimization tip
3. 📦 Restocking priority list
4. 🎯 One strategic recommendation

Keep the response concise (under 200 words). Use emojis for readability. Be specific with numbers.`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
          })
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No insights available.';

      box.className = 'insights-box';
      box.innerHTML = this.formatInsightsText(text);
      this.toast('✨', 'AI insights generated');
    } catch (e) {
      box.className = 'insights-box';
      box.innerHTML = `<span style="color:var(--red)">❌ Error: ${e.message}</span>`;
      this.toast('❌', 'Failed to get insights');
    }
  },

  formatInsightsText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>')
      .replace(/^(#{1,3})\s*(.*)/gm, '<b style="font-size:1rem;color:var(--text-primary)">$2</b>');
  },

  // ===== Charts =====
  renderBarChart() {
    const container = document.getElementById('barChart');
    if (this.inventory.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-hint">Add products to see chart</div></div>';
      return;
    }

    const maxStock = Math.max(...this.inventory.map(p => p.stock), 1);
    const items = this.inventory.slice(0, 12); // max 12 bars

    const colors = [
      'linear-gradient(to top, #6366f1, #818cf8)',
      'linear-gradient(to top, #8b5cf6, #a78bfa)',
      'linear-gradient(to top, #a855f7, #c084fc)',
      'linear-gradient(to top, #d946ef, #e879f9)',
      'linear-gradient(to top, #ec4899, #f472b6)',
      'linear-gradient(to top, #f43f5e, #fb7185)',
      'linear-gradient(to top, #f97316, #fb923c)',
      'linear-gradient(to top, #eab308, #facc15)',
      'linear-gradient(to top, #22c55e, #4ade80)',
      'linear-gradient(to top, #14b8a6, #2dd4bf)',
      'linear-gradient(to top, #06b6d4, #22d3ee)',
      'linear-gradient(to top, #3b82f6, #60a5fa)',
    ];

    container.innerHTML = items.map((p, i) => {
      const h = Math.max(4, (p.stock / maxStock) * 100);
      const demand = this.getDemand(p);
      return `
        <div class="bar-item" title="${p.name}: ${p.stock} units (${demand} demand)">
          <span class="bar-value">${p.stock}</span>
          <div class="bar" style="height:${h}%;background:${colors[i % colors.length]}"></div>
          <span class="bar-label">${p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name}</span>
        </div>`;
    }).join('');
  },

  renderPieChart() {
    const container = document.getElementById('pieChart');
    const dist = this.getDemandDistribution();
    const total = dist.high + dist.medium + dist.low;

    if (total === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🥧</div><div class="empty-state-hint">Add products to see distribution</div></div>';
      return;
    }

    // Build conic-gradient segments
    const segments = [];
    let cumulative = 0;

    const data = [
      { value: dist.high, color: '#f87171', label: 'High Demand' },
      { value: dist.medium, color: '#fbbf24', label: 'Medium' },
      { value: dist.low, color: '#34d399', label: 'Low Demand' },
    ];

    data.forEach(d => {
      if (d.value > 0) {
        const pct = (d.value / total) * 100;
        segments.push(`${d.color} ${cumulative}% ${cumulative + pct}%`);
        cumulative += pct;
      }
    });

    const gradient = `conic-gradient(${segments.join(', ')})`;

    container.innerHTML = `
      <div class="pie-chart" style="background:${gradient}">
        <div class="pie-center">
          <span class="pie-center-value">${total}</span>
          <span class="pie-center-label">Items</span>
        </div>
      </div>
      <div class="pie-legend">
        ${data.map(d => `
          <div class="legend-item">
            <span class="legend-dot" style="background:${d.color}"></span>
            <span class="legend-label">${d.label}</span>
            <span class="legend-value">${d.value}</span>
          </div>`).join('')}
      </div>`;
  },

  // ===== Render Everything =====
  render() {
    const stats = this.getStats();
    const alerts = this.getAlerts();

    // Stats
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statLowStock').textContent = stats.lowStock;
    document.getElementById('statHighDemand').textContent = stats.highDemand;
    document.getElementById('statTotalValue').textContent = '₹' + stats.totalValue.toLocaleString('en-IN');

    // Table
    const tbody = document.getElementById('inventoryBody');
    if (this.inventory.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-state-icon">🏪</div>
          <div class="empty-state-text">No products yet</div>
          <div class="empty-state-hint">Click "Add Product" to get started</div>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = this.inventory.map(p => {
        const demand = this.getDemand(p);
        const pricing = this.getPricingSuggestion(demand);
        const demandClass = demand === 'HIGH' ? 'badge-high' : demand === 'MEDIUM' ? 'badge-medium' : 'badge-low';
        return `<tr>
          <td class="product-name">${this.escapeHtml(p.name)}</td>
          <td>${p.stock}</td>
          <td>₹${p.price.toLocaleString('en-IN')}</td>
          <td>${p.dailySales}/day</td>
          <td><span class="badge ${demandClass}">${demand}</span></td>
          <td><span class="badge ${pricing.class}">${pricing.label}</span></td>
          <td><button class="btn-delete" onclick="APP.deleteProduct('${p.id}')" title="Delete">✕</button></td>
        </tr>`;
      }).join('');
    }

    // Alerts
    const alertsContainer = document.getElementById('alertsList');
    if (alerts.length === 0) {
      alertsContainer.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:0.82rem">✅ All inventory levels healthy</div>';
    } else {
      alertsContainer.innerHTML = alerts.slice(0, 8).map(a =>
        `<div class="alert-item alert-${a.type}"><span>${a.icon}</span><span>${a.msg}</span></div>`
      ).join('');
    }

    // Charts
    this.renderBarChart();
    this.renderPieChart();
  },

  // ===== Event Bindings =====
  bindEvents() {
    // Add Product Modal
    document.getElementById('btnAddProduct').addEventListener('click', () => this.openModal());
    document.getElementById('btnAddProductMobile').addEventListener('click', () => this.openModal());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    document.getElementById('btnModalCancel').addEventListener('click', () => this.closeModal());
    document.getElementById('addProductForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      this.addProduct(f.pName.value, f.pStock.value, f.pPrice.value, f.pSales.value);
      f.reset();
      this.closeModal();
    });

    // AI
    document.getElementById('btnInsights').addEventListener('click', () => this.generateInsights());
    document.getElementById('btnSaveKey').addEventListener('click', () => {
      const input = document.getElementById('apiKeyInput');
      const val = input.value.trim();
      if (val && val !== '••••••••••••••••') {
        this.geminiKey = val;
        localStorage.setItem(this.API_KEY_STORAGE, val);
        input.value = '••••••••••••••••';
        this.toast('🔑', 'API key saved');
      }
    });

    // Sample data
    document.getElementById('btnSampleData').addEventListener('click', () => this.loadSampleData());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  },

  openModal() {
    document.getElementById('modalOverlay').classList.add('active');
    setTimeout(() => document.getElementById('inputName').focus(), 150);
  },

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  },

  loadSampleData() {
    if (this.inventory.length > 0) {
      if (!confirm('This will replace your current inventory. Continue?')) return;
    }
    this.inventory = [
      { id: 's1', name: 'Toor Dal', stock: 15, price: 160, dailySales: 8, addedAt: new Date().toISOString() },
      { id: 's2', name: 'Basmati Rice', stock: 50, price: 95, dailySales: 12, addedAt: new Date().toISOString() },
      { id: 's3', name: 'Sugar', stock: 5, price: 45, dailySales: 6, addedAt: new Date().toISOString() },
      { id: 's4', name: 'Mustard Oil', stock: 80, price: 210, dailySales: 3, addedAt: new Date().toISOString() },
      { id: 's5', name: 'Atta (Wheat)', stock: 25, price: 320, dailySales: 7, addedAt: new Date().toISOString() },
      { id: 's6', name: 'Tea (Chai)', stock: 40, price: 280, dailySales: 10, addedAt: new Date().toISOString() },
      { id: 's7', name: 'Salt', stock: 100, price: 25, dailySales: 2, addedAt: new Date().toISOString() },
      { id: 's8', name: 'Soap Bar', stock: 12, price: 45, dailySales: 5, addedAt: new Date().toISOString() },
    ];
    this.save();
    this.render();
    this.toast('📦', 'Sample inventory loaded');
  },

  // ===== Utilities =====
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  toast(icon, message) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
};

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => APP.init());

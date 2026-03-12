/**
 * Isolated Guest Portal Logic
 * Luxury QR Tracking & Ordering System
 * Strict Architectural Update: Room Isolation & Sequential Billing
 */

class GuestPortal {
    constructor() {
        this.roomNumber = null;
        this.guestName = "Guest";
        this.cart = [];
        this.sessionHistory = []; // Full history of items in this session
        this.activeOrderId = null;
        this.menu = [];
        this.db = null;
        this.sessionToken = null;

        this.init();
    }

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        this.roomNumber = urlParams.get('room') || urlParams.get('view');

        if (!this.roomNumber) {
            this.showError("Access Denied", "Invalid QR Code. Please scan the QR in your room.");
            return;
        }

        // --- SESSION & PRIVACY CHECK ---
        const storedSession = JSON.parse(localStorage.getItem('br_guest_session') || '{}');
        if (storedSession.room && storedSession.room !== this.roomNumber) {
            // Block cross-room access
            this.showError("Security Alert", "You are already active in another room. Please close other tabs or consult reception.");
            return;
        }

        if (!storedSession.token) {
            this.sessionToken = 'G-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('br_guest_session', JSON.stringify({ room: this.roomNumber, token: this.sessionToken }));
        } else {
            this.sessionToken = storedSession.token;
        }

        // Load active order ID and history
        this.activeOrderId = localStorage.getItem(`br_active_order_${this.roomNumber}`);
        this.sessionHistory = JSON.parse(localStorage.getItem(`br_history_${this.roomNumber}`) || '[]');

        await this.initDB();
        await this.fetchGuestData();
        this.setupGreeting();
        this.renderMenu();
        this.renderHistory();
        this.setupTracking();
        this.startSyncListener();
    }

    showError(title, msg) {
        document.body.innerHTML = `
            <div style='padding: 3rem; text-align:center; height: 100vh; display: flex; flex-direction: column; justify-content: center; background: #0F172A; color: white;'>
                <h1 style='color: #D4AF37; margin-bottom: 1rem;'>${title}</h1>
                <p style='color: #94A3B8;'>${msg}</p>
            </div>`;
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('br-pro-db', 1);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = () => reject("DB Failed");
        });
    }

    async fetchGuestData() {
        return new Promise((resolve) => {
            const tx = this.db.transaction(['rooms'], 'readonly');
            const store = tx.objectStore('rooms');
            const req = store.get(this.roomNumber);
            req.onsuccess = () => {
                const room = req.result;
                if (room && room.status === 'occupied' && room.guest) {
                    this.guestName = room.guest.name;
                    document.getElementById('room-display').innerText = `Room ${this.roomNumber} • ${this.guestName}`;
                } else {
                    document.getElementById('room-display').innerText = `Room ${this.roomNumber}`;
                }
                
                // Static Menu (Staff ERP Sync)
                this.menu = [
                    { id: 'm1', name: 'Chicken Biryani', price: 350, icon: '🥘' },
                    { id: 'm2', name: 'Veg Thali', price: 200, icon: '🍛' },
                    { id: 'm3', name: 'Paneer Butter Masala', price: 280, icon: '🍲' },
                    { id: 'm4', name: 'Tandoori Roti', price: 25, icon: '🫓' },
                    { id: 'm5', name: 'Mineral Water', price: 30, icon: '💧' },
                    { id: 'm6', name: 'Masala Chai', price: 40, icon: '☕' },
                    { id: 'm7', name: 'Cold Coffee', price: 120, icon: '🧋' },
                    { id: 'm8', name: 'French Fries', price: 150, icon: '🍟' }
                ];
                resolve();
            };
        });
    }

    setupGreeting() {
        const hour = new Date().getHours();
        let greeting = "Welcome";
        if (hour >= 5 && hour < 12) greeting = "Good Morning";
        else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
        else if (hour >= 17 || hour < 5) greeting = "Good Evening";

        const name = this.guestName ? this.guestName.split(' ')[0] : 'Guest';
        document.getElementById('greeting').innerText = `${greeting}, ${name}!`;
    }

    renderMenu() {
        const grid = document.getElementById('menu-grid');
        grid.innerHTML = '';
        this.menu.forEach(item => {
            const card = document.createElement('div');
            card.className = 'food-card';
            card.innerHTML = `
                <div class="food-icon">${item.icon}</div>
                <div class="food-info">
                    <div class="food-name">${item.name}</div>
                    <div class="food-price">₹${item.price}</div>
                </div>
                <button class="add-btn" onclick="portal.addToCart('${item.id}')">ADD</button>
            `;
            grid.appendChild(card);
        });
    }

    addToCart(itemId) {
        const item = this.menu.find(m => m.id === itemId);
        const existing = this.cart.find(c => c.id === itemId);
        if (existing) existing.qty++;
        else this.cart.push({ ...item, qty: 1 });

        this.updateCartBar();
    }

    updateCartBar() {
        const bar = document.getElementById('cart-bar');
        const info = document.getElementById('cart-info');
        if (this.cart.length > 0) {
            const count = this.cart.reduce((s, i) => s + i.qty, 0);
            const total = this.cart.reduce((s, i) => s + (i.price * i.qty), 0);
            info.innerText = `${count} Items | ₹${total}`;
            bar.classList.add('active');
        } else {
            bar.classList.remove('active');
        }
    }

    async placeOrder() {
        if (this.cart.length === 0) return;

        // --- SEQUENTIAL BILLING LOGIC ---
        let serial = parseInt(localStorage.getItem(`br_serial_${this.roomNumber}`) || '0');
        let isAddon = this.activeOrderId ? true : false;
        
        if (!isAddon) {
            serial++;
            localStorage.setItem(`br_serial_${this.roomNumber}`, serial);
            this.activeOrderId = this.roomNumber + serial;
            localStorage.setItem(`br_active_order_${this.roomNumber}`, this.activeOrderId);
        }

        const itemsList = this.cart.map(i => `${i.qty}x ${i.name}`);
        const total = this.cart.reduce((s, i) => s + (i.price * i.qty), 0);

        // Update Session History
        this.sessionHistory.push(...this.cart);
        localStorage.setItem(`br_history_${this.roomNumber}`, JSON.stringify(this.sessionHistory));

        const orderObj = {
            id: isAddon ? `ADDON ${this.activeOrderId}` : this.activeOrderId,
            roomId: this.roomNumber,
            items: itemsList, // ONLY NEW ITEMS for KDS
            timestamp: Date.now(),
            status: 'preparing',
            total: total,
            orderType: 'room',
            guestName: this.guestName
        };

        // Save to Shared DB
        await this.saveOrderToDB(orderObj);

        // Notify Staff
        localStorage.setItem('kds_sync', JSON.stringify(orderObj));
        localStorage.setItem('yukt_notification_sync', JSON.stringify({
            id: Date.now().toString(),
            type: 'order',
            message: `QR ${isAddon ? 'ADD-ON' : 'ORDER'}: Room ${this.roomNumber} - ${this.activeOrderId}`,
            timestamp: Date.now(),
            status: 'new',
            target: 'reception',
            data: { type: 'room', orderId: this.activeOrderId, roomId: this.roomNumber, items: itemsList }
        }));

        // Reset Cart
        this.cart = [];
        this.updateCartBar();
        this.renderHistory();

        // Show Success Overlay
        document.getElementById('success-screen').style.display = 'flex';
        this.updateTrackingUI('preparing');
    }

    renderHistory() {
        // Option to show history in the tracker or a dedicated section
        // For now, let's just log it or provide a visual update
        console.log("Session History Updated:", this.sessionHistory);
    }

    saveOrderToDB(order) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(['kitchenOrders'], 'readwrite');
            const store = tx.objectStore('kitchenOrders');
            store.put(order);
            tx.oncomplete = () => resolve();
        });
    }

    setupTracking() {
        if (this.activeOrderId) {
            this.pollOrderStatus();
        }
    }

    async pollOrderStatus() {
        if (!this.activeOrderId) return;

        const tx = this.db.transaction(['kitchenOrders'], 'readonly');
        const store = tx.objectStore('kitchenOrders');
        const req = store.get(this.activeOrderId);
        req.onsuccess = () => {
            const order = req.result;
            if (order) {
                this.updateTrackingUI(order.status);
            }
        };
        setTimeout(() => this.pollOrderStatus(), 5000);
    }

    updateTrackingUI(status) {
        const tracker = document.getElementById('tracker');
        const progressBar = document.getElementById('timeline-progress');
        const statusLabel = document.getElementById('status-label');
        
        tracker.classList.add('active');
        document.getElementById('order-id-display').innerText = `ID: #${this.activeOrderId}`;

        // Reset steps
        for(let i=1; i<=4; i++) document.getElementById(`step-${i}`).classList.remove('active', 'done');

        if (status === 'preparing') {
            progressBar.style.height = '33%';
            document.getElementById('step-1').classList.add('done');
            document.getElementById('step-2').classList.add('active');
            statusLabel.innerText = "Food is Being Prepared";
        } else if (status === 'ready') {
            progressBar.style.height = '66%';
            document.getElementById('step-1').classList.add('done');
            document.getElementById('step-2').classList.add('done');
            document.getElementById('step-3').classList.add('active');
            statusLabel.innerText = "Food is on the Way";
        } else if (status === 'delivered') {
            progressBar.style.height = '100%';
            document.getElementById('step-1').classList.add('done');
            document.getElementById('step-2').classList.add('done');
            document.getElementById('step-3').classList.add('done');
            document.getElementById('step-4').classList.add('active');
            statusLabel.innerText = "Order Delivered. Enjoy!";
        } else {
            progressBar.style.height = '0%';
            document.getElementById('step-1').classList.add('active');
            statusLabel.innerText = "Order Placed";
        }

        this.renderHistory();
    }

    renderHistory() {
        const list = document.getElementById('session-items-list');
        if (!list) return;
        
        list.innerHTML = '';
        if (this.sessionHistory.length === 0) {
            list.innerHTML = '<div style="opacity:0.5;">No items in this session yet.</div>';
            return;
        }

        // Aggregate by name
        const summary = {};
        this.sessionHistory.forEach(item => {
            summary[item.name] = (summary[item.name] || 0) + item.qty;
        });

        Object.entries(summary).forEach(([name, qty]) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; margin-bottom: 4px;';
            div.innerHTML = `<span>${name}</span><span style="color:var(--gold-primary)">x${qty}</span>`;
            list.appendChild(div);
        });
    }

    startSyncListener() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'kds_sync' || e.key === 'yukt_pms_sync') {
                this.pollOrderStatus();
            }
        });
    }

    activateReorder() {
        document.getElementById('tracker').classList.remove('active');
    }

    showTracker() {
        document.getElementById('success-screen').style.display = 'none';
        document.getElementById('tracker').classList.add('active');
    }
}

const portal = new GuestPortal();

function placeGuestOrder() { portal.placeOrder(); }
function activateReorder() { portal.activateReorder(); }
function showTracker() { portal.showTracker(); }

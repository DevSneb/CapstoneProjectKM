<template>
  <div class="dashboard" :class="{ dark: isDark }">
    <router-view aria-hidden="true" style="display:none" />
    <header class="topbar glass-surface">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">K</div>
        <div class="brand-text">Kadiwa Prime</div>
      </div>

      <div class="top-search-wrap">
        <span class="icon">⌕</span>
        <input
          class="top-search"
          placeholder="Search products, stores, categories..."
          v-model="q"
          @input="loadProducts"
          aria-label="Search products"
        />
      </div>

      <div class="top-actions">
        <button class="icon-btn notification-btn" title="Notifications" aria-label="Notifications" @click="setActive('notifications')">
          🔔
          <span class="badge" v-if="notificationUnreadCount">{{ notificationUnreadCount > 99 ? '99+' : notificationUnreadCount }}</span>
        </button>
        <button class="icon-btn cart-btn" @click="setActive('cart')" title="Cart" aria-label="Cart">
          🛒
          <span class="badge" v-if="cartCount">{{ cartCount }}</span>
        </button>
        <div class="avatar-menu" @click="toggleUserMenu">
          <div class="avatar">{{ (user?.full_name || 'U').slice(0,1).toUpperCase() }}</div>
          <span class="avatar-name">{{ user?.full_name || 'Customer' }}</span>
          <span class="caret">▾</span>
          <div v-if="showUserMenu" class="dropdown glass-surface" @click.stop>
            <button @click="setActive('howToUse'); showUserMenu=false">How to Use</button>
            <button @click="setActive('settings'); showUserMenu=false">Profile</button>
            <button @click="setActive('addressBook'); showUserMenu=false">Address Book</button>
            <button @click="setActive('notifications'); showUserMenu=false">Notifications</button>
            <button @click="setActive('purchaseHistory'); showUserMenu=false">Purchase History</button>
            <button @click="handleLogout">Logout</button>
          </div>
        </div>
      </div>
    </header>

    <div class="body-wrap">
      <aside class="sidebar glass-surface" :class="{ collapsed: sidebarCollapsed }">
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed" :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
          {{ sidebarCollapsed ? '›' : '‹' }}
        </button>

        <ul class="menu">
          <li :class="{ active: activePanel==='dashboard' }" title="Dashboard" @click="setActive('dashboard')">
            <span class="mi">⌂</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Dashboard</span>
            <span class="nav-label short">Home</span>
          </li>
          <li :class="{ active: activePanel==='products' }" title="Products" @click="setActive('products')">
            <span class="mi">🛍️</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Products</span>
            <span class="nav-label short">Products</span>
          </li>
          <li :class="{ active: activePanel==='storesMap' }" title="Store Map" @click="setActive('storesMap')">
            <span class="mi">🗺️</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Store Map</span>
            <span class="nav-label short">Map</span>
          </li>
          <li :class="{ active: activePanel==='purchaseHistory' }" title="Purchase History" @click="setActive('purchaseHistory')">
            <span class="mi">🧾</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Purchase History</span>
            <span class="nav-label short">Orders</span>
          </li>
          <li class="mobile-secondary" :class="{ active: activePanel==='settings' }" title="Profile" @click="setActive('settings')">
            <span class="mi">👤</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Profile</span>
            <span class="nav-label short">Profile</span>
          </li>
          <li :class="{ active: activePanel==='howToUse' }" title="How to Use" @click="setActive('howToUse')">
            <span class="mi">❓</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">How to Use</span>
            <span class="nav-label short">Help</span>
          </li>
          <li class="mobile-secondary" :class="{ active: activePanel==='addressBook' }" title="Address Book" @click="setActive('addressBook')">
            <span class="mi">📍</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Address Book</span>
            <span class="nav-label short">Address</span>
          </li>
          <li class="logout-item" title="Logout" @click="handleLogout">
            <span class="mi">↩</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">Logout</span>
            <span class="nav-label short">Logout</span>
          </li>
        </ul>
      </aside>

      <main class="main">
        <template v-if="activePanel==='dashboard'">
          <section class="welcome glass-surface">
            <div>
              <h1>Welcome back, {{ firstName }} 👋</h1>
              <p>Discover fresh picks, reorder faster, and track every delivery effortlessly.</p>
            </div>
            <div class="welcome-actions">
              <button class="ghost" @click="isDark=!isDark">{{ isDark ? 'Light Mode' : 'Dark Mode' }}</button>
              <button class="primary" @click="setActive('cart')">Go to Cart</button>
            </div>
          </section>

          <section class="analytics">
            <article class="metric glass-card">
              <h3>Total Orders</h3>
              <strong>{{ ordersCount }}</strong>
            </article>
            <article class="metric glass-card">
              <h3>Cart Items</h3>
              <strong>{{ cartCount }}</strong>
            </article>
            <article class="metric glass-card">
              <h3>Total Spent</h3>
              <strong>{{ formatCurrency(totalSpent) }}</strong>
            </article>
            <article class="metric glass-card">
              <h3>Reward Points</h3>
              <strong>{{ rewardPoints }}</strong>
              <small>Redeemable • 1 pt = ₱1 off at checkout</small>
            </article>
            <article class="metric glass-card">
              <h3>Store 3 Savings (5%)</h3>
              <strong>{{ formatCurrency(store3SavingsBalance) }}</strong>
              <small>Investment-only • not valid for checkout payment</small>
            </article>
          </section>
        </template>

        <section v-show="activePanel==='products'" class="panel glass-surface">
          <div class="panel-head">
            <h2>Products</h2>
            <div class="product-head-actions">
              <button type="button" class="mobile-filter-toggle" :class="{ active: advancedFiltersOpen }" @click="advancedFiltersOpen = !advancedFiltersOpen">
                ⚙ Filters
                <span v-if="activeFilterChips.length">{{ activeFilterChips.length }}</span>
              </button>
              <div class="view-toggle">
                <button :class="{active:viewMode==='grid'}" @click="viewMode='grid'">Grid</button>
                <button :class="{active:viewMode==='list'}" @click="viewMode='list'">List</button>
              </div>
            </div>
          </div>

          <div class="product-search-row">
            <div class="field ai-search">
              <span>⌕</span>
              <input class="input" placeholder="Search products…" v-model="q" @input="loadProducts" />
            </div>
          </div>

          <div class="filters" :class="{ open: advancedFiltersOpen }">
            <label class="filter-control">
              <span>Store</span>
              <select class="select" v-model="selectedStore" @change="loadProducts">
                <option value="">All stores</option>
                <option v-for="s in storesOptions" :key="s.id" :value="s.id">{{ s.store_name }}</option>
              </select>
            </label>
            <label class="filter-control">
              <span>Category</span>
              <select class="select" v-model="selectedCategory">
                <option value="">All categories</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label class="filter-control">
              <span>Sort by</span>
              <select class="select" v-model="sortBy">
                <option value="name">Name</option>
                <option value="popularity">Popularity</option>
                <option value="rating">Rating</option>
              </select>
            </label>
            <label class="filter-control">
              <span>Products shown</span>
              <select class="select" v-model.number="pageSize">
                <option :value="8">8 per page</option>
                <option :value="12">12 per page</option>
                <option :value="20">20 per page</option>
              </select>
            </label>
            <div class="filter-control price-filter">
              <span>Price range</span>
              <div class="price-range">
                <input class="input" type="number" min="0" step="0.01" v-model.number="priceMin" placeholder="Min ₱" />
                <span>–</span>
                <input class="input" type="number" min="0" step="0.01" v-model.number="priceMax" placeholder="Max ₱" />
              </div>
            </div>
            <button v-if="activeFilterChips.length" type="button" class="clear-filters" @click="clearProductFilters">Clear filters</button>
          </div>

          <div class="chips" v-if="activeFilterChips.length">
            <button class="chip" v-for="chip in activeFilterChips" :key="chip.key" @click="removeFilter(chip.key)">
              {{ chip.label }} ✕
            </button>
          </div>

          <div :class="viewMode==='grid' ? 'product-grid' : 'product-list'">
            <article v-for="p in pagedProducts" :key="p.id" class="product-card" :class="{ list: viewMode==='list' }">
              <div class="thumb">
                <img v-if="p.image_url" :src="toPublicImageUrl(p.image_url)" :alt="p.name || 'Product image'" class="thumb-image" />
              </div>
              <button class="wishlist" aria-label="Wishlist">♡</button>
              <div class="content">
                <h3>{{ p.description || '—' }}</h3>
                <div class="price-row">
                  <div class="price">
                    <span class="price-label-tag">Kadiwa</span>
                    <span class="price-value">{{ formatCurrency(p.price) }}</span>
                  </div>
                  <div v-if="hasMarketPrice(p)" class="market-price">
                    <span class="price-label-tag">Market</span>
                    <span class="price-value">{{ formatCurrency(p.market_price) }}</span>
                  </div>
                </div>
                <div class="stock" :class="stockClass(p)">{{ stockLabel(p) }}</div>
                <div class="stars" aria-label="Rating">★★★★☆</div>
                <div class="row">
                  <div v-if="isVariableWeightUnit(p.unit)" class="qty-pill">
                    <button @click="decreaseQty(p.id)">−</button>
                    <input type="number" min="0.001" step="0.001" class="qty" v-model.number="quantities[p.id]" :disabled="isOutOfStock(p)" />
                    <button @click="increaseQty(p.id)">+</button>
                  </div>
                  <span v-else class="fixed-quantity">1 piece</span>
                  <button class="primary add-btn" :disabled="isOutOfStock(p)" @click="addToCart(p, quantities[p.id] || 1)">
                    {{ isOutOfStock(p) ? 'Out of Stock' : 'Add to Cart' }}
                  </button>
                </div>
              </div>
            </article>
            <div v-if="!pagedProducts.length" class="empty">No products found</div>
          </div>

          <div class="pagination" v-if="totalPages > 1">
            <button class="ghost" :disabled="page===1" @click="setPage(page-1)">Prev</button>
            <span>Page {{ page }} / {{ totalPages }}</span>
            <button class="ghost" :disabled="page===totalPages" @click="setPage(page+1)">Next</button>
          </div>
        </section>

        <section v-show="activePanel==='cart'" class="panel glass-surface">
          <h2>My Cart</h2>
          <div class="cart-top">
            <label>Shipping Method
              <select class="select" v-model="shippingMethod">
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery Service</option>
              </select>
            </label>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="it in cart" :key="it.product_id">
                  <td data-label="Item"><strong>{{ it.name }}</strong></td>
                  <td data-label="Qty">
                    <input
                      v-if="isVariableWeightUnit(it.unit)"
                      type="number"
                      min="0.001"
                      step="0.001"
                      v-model.number="it.quantity"
                      @change="update(it)"
                    />
                    <span v-else class="fixed-quantity">1 piece</span>
                  </td>
                  <td data-label="Unit Price">{{ formatCurrency(it.unit_price) }}</td>
                  <td data-label="Subtotal">
                    <template v-if="isVariableWeightUnit(it.unit)">
                      {{ formatCurrency(Number(it.unit_price || 0) * Number(it.quantity || 0)) }}
                      ~ {{ formatCurrency(Number(it.unit_price || 0) * Number(it.quantity || 0) + 20) }}
                    </template>
                    <template v-else>{{ formatCurrency(it.unit_price * it.quantity) }}</template>
                  </td>
                  <td data-label=""><button class="ghost" @click="remove(it)">Remove</button></td>
                </tr>
                <tr v-if="cart.length===0"><td colspan="5" class="empty">No items</td></tr>
              </tbody>
            </table>
          </div>

          <div class="panel-summary" v-if="cart.length">
            <div>Total: <strong>{{ formatCurrency(total) }}</strong></div>
            <div>Store: <strong>{{ derivedStoreId || '—' }}</strong></div>
            <button class="primary" @click="openCheckout" :disabled="loading || !derivedStoreId">Checkout</button>
          </div>
        </section>

        <section v-show="activePanel==='purchaseHistory'" class="panel glass-surface">
          <h2>Purchase History</h2>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>#</th><th>Store</th><th>Shipping</th><th>Payment</th><th>Delivery Fee</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
              <tbody>
                <tr v-for="o in purchaseHistoryOrders" :key="`history-${o.id}`" class="clickable-row" @click="openOrderDetails(o)">
                  <td data-label="Order">#{{ o.id }}</td>
                  <td data-label="Store">{{ o.store_name }}</td>
                  <td data-label="Shipping">{{ o.shipping_method || 'pickup' }}</td>
                  <td data-label="Payment">{{ formatPaymentMethod(o.payment_method) }}</td>
                  <td data-label="Delivery Fee">{{ formatCurrency(o.delivery_fee || 0) }}</td>
                  <td data-label="Status">{{ o.status }}</td>
                  <td data-label="Total"><strong>{{ formatCurrency(o.total_amount) }}</strong></td>
                  <td data-label="Date">{{ new Date(o.created_at).toLocaleString() }}</td>
                </tr>
                <tr v-if="!purchaseHistoryOrders.length"><td colspan="8" class="empty">No purchase history yet</td></tr>
              </tbody>
            </table>
          </div>
          <div class="hint">Tip: click a row to view purchased products.</div>
        </section>

        <section v-show="activePanel==='settings'" class="panel glass-surface settings-panel">
          <div class="settings-header">
            <h2>Profile Settings</h2>
            <p class="settings-lead">Update the details used at checkout. Account login changes stay private below.</p>
          </div>

          <div class="settings-grid">
            <article class="settings-card">
              <div class="settings-card-head">
                <h3>Personal info</h3>
                <p>Name, phone, and address used at checkout.</p>
              </div>
              <div class="settings-form">
                <div class="field-row">
                  <label>Full Name
                    <input class="input" v-model="profile.full_name" />
                  </label>
                  <label>Phone
                    <input class="input" v-model="profile.phone" />
                  </label>
                </div>
                <label>Address barangay
                  <select class="select" v-model="profileBarangay">
                    <option disabled value="">Select barangay</option>
                    <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
                  </select>
                </label>
                <label>Street / landmark (optional)
                  <input class="input" v-model="profileStreet" placeholder="Street, house no., landmark" />
                </label>
                <div class="settings-actions">
                  <button class="primary" @click="saveProfile">Save profile</button>
                </div>
              </div>
            </article>

            <article class="settings-card settings-security-card">
              <div class="settings-card-head">
                <h3>Login &amp; security</h3>
                <p>Your sign-in details are hidden. Open a section only when you need to change them.</p>
              </div>

              <div class="security-summary">
                <div class="security-row">
                  <span>Signed in as</span>
                  <strong>{{ maskedEmail(profile.email) }}</strong>
                </div>
              </div>

              <div class="security-actions">
                <button
                  type="button"
                  class="ghost security-toggle"
                  :class="{ open: showEmailEditor }"
                  @click="toggleEmailEditor"
                >
                  {{ showEmailEditor ? 'Hide email change' : 'Change email' }}
                </button>
                <button
                  type="button"
                  class="ghost security-toggle"
                  :class="{ open: showPasswordEditor }"
                  @click="togglePasswordEditor"
                >
                  {{ showPasswordEditor ? 'Hide password change' : 'Change password' }}
                </button>
              </div>

              <div v-if="showEmailEditor" class="settings-form security-editor">
                <p class="security-hint">Enter a new email and confirm with your current password.</p>
                <label>New Email
                  <input class="input" v-model="emailForm.email" type="email" autocomplete="off" placeholder="Enter new email" />
                </label>
                <label>Current Password
                  <input class="input" v-model="emailForm.current_password" type="password" autocomplete="current-password" placeholder="••••••••" />
                </label>
                <div class="settings-actions">
                  <button class="ghost" type="button" @click="cancelEmailEditor">Cancel</button>
                  <button class="primary" @click="saveEmail" :disabled="savingEmail">
                    {{ savingEmail ? 'Updating...' : 'Save email' }}
                  </button>
                </div>
              </div>

              <div v-if="showPasswordEditor" class="settings-form security-editor">
                <p class="security-hint">Use at least 6 characters. Never share your password.</p>
                <label>Current Password
                  <input class="input" v-model="passwordForm.current_password" type="password" autocomplete="current-password" placeholder="••••••••" />
                </label>
                <div class="field-row">
                  <label>New Password
                    <input class="input" v-model="passwordForm.new_password" type="password" minlength="6" autocomplete="new-password" placeholder="••••••••" />
                  </label>
                  <label>Confirm New Password
                    <input class="input" v-model="passwordForm.confirm_password" type="password" minlength="6" autocomplete="new-password" placeholder="••••••••" />
                  </label>
                </div>
                <div class="settings-actions">
                  <button class="ghost" type="button" @click="cancelPasswordEditor">Cancel</button>
                  <button class="primary" @click="savePassword" :disabled="savingPassword">
                    {{ savingPassword ? 'Updating...' : 'Save password' }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section v-show="activePanel==='addressBook'" class="panel glass-surface settings-panel">
          <div class="settings-header">
            <h2>Address Book</h2>
            <p class="settings-lead">Save home and work addresses for faster checkout.</p>
          </div>
          <article class="settings-card settings-card-wide">
            <div class="settings-form">
              <label>Home barangay
                <select class="select" v-model="homeBarangay">
                  <option disabled value="">Select barangay</option>
                  <option v-for="b in barangays" :key="'home-' + b" :value="b">{{ b }}</option>
                </select>
              </label>
              <label>Home street / landmark (optional)
                <input class="input" v-model="homeStreet" placeholder="Street, house no., landmark" />
              </label>
              <label>Work barangay
                <select class="select" v-model="workBarangay">
                  <option value="">Select barangay (optional)</option>
                  <option v-for="b in barangays" :key="'work-' + b" :value="b">{{ b }}</option>
                </select>
              </label>
              <label>Work street / landmark (optional)
                <input class="input" v-model="workStreet" placeholder="Street, house no., landmark" />
              </label>
              <label>Default Checkout Address
                <select class="select" v-model="addressBook.defaultType">
                  <option value="profile">Profile Address</option>
                  <option value="home">Home Address</option>
                  <option value="work">Work Address</option>
                </select>
              </label>
              <div class="settings-actions">
                <button class="primary" @click="saveAddressBook" :disabled="savingAddressBook">
                  {{ savingAddressBook ? 'Saving...' : 'Save address book' }}
                </button>
              </div>
            </div>
          </article>
        </section>

        <section v-show="activePanel==='storesMap'" class="panel glass-surface">
          <h2>Store Map</h2>
          <div v-if="mapError" class="map-error">{{ mapError }}</div>
          <div class="map-style">
            <label>Map type
              <select class="select" v-model="mapTypeId" @change="switchMapType">
                <option value="roadmap">Roadmap</option>
                <option value="satellite">Satellite</option>
                <option value="hybrid">Hybrid</option>
                <option value="terrain">Terrain</option>
              </select>
            </label>
          </div>
          <div id="storesMap" class="map"></div>
          <div class="map-actions">
            <button class="ghost" @click="refreshStores">Refresh Stores</button>
            <span class="hint">Tip: click a marker to see store details.</span>
          </div>
        </section>

        <section v-show="activePanel==='howToUse'" class="panel glass-surface how-to-panel">
          <div class="how-to-header">
            <h2>How to Use</h2>
            <p class="how-to-lead">A quick guide to shop on Kadiwa Prime as a customer.</p>
          </div>

          <ol class="how-to-steps">
            <li>
              <span class="step-num">1</span>
              <div>
                <h3>Browse products</h3>
                <p>Open <strong>Products</strong>. Use search, store, category, and price filters to find items. Tap <strong>Add to Cart</strong>.</p>
              </div>
            </li>
            <li>
              <span class="step-num">2</span>
              <div>
                <h3>Check your cart</h3>
                <p>Open the cart (🛒). Adjust quantities or remove items. Pick <strong>Pickup</strong> or <strong>Delivery</strong>, then tap <strong>Checkout</strong>.</p>
              </div>
            </li>
            <li>
              <span class="step-num">3</span>
              <div>
                <h3>Complete checkout</h3>
                <p>Confirm your name and phone. For delivery, choose your address or a barangay. Pay with <strong>Cash</strong>. <strong>GCash</strong> is available soon.</p>
              </div>
            </li>
            <li>
              <span class="step-num">4</span>
              <div>
                <h3>Use reward points (optional)</h3>
                <p>If the store allows it, turn on <strong>Use points</strong> at checkout to get a discount. You earn points when an order is <strong>delivered</strong>.</p>
              </div>
            </li>
            <li>
              <span class="step-num">5</span>
              <div>
                <h3>Track your orders</h3>
                <p>Go to <strong>Orders</strong> (Purchase History) to see status. Tap a row for item details.</p>
              </div>
            </li>
            <li>
              <span class="step-num">6</span>
              <div>
                <h3>Keep your profile ready</h3>
                <p>Update <strong>Profile</strong> and <strong>Address Book</strong> so checkout is faster. Use <strong>Store Map</strong> to find nearby Kadiwa stores.</p>
              </div>
            </li>
          </ol>

          <div class="how-to-tips">
            <h3>Tips</h3>
            <ul>
              <li>Cart items must be from <strong>one store</strong> per order.</li>
              <li>Delivery fees depend on the barangay you choose.</li>
              <li>Store 3 Savings (5%) is for investment only — it cannot pay for products.</li>
            </ul>
          </div>

          <div class="how-to-actions">
            <button class="primary" @click="setActive('products')">Start shopping</button>
            <button class="ghost" @click="setActive('cart')">Go to cart</button>
          </div>
        </section>

        <section v-show="activePanel==='notifications'" class="panel glass-surface notifications-panel">
          <div class="notifications-head">
            <div>
              <h2>Notifications</h2>
              <p class="subtle">Order confirmations and status updates are also sent to your email.</p>
            </div>
            <button class="ghost" :disabled="!notificationUnreadCount" @click="markAllNotificationsRead">Mark all read</button>
          </div>
          <div v-if="notificationsLoading" class="notification-empty">Loading notifications…</div>
          <div v-else-if="!notifications.length" class="notification-empty">You have no notifications yet.</div>
          <div v-else class="notification-list">
            <button
              v-for="notification in notifications"
              :key="notification.id"
              type="button"
              class="notification-card"
              :class="{ unread: !notification.is_read }"
              @click="markNotificationRead(notification)"
            >
              <span class="notification-icon">{{ notification.type === 'order_status' ? '📦' : '🧾' }}</span>
              <span class="notification-copy">
                <strong>{{ notification.type === 'order_status' ? 'Order status' : 'Order update' }}</strong>
                <span>{{ notification.message }}</span>
                <small>{{ new Date(notification.created_at).toLocaleString() }}</small>
              </span>
              <span v-if="!notification.is_read" class="unread-dot" aria-label="Unread"></span>
            </button>
          </div>
        </section>
      </main>
    </div>

    <div v-if="showCheckout">
      <div class="modal-backdrop" @click="showCheckout=false"></div>
      <div class="modal glass-surface">
        <h3>Confirm Order</h3>
        <div class="form">
          <label>Full Name
            <input class="input" v-model="checkoutForm.full_name" />
          </label>
          <label>Phone Number
            <input class="input" v-model="checkoutForm.phone" />
          </label>
          <label>Shipping Method
            <select class="select" v-model="checkoutForm.shipping_method" @change="onCheckoutShippingChange">
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery Service</option>
            </select>
          </label>
          <template v-if="checkoutForm.shipping_method === 'delivery'">
            <label>Drop-off address
              <select class="select" v-model="checkoutForm.address_mode" @change="onAddressModeChange">
                <option value="home">Home / account address</option>
                <option value="custom">Custom location (another place)</option>
              </select>
            </label>
            <div v-if="checkoutForm.address_mode === 'home'" class="home-address-preview glass-surface">
              <span class="preview-label">Delivering to your saved address</span>
              <p class="preview-text">{{ homeAddressPreview || 'No address on file. Add one in Profile or Address Book, or choose Custom location.' }}</p>
              <p v-if="checkoutForm.address_mode === 'home' && homeAddressPreview && !homeBarangayValid" class="address-warn">
                We could not detect a delivery barangay from this address. Choose <strong>Custom location</strong> and pick a barangay, or update your profile so it starts with a barangay name (e.g. “Balingayan, …”).
              </p>
            </div>
            <label v-if="checkoutForm.address_mode === 'custom'">Barangay (delivery zone &amp; fee)
              <select class="select" v-model="checkoutForm.address" @change="onCheckoutBarangayChange">
                <option value="" disabled>Select barangay</option>
                <option v-for="barangay in barangays" :key="barangay" :value="barangay">{{ barangay }}</option>
              </select>
            </label>
            <label>Landmark / directions (optional)
              <input class="input" v-model.trim="checkoutForm.landmark" placeholder="Unit, street, gate code — adds detail for the rider" @input="onCheckoutLandmarkInput" />
            </label>
          </template>
          <label v-if="checkoutForm.shipping_method === 'delivery'">Preferred Delivery Date
            <input class="input" type="date" v-model="checkoutForm.preferred_delivery_date" :min="todayDate" />
          </label>
          <label>Payment Method
            <select class="select" v-model="checkoutForm.payment_method">
              <option value="cod">Cash</option>
              <option value="gcash" disabled>GCash (Available soon)</option>
            </select>
          </label>
          <div class="gcash-info glass-surface gcash-soon">
            <span class="gcash-icon" aria-hidden="true">G</span>
            <div>
              <strong>GCash — Available soon</strong>
              <p>Online GCash checkout is coming. For now, please pay with Cash.</p>
            </div>
          </div>
          <div class="points-redeem glass-surface" v-if="checkoutEstimate.points_enabled !== false">
            <div class="points-redeem-head">
              <strong>Reward points discount</strong>
              <span class="hint">Balance: {{ rewardPoints }} pts (≈ ₱{{ pointsBalanceValue }})</span>
            </div>
            <label class="points-toggle">
              <input type="checkbox" v-model="useRewardPoints" :disabled="!rewardPoints" @change="onUsePointsToggle" />
              Use points for this order
            </label>
            <div v-if="useRewardPoints" class="points-controls">
              <label>Points to redeem
                <input
                  class="input"
                  type="number"
                  min="0"
                  :max="maxRedeemablePoints"
                  step="1"
                  v-model.number="checkoutForm.points_to_redeem"
                  @input="onPointsRedeemInput"
                />
              </label>
              <div class="points-quick">
                <button type="button" class="ghost" @click="setRedeemPoints(0)">None</button>
                <button type="button" class="ghost" @click="setRedeemPoints(Math.floor(maxRedeemablePoints / 2))">Half</button>
                <button type="button" class="ghost" @click="setRedeemPoints(maxRedeemablePoints)">Max</button>
              </div>
              <p class="hint">
                {{ checkoutEstimate.rewards_note || `Earn 1 pt per ₱${checkoutEstimate.earn_pesos_per_point || 20} on delivered orders. 1 pt = ₱${Number(checkoutEstimate.redeem_peso_per_point || 1).toFixed(2)} off.` }}
              </p>
            </div>
          </div>
          <div v-else class="hint" style="margin-top:10px">This store currently has reward points disabled.</div>
        </div>
        <div class="panel-summary">
          <div>Subtotal: <strong>{{ formatCurrency(checkoutEstimate.subtotal) }}</strong></div>
          <div v-if="variableWeightEstimate">
            Estimated price range for variable-weight products:
            <strong>{{ formatCurrency(variableWeightEstimate.minimum) }} ~ {{ formatCurrency(variableWeightEstimate.maximum) }}</strong>
            <span class="hint">Actual total may vary because of cuttings or excessive size.</span>
          </div>
          <div>Delivery Fee: <strong>{{ formatCurrency(checkoutEstimate.delivery_fee) }}</strong></div>
          <div v-if="Number(checkoutEstimate.discount_amount || 0) > 0">
            Points discount (−{{ checkoutEstimate.points_to_redeem || 0 }} pts):
            <strong>−{{ formatCurrency(checkoutEstimate.discount_amount) }}</strong>
          </div>
          <div>Total due: <strong>{{ formatCurrency(checkoutEstimate.total_amount) }}</strong></div>
          <div>Shipping: <strong>{{ checkoutForm.shipping_method==='delivery' ? 'Delivery Service' : 'Pickup' }}</strong></div>
          <div>Store: <strong>{{ derivedStoreId || '—' }}</strong></div>
          <div v-if="Number(checkoutEstimate.points_earn_preview || 0) > 0" class="hint">
            You’ll earn ~{{ checkoutEstimate.points_earn_preview }} pts after this order is delivered.
          </div>
          <div v-if="Number(derivedStoreId) === 3">Store 3 Savings Earned: <strong>{{ formatCurrency(checkoutEstimate.total_amount * 0.05) }}</strong></div>
          <div v-if="Number(derivedStoreId) === 3" class="hint">This 5% goes to your Store 3 savings wallet and cannot be used to buy products.</div>
          <div v-if="estimatingFee" class="hint">Calculating totals...</div>
        </div>
        <div class="actions">
          <button class="ghost" @click="showCheckout=false">Cancel</button>
          <button class="primary" @click="placeOrder" :disabled="loading">{{ loading ? 'Placing...' : 'Place Order' }}</button>
        </div>
      </div>
    </div>

    <div v-if="showGcashPayment" class="gcash-gateway-overlay">
      <div class="modal-backdrop" @click="cancelGcashPayment"></div>
      <div class="gcash-gateway" role="dialog" aria-label="GCash payment">
        <header class="gcash-gateway-header">
          <span class="gcash-logo-mark" aria-hidden="true">G</span>
          <span class="gcash-logo-text">GCash</span>
          <button type="button" class="gcash-close" @click="cancelGcashPayment" aria-label="Close">×</button>
        </header>

        <div v-if="gcashPaymentStatus === 'pending'" class="gcash-gateway-body">
          <div class="gcash-pay-card">
            <p class="gcash-amount">₱{{ Number(checkoutEstimate?.total_amount || 0).toFixed(2) }}</p>
            <p v-if="pendingOrderId" class="gcash-order-meta">Order #{{ pendingOrderId }}</p>
            <p class="gcash-secure-copy">Tap below to finish payment in the GCash app. This screen updates automatically when you’re done.</p>
            <button type="button" class="gcash-open-btn" @click="openInGcash" :disabled="!gcashDeepLinkUrl && !gcashPaymentUrl">
              Open in GCash
            </button>

            <details class="gcash-qr-details gcash-qr-mobile">
              <summary class="gcash-qr-summary">Pay with QR instead</summary>
              <p class="gcash-or-copy">Open GCash on another phone and scan this code with QR Scanner.</p>
              <div class="gcash-qr-wrap">
                <img
                  v-if="gcashQrCodeUrl"
                  :src="gcashQrCodeUrl"
                  alt="Scan this QR code in the GCash app"
                  class="gcash-qr"
                  width="220"
                  height="220"
                />
                <div v-else class="gcash-qr-fallback">
                  <div class="spinner"></div>
                  <p>Preparing QR code…</p>
                </div>
              </div>
            </details>

            <div class="gcash-qr-desktop">
              <p class="gcash-or-copy">or Log in to GCash and scan this QR with the QR Scanner.</p>
              <div class="gcash-qr-wrap">
                <img
                  v-if="gcashQrCodeUrl"
                  :src="gcashQrCodeUrl"
                  alt="Scan this QR code in the GCash app"
                  class="gcash-qr"
                  width="220"
                  height="220"
                />
                <div v-else class="gcash-qr-fallback">
                  <div class="spinner"></div>
                  <p>Preparing QR code…</p>
                </div>
              </div>
            </div>

            <p class="gcash-poll-hint">Waiting for confirmation… ({{ gcashPollingCount }}/{{ gcashMaxPollingAttempts }})</p>
            <button type="button" class="gcash-cancel-link" @click="cancelGcashPayment">Cancel payment</button>
          </div>
        </div>

        <div v-else-if="gcashPaymentStatus === 'success'" class="gcash-gateway-body payment-success">
          <div class="success-icon">✓</div>
          <h4>Payment Successful!</h4>
          <p>Your payment has been confirmed and your order is being processed.</p>
          <p class="order-id">Order #{{ pendingOrderId }}</p>
          <button class="primary gcash-result-btn" @click="completeGcashPayment">Continue to Order Tracking</button>
        </div>

        <div v-else-if="gcashPaymentStatus === 'failed'" class="gcash-gateway-body payment-failed">
          <div class="failed-icon">✕</div>
          <h4>Payment Failed</h4>
          <p>Your payment could not be processed. Please try again.</p>
          <div class="actions gcash-result-actions">
            <button class="ghost" @click="cancelGcashPayment">Cancel</button>
            <button class="primary" @click="retryGcashPayment">Try Again</button>
          </div>
        </div>

        <div v-else-if="gcashPaymentStatus === 'cancelled'" class="gcash-gateway-body payment-cancelled">
          <div class="cancelled-icon">⊘</div>
          <h4>Payment Cancelled</h4>
          <p>Your payment was cancelled.</p>
          <button class="ghost gcash-result-btn" @click="cancelGcashPayment">Return to Checkout</button>
        </div>
      </div>
    </div>

    <div v-if="showOrderDetails">
      <div class="modal-backdrop" @click="closeOrderDetails"></div>
      <div class="modal glass-surface">
        <div class="modal-header">
          <div>
            <h3>Order #{{ selectedOrder?.id }}</h3>
            <span class="status-badge" :class="`status-${(selectedOrder?.status || '').toLowerCase().replace(/\s+/g, '-')}`">
              {{ (selectedOrder?.status || '').replace(/_/g, ' ').toUpperCase() }}
            </span>
          </div>
        </div>

        <div class="order-info-grid">
          <div class="info-block">
            <h4>Order Information</h4>
            <p><strong>Order Date:</strong> {{ formatDateTime(selectedOrder?.created_at) }}</p>
            <p><strong>Store:</strong> {{ selectedOrder?.store_name || 'N/A' }}</p>
            <p><strong>Shipping:</strong> {{ formatShippingMethod(selectedOrder?.shipping_method) }}</p>
          </div>

          <div class="info-block">
            <h4>Payment & Delivery</h4>
            <p><strong>Payment Method:</strong> {{ formatPaymentMethod(selectedOrder?.payment_method) }}</p>
            <p v-if="selectedOrder?.delivery_fee"><strong>Delivery Fee:</strong> {{ formatCurrency(selectedOrder.delivery_fee) }}</p>
            <p v-if="selectedOrder?.shipping_method === 'delivery' && selectedOrder?.preferred_delivery_date"><strong>Preferred Delivery Date:</strong> {{ formatDate(selectedOrder.preferred_delivery_date) }}</p>
            <p v-if="selectedOrder?.delivery_address" class="address-block">
              <strong>Delivery Address:</strong><br/>
              <span>{{ selectedOrder.delivery_address }}</span>
            </p>
          </div>
        </div>

        <div class="items-section">
          <h4>Order Items</h4>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
              <tbody>
                <tr v-if="loadingOrderDetails"><td colspan="4" class="empty">Loading items...</td></tr>
                <tr v-else v-for="it in selectedOrderItems" :key="it.id">
                  <td>{{ it.product_name || ('Product #' + it.product_id) }}</td>
                  <td class="qty">{{ it.quantity }}</td>
                  <td class="price">{{ formatCurrency(it.unit_price) }}</td>
                  <td class="price">{{ formatCurrency(it.subtotal) }}</td>
                </tr>
                <tr v-if="!loadingOrderDetails && !selectedOrderItems.length"><td colspan="4" class="empty">No items found</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="order-total">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>{{ formatCurrency(calculateOrderSubtotal()) }}</span>
          </div>
          <div class="total-row" v-if="selectedOrder?.delivery_fee && selectedOrder.delivery_fee > 0">
            <span>Delivery Fee:</span>
            <span>{{ formatCurrency(selectedOrder.delivery_fee) }}</span>
          </div>
          <div class="total-row amount-total">
            <span>Total Amount:</span>
            <span>{{ formatCurrency(selectedOrder?.total_amount || 0) }}</span>
          </div>
        </div>

        <div class="actions">
          <button class="ghost" @click="closeOrderDetails">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../services/api'
import loadGoogleMaps from '../services/googleMapsLoader'
import { BARANGAYS, splitAddress, joinAddress } from '../constants/barangays'
import { customerPanelFromPath, customerPathFromPanel } from '../services/routeMemory'
const API_ROOT = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')

const CALAPAN = { lat: 13.4117, lng: 121.1803 }

function extractBarangayFromAddress(address) {
  const text = String(address || '').trim()
  if (!text) return ''
  return text.split(',')[0].trim()
}

export default {
  name: 'CustomerDashboard',
  data(){
    const allowedPanels = ['dashboard', 'products', 'cart', 'purchaseHistory', 'settings', 'addressBook', 'storesMap', 'notifications', 'howToUse']
    const savedPanel = customerPanelFromPath(window.location.pathname)

    return {
      ordersCount: 0,
      totalSpent: 0,
      rewardPointsBalance: 0,
      store3SavingsBalance: 0,
      store3SavingsTotal: 0,
      notifications: [],
      notificationUnreadCount: 0,
      notificationsLoading: false,
      notificationPollTimer: null,
      orders: [],
      loading: false,
      activePanel: allowedPanels.includes(savedPanel) ? savedPanel : 'dashboard',
      allowedPanels,
      q: '',
      selectedStore: '',
      selectedCategory: '',
      sortBy: 'name',
      sortDir: 'asc',
      priceMin: null,
      priceMax: null,
      page: 1,
      pageSize: 12,
      products: [],
      storesOptions: [],
      barangays: BARANGAYS,
      quantities: {},
      profile: { full_name: '', phone: '', address: '', email: '' },
      profileBarangay: '',
      profileStreet: '',
      homeBarangay: '',
      homeStreet: '',
      workBarangay: '',
      workStreet: '',
      emailForm: { email: '', current_password: '' },
      passwordForm: { current_password: '', new_password: '', confirm_password: '' },
      showEmailEditor: false,
      showPasswordEditor: false,
      savingEmail: false,
      savingPassword: false,
      shippingMethod: 'pickup',
      showCheckout: false,
      checkoutForm: { full_name:'', phone:'', address:'', landmark:'', address_mode:'home', payment_method:'cod', shipping_method:'pickup', preferred_delivery_date: '', gcash_reference: '', points_to_redeem: 0 },
      checkoutEstimate: { subtotal: 0, delivery_fee: 0, discount_amount: 0, points_to_redeem: 0, points_earn_preview: 0, total_amount: 0 },
      useRewardPoints: false,
      estimatingFee: false,
      showOrderDetails: false,
      loadingOrderDetails: false,
      selectedOrder: null,
      selectedOrderItems: [],
      mapInstance: null,
      mapMarkers: [],
      mapInfoWindow: null,
      mapTypeId: 'roadmap',
      mapError: '',
      sidebarCollapsed: false,
      showUserMenu: false,
      viewMode: 'grid',
      advancedFiltersOpen: false,
      isDark: false,
      addressBook: {
        home_address: '',
        work_address: '',
        defaultType: 'profile'
      },
      savingAddressBook: false,
      landmarkEstimateTimer: null,
      pointsEstimateTimer: null,
      showGcashPayment: false,
      gcashSessionId: null,
      gcashPaymentUrl: null,
      gcashDeepLinkUrl: null,
      gcashQrCodeUrl: null,
      gcashPaymentStatus: 'pending',
      gcashPollingInterval: null,
      gcashPollingCount: 0,
      gcashMaxPollingAttempts: 120,
      pendingOrderId: null
    }
  },
  computed: {
    user(){
      return JSON.parse(localStorage.getItem('user'))
    },
    firstName(){
      const full = this.user?.full_name || 'Customer'
      return full.split(' ')[0] || full
    },
    cartCount(){ return this.$store.state.cart.length },
    cart(){ return this.$store.state.cart },
    total(){ return this.cart.reduce((s,i)=>s+i.unit_price*i.quantity,0) },
    variableWeightEstimate(){
      const items = this.cart.filter(item => this.isVariableWeightUnit(item.unit))
      if (!items.length) return null
      const minimum = items.reduce((sum, item) => {
        return sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
      }, 0)
      return {
        minimum,
        maximum: minimum + (items.length * 20)
      }
    },
    rewardPoints(){ return Math.max(0, Number(this.rewardPointsBalance || 0)) },
    pointsBalanceValue(){
      const rate = Number(this.checkoutEstimate?.redeem_peso_per_point || 1)
      return (Number(this.rewardPoints || 0) * rate).toFixed(2)
    },
    maxRedeemablePoints(){
      const bal = Number(this.rewardPoints || 0)
      const payable = Number(this.checkoutEstimate?.subtotal || 0) + Number(this.checkoutEstimate?.delivery_fee || 0)
      const capMoney = payable > 0 ? payable : Number(this.total || 0)
      const pct = Number(this.checkoutEstimate?.max_redeem_percent ?? 100)
      const maxByPercent = capMoney * (Math.min(100, Math.max(0, pct)) / 100)
      const redeemRate = Math.max(0.01, Number(this.checkoutEstimate?.redeem_peso_per_point || 1))
      return Math.max(0, Math.min(bal, Math.floor(maxByPercent / redeemRate)))
    },
    purchaseHistoryOrders(){
      return this.orders || []
    },
    derivedStoreId(){
      if(!this.cart.length) return 0
      const id = this.cart[0].store_owner_id
      return this.cart.every(i=>i.store_owner_id===id) ? id : 0
    },
    categories(){
      const cats = new Set(this.products.map(p=>p.category).filter(Boolean))
      return Array.from(cats).sort()
    },
    productsFiltered(){
      let arr = this.products
      if(this.selectedCategory) arr = arr.filter(p=>p.category===this.selectedCategory)
      const min = this.priceMin === null || this.priceMin === '' ? null : Number(this.priceMin)
      const max = this.priceMax === null || this.priceMax === '' ? null : Number(this.priceMax)
      if(Number.isFinite(min)) arr = arr.filter(p => Number(p.price || 0) >= min)
      if(Number.isFinite(max)) arr = arr.filter(p => Number(p.price || 0) <= max)
      const key = this.sortBy
      const dir = this.sortDir==='asc'?1:-1
      arr = [...arr].sort((a,b)=>{
        if(key==='popularity'){
          const ap = Number(a.sold_count || a.stock || 0)
          const bp = Number(b.sold_count || b.stock || 0)
          return (ap-bp) * -1
        }
        if(key==='rating'){
          const ar = Number(a.rating || 4)
          const br = Number(b.rating || 4)
          return (ar-br) * -1
        }
        const va = a[key] ?? ''
        const vb = b[key] ?? ''
        if(typeof va==='number' && typeof vb==='number') return (va-vb)*dir
        return String(va).localeCompare(String(vb)) * dir
      })
      return arr
    },
    pagedProducts(){
      const start = (this.page-1)*this.pageSize
      return this.productsFiltered.slice(start, start+this.pageSize)
    },
    totalPages(){
      return Math.max(1, Math.ceil(this.productsFiltered.length / this.pageSize))
    },
    todayDate(){
      return new Date().toISOString().slice(0,10)
    },
    isStore1DeliverySelected(){
      return Number(this.derivedStoreId) === 1 && this.checkoutForm.shipping_method === 'delivery'
    },
    homeAddressPreview(){
      return (this.getHomeBaseAddress() || '').trim()
    },
    homeBarangayValid(){
      const b = extractBarangayFromAddress(this.getHomeBaseAddress() || '')
      return !!(b && this.barangays.includes(b))
    },
    activeFilterChips(){
      const chips = []
      if(this.q) chips.push({ key:'q', label:`Search: ${this.q}` })
      if(this.selectedStore){
        const s = this.storesOptions.find(x=>String(x.id)===String(this.selectedStore))
        chips.push({ key:'store', label:`Store: ${s?.store_name || this.selectedStore}` })
      }
      if(this.selectedCategory) chips.push({ key:'cat', label:`Category: ${this.selectedCategory}` })
      if(this.sortBy && this.sortBy !== 'name') chips.push({ key:'sort', label:`Sort: ${this.sortBy}` })
      if(this.priceMin !== null && this.priceMin !== '') chips.push({ key:'priceMin', label:`From ₱${this.priceMin}` })
      if(this.priceMax !== null && this.priceMax !== '') chips.push({ key:'priceMax', label:`Up to ₱${this.priceMax}` })
      return chips
    }
  },
  watch: {
    shippingMethod(next){
      this.checkoutForm.shipping_method = next
      if(this.showCheckout){
        this.loadCheckoutEstimate()
      }
    },
    '$route'(to){
      const panel = to.meta?.panel || customerPanelFromPath(to.path)
      if (panel && this.allowedPanels.includes(panel) && panel !== this.activePanel) {
        this.activePanel = panel
        if (panel === 'storesMap') this.$nextTick(() => this.initMap())
        if (panel === 'notifications') this.loadNotifications()
      }
    }
  },
  methods: {
    handleLogout(){ this.$store.dispatch('logout'); this.$router.push('/customer/login') },
    handleOutside(evt){
      if(!this.showUserMenu) return
      const menu = this.$el?.querySelector('.avatar-menu')
      if(menu && !menu.contains(evt.target)) this.showUserMenu = false
    },
    toggleUserMenu(){ this.showUserMenu = !this.showUserMenu },
    setActive(id){
      if (!this.allowedPanels.includes(id)) return
      this.activePanel = id
      const target = customerPathFromPanel(id)
      if (this.$route.path !== target) {
        this.$router.push(target).catch(() => {})
      }
      if(id==='storesMap'){
        this.$nextTick(()=>this.initMap())
      }
      if(id==='notifications') this.loadNotifications()
      this.showUserMenu = false
    },
    restoreActivePanel(){
      const panel = this.$route.meta?.panel || customerPanelFromPath(this.$route.path)
      const next = this.allowedPanels.includes(panel) ? panel : 'dashboard'
      this.activePanel = next
      const target = customerPathFromPanel(next)
      if (this.$route.path === '/customer/dashboard' || !this.$route.meta?.panel) {
        if (this.$route.path !== target) this.$router.replace(target).catch(() => {})
      }
      if (next === 'storesMap') this.$nextTick(() => this.initMap())
    },
    async loadSummary(){
      try{
        const { data } = await api.get('/customer/summary')
        this.ordersCount = data.orders_count || 0
        this.totalSpent = data.total_spent || 0
        this.rewardPointsBalance = Number(data.reward_points ?? Math.floor(Number(data.total_spent || 0) / 20))
        this.store3SavingsBalance = Number(data.store3_savings_balance || 0)
        this.store3SavingsTotal = Number(data.store3_savings_total || 0)
      }catch(err){
        console.error('Failed to load summary', err)
      }
    },
    async loadNotifications(){
      this.notificationsLoading = this.notifications.length === 0
      try{
        const { data } = await api.get('/customer/notifications', { params: { limit: 50 } })
        this.notifications = Array.isArray(data?.notifications) ? data.notifications : []
        this.notificationUnreadCount = Number(data?.unread_count || 0)
      }catch(err){
        console.error('Failed to load notifications', err)
      }finally{
        this.notificationsLoading = false
      }
    },
    async markNotificationRead(notification){
      if(!notification || notification.is_read) return
      try{
        await api.post(`/customer/notifications/${notification.id}/read`)
        notification.is_read = 1
        this.notificationUnreadCount = Math.max(0, this.notificationUnreadCount - 1)
      }catch(err){
        console.error('Failed to mark notification as read', err)
      }
    },
    async markAllNotificationsRead(){
      try{
        await api.post('/customer/notifications/read-all')
        this.notifications = this.notifications.map(item => ({ ...item, is_read: 1 }))
        this.notificationUnreadCount = 0
      }catch(err){
        console.error('Failed to mark notifications as read', err)
      }
    },
    async loadOrders(){
      try{
        const { data } = await api.get('/customer/orders')
        this.orders = data || []
      }catch(err){
        console.error('Failed to load orders', err)
      }
    },
    async loadProducts(){
      try{
        const params = { q: this.q || '' }
        if(this.selectedStore) params.storeOwnerId = this.selectedStore
        const { data } = await api.get('/customer/products', { params })
        this.products = data || []
        this.quantities = Object.fromEntries(this.products.map(p=>[p.id, 1]))
        this.page = 1
      }catch(err){
        console.error('Failed to load products', err)
      }
    },
    async loadStores(){
      try{
        const { data } = await api.get('/customer/stores')
        this.storesOptions = data || []
        if(this.activePanel==='storesMap') this.initMap()
      }catch(err){
        console.error('Failed to load stores', err)
      }
    },
    async initMap(){
      this.mapError = ''
      const el = document.getElementById('storesMap')
      if(!el) return

      try{
        const maps = await loadGoogleMaps()

        if(!this.mapInstance){
          this.mapInstance = new maps.Map(el, {
            center: CALAPAN,
            zoom: 12,
            mapTypeId: this.mapTypeId,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true
          })
          this.mapInfoWindow = new maps.InfoWindow()
          this.mapMarkers = []
        } else {
          // Container may have been hidden; force resize when shown again
          maps.event.trigger(this.mapInstance, 'resize')
        }

        this.mapMarkers.forEach(m => m.setMap(null))
        this.mapMarkers = []

        const bounds = new maps.LatLngBounds()
        let count = 0

        for(const s of this.storesOptions){
          const lat = parseFloat(s.latitude)
          const lng = parseFloat(s.longitude)
          if(!Number.isFinite(lat) || !Number.isFinite(lng)) continue

          const position = { lat, lng }
          const marker = new maps.Marker({
            position,
            map: this.mapInstance,
            title: s.store_name || 'Store'
          })

          marker.addListener('click', () => {
            this.mapInfoWindow.setContent(
              `<div style="padding:4px 2px;max-width:220px">
                <strong>${s.store_name || 'Store'}</strong><br/>
                <span>${s.address || 'No address'}</span>
              </div>`
            )
            this.mapInfoWindow.open({ map: this.mapInstance, anchor: marker })
          })

          this.mapMarkers.push(marker)
          bounds.extend(position)
          count += 1
        }

        if(count === 1){
          this.mapInstance.setCenter(bounds.getCenter())
          this.mapInstance.setZoom(15)
        } else if(count > 1){
          this.mapInstance.fitBounds(bounds, 48)
        } else {
          this.mapInstance.setCenter(CALAPAN)
          this.mapInstance.setZoom(12)
        }
      } catch(err){
        console.error('Google Maps init failed', err)
        this.mapError = err.message || 'Failed to load Google Maps'
      }
    },
    switchMapType(){
      if(this.mapInstance) this.mapInstance.setMapTypeId(this.mapTypeId)
    },
    refreshStores(){ this.loadStores() },
    async loadAddressBook(){
      try{
        const { data } = await api.get('/customer/account/addresses')
        const row = data?.addresses || {}
        this.addressBook.home_address = row.home_address || ''
        this.addressBook.work_address = row.work_address || ''
        const homeParts = splitAddress(this.addressBook.home_address)
        this.homeBarangay = homeParts.barangay
        this.homeStreet = homeParts.details
        const workParts = splitAddress(this.addressBook.work_address)
        this.workBarangay = workParts.barangay
        this.workStreet = workParts.details
        const currentAddress = row.address || ''
        if(currentAddress && currentAddress === this.addressBook.home_address) this.addressBook.defaultType = 'home'
        else if(currentAddress && currentAddress === this.addressBook.work_address) this.addressBook.defaultType = 'work'
        else this.addressBook.defaultType = 'profile'
      }catch(err){
        console.error('Failed to load address book', err)
      }
    },
    async loadProfile(){
      try{
        const { data } = await api.get('/customer/account/profile')
        const user = data?.user
        if(!user) return
        this.$store.commit('SET_USER', user)
        localStorage.setItem('user', JSON.stringify(user))
        this.profile.full_name = user.full_name || ''
        this.profile.phone = user.phone || ''
        this.profile.address = user.address || ''
        this.profile.email = user.email || ''
        this.emailForm.email = ''
        this.emailForm.current_password = ''
        this.showEmailEditor = false
        this.showPasswordEditor = false
        const parts = splitAddress(this.profile.address)
        this.profileBarangay = parts.barangay
        this.profileStreet = parts.details
      }catch(err){
        console.error('Failed to load profile', err)
      }
    },
    addToCart(p, qty=1){
      this.$store.dispatch('addToCart', {
        product_id: p.id,
        quantity: this.isVariableWeightUnit(p.unit)
          ? Math.max(0.001, Number(qty) || 0.001)
          : 1,
        unit_price: Number(p.price) || 0,
        name: p.description || '—',
        unit: p.unit,
        store_owner_id: p.store_owner_id
      })
    },
    isVariableWeightUnit(unit){
      return /(^|[\s/.-])(kg|kgs|kilo|kilos|kilogram|kilograms|g|gram|grams|mg|milligram|lb|lbs|pound|pounds|oz|ounce|ounces)(?=$|[\s/.-])/i.test(String(unit || '').trim())
    },
    productById(id){
      return this.products.find(product => Number(product.id) === Number(id)) || null
    },
    decreaseQty(id){
      const current = Number(this.quantities[id] || 1)
      this.quantities[id] = Math.max(0.001, current - (this.isVariableWeightUnit(this.productById(id)?.unit) ? 0.001 : 1))
    },
    increaseQty(id){
      const current = Number(this.quantities[id] || 1)
      this.quantities[id] = Math.max(0.001, current + (this.isVariableWeightUnit(this.productById(id)?.unit) ? 0.001 : 1))
    },
    isOutOfStock(p){
      const s = p.stock
      if (s === null || s === undefined) return false
      return Number(s) <= 0
    },
    stockClass(p){
      if(this.isOutOfStock(p)) return 'stock-out'
      return Number(p.stock) <= 10 ? 'stock-low' : 'stock-ok'
    },
    stockLabel(p){
      if(this.isOutOfStock(p)) return 'Out of stock'
      return Number(p.stock) <= 10 ? 'Low stock' : 'In stock'
    },
    hasMarketPrice(p){
      const m = Number(p?.market_price)
      return Number.isFinite(m) && m > 0
    },
    setPage(p){ this.page = Math.max(1, Math.min(p, this.totalPages)) },
    update(it){
      const quantity = this.isVariableWeightUnit(it.unit) ? it.quantity : 1
      this.$store.dispatch('updateCartItem', { product_id: it.product_id, quantity })
    },
    remove(it){ this.$store.dispatch('updateCartItem', { product_id: it.product_id, quantity: 0 }) },
    validateCheckout(){
      const u = this.user || {}
      if(!u.full_name){ alert('Please set your full name in Profile'); return false }
      if(!u.phone){ alert('Please set your phone number in Profile'); return false }
      if(!u.address){ alert('Please provide your address in Profile'); return false }
      return true
    },
    getHomeBaseAddress(){
      const fromBook = String(this.addressBook.home_address || '').trim()
      if (fromBook) return fromBook
      return String(this.profile.address || this.user?.address || '').trim()
    },
    openCheckout(){
      if(!this.derivedStoreId){ alert('Cart must contain items from one store'); return }
      const u = this.user || {}
      this.checkoutForm.full_name = this.profile.full_name || u.full_name || ''
      this.checkoutForm.phone = this.profile.phone || u.phone || ''
      const home = this.getHomeBaseAddress()
      const barFromHome = extractBarangayFromAddress(home)
      if (home) {
        this.checkoutForm.address_mode = 'home'
        this.checkoutForm.address = this.barangays.includes(barFromHome) ? barFromHome : ''
      } else {
        this.checkoutForm.address_mode = 'custom'
        this.checkoutForm.address = ''
      }
      this.checkoutForm.landmark = ''
      this.checkoutForm.payment_method = 'cod'
      this.checkoutForm.shipping_method = this.shippingMethod
      this.checkoutForm.preferred_delivery_date = ''
      this.checkoutForm.gcash_reference = ''
      this.checkoutForm.points_to_redeem = 0
      this.useRewardPoints = false
      this.checkoutEstimate = {
        subtotal: Number(this.total || 0),
        delivery_fee: 0,
        discount_amount: 0,
        points_to_redeem: 0,
        points_earn_preview: 0,
        total_amount: Number(this.total || 0)
      }
      this.showCheckout = true
      this.loadCheckoutEstimate()
    },
    onUsePointsToggle(){
      if (!this.useRewardPoints) {
        this.checkoutForm.points_to_redeem = 0
      } else {
        this.checkoutForm.points_to_redeem = this.maxRedeemablePoints
      }
      this.loadCheckoutEstimate()
    },
    setRedeemPoints(n){
      this.useRewardPoints = true
      this.checkoutForm.points_to_redeem = Math.max(0, Math.min(this.maxRedeemablePoints, Math.floor(Number(n) || 0)))
      this.loadCheckoutEstimate()
    },
    onPointsRedeemInput(){
      clearTimeout(this.pointsEstimateTimer)
      const raw = Math.floor(Number(this.checkoutForm.points_to_redeem) || 0)
      this.checkoutForm.points_to_redeem = Math.max(0, Math.min(this.maxRedeemablePoints, raw))
      this.pointsEstimateTimer = setTimeout(() => this.loadCheckoutEstimate(), 250)
    },
    getDeliveryAddressString(){
      if (this.checkoutForm.shipping_method !== 'delivery') return ''
      const landmark = String(this.checkoutForm.landmark || '').trim()
      if (this.checkoutForm.address_mode === 'home') {
        const base = this.getHomeBaseAddress().trim()
        if (!base) return ''
        return landmark ? `${base}, ${landmark}` : base
      }
      const barangay = String(this.checkoutForm.address || '').trim()
      if (!barangay) return ''
      return landmark ? `${barangay}, ${landmark}` : barangay
    },
    onAddressModeChange(){
      if (this.checkoutForm.address_mode === 'home') {
        const home = this.getHomeBaseAddress()
        const b = extractBarangayFromAddress(home)
        this.checkoutForm.address = this.barangays.includes(b) ? b : ''
      } else {
        this.checkoutForm.address = ''
      }
      this.loadCheckoutEstimate()
    },
    onCheckoutLandmarkInput(){
      clearTimeout(this.landmarkEstimateTimer)
      this.landmarkEstimateTimer = setTimeout(() => this.loadCheckoutEstimate(), 350)
    },
    async loadCheckoutEstimate(){
      if(!this.cart.length) return
      this.estimatingFee = true
      try{
        const addrStr = this.getDeliveryAddressString()
        if(this.checkoutForm.shipping_method === 'delivery' && !addrStr){
          this.checkoutEstimate = {
            subtotal: Number(this.total || 0),
            delivery_fee: 0,
            discount_amount: 0,
            points_to_redeem: 0,
            points_earn_preview: 0,
            total_amount: Number(this.total || 0)
          }
          return
        }
        const items = this.cart.map(i=>({ product_id: i.product_id, quantity: i.quantity }))
        const pointsToRedeem = this.useRewardPoints ? Math.max(0, Math.floor(Number(this.checkoutForm.points_to_redeem) || 0)) : 0
        const { data } = await api.post('/customer/orders/estimate', {
          items,
          shipping_method: this.checkoutForm.shipping_method,
          address: this.checkoutForm.shipping_method === 'delivery' ? addrStr : undefined,
          points_to_redeem: pointsToRedeem
        })
        this.checkoutEstimate = {
          subtotal: Number(data?.subtotal || 0),
          delivery_fee: Number(data?.delivery_fee || 0),
          discount_amount: Number(data?.discount_amount || 0),
          points_to_redeem: Number(data?.points_to_redeem || 0),
          points_earn_preview: Number(data?.points_earn_preview || 0),
          points_enabled: data?.points_enabled !== false,
          earn_pesos_per_point: Number(data?.earn_pesos_per_point || 20),
          redeem_peso_per_point: Number(data?.redeem_peso_per_point || 1),
          max_redeem_percent: Number(data?.max_redeem_percent ?? 100),
          rewards_note: data?.rewards_note || '',
          total_amount: Number(data?.total_amount || 0)
        }
        if (data?.points_enabled === false) {
          this.useRewardPoints = false
          this.checkoutForm.points_to_redeem = 0
        }
        if (typeof data?.points_balance === 'number') {
          this.rewardPointsBalance = Number(data.points_balance)
        }
        if (this.useRewardPoints && Number(data?.points_to_redeem || 0) !== pointsToRedeem) {
          this.checkoutForm.points_to_redeem = Number(data.points_to_redeem || 0)
        }
      }catch(err){
        this.checkoutEstimate = {
          subtotal: Number(this.total || 0),
          delivery_fee: 0,
          discount_amount: 0,
          points_to_redeem: 0,
          points_earn_preview: 0,
          total_amount: Number(this.total || 0)
        }
        alert(err.response?.data?.message || 'Failed to calculate delivery fee')
      }finally{
        this.estimatingFee = false
      }
    },
    onCheckoutShippingChange(){
      this.shippingMethod = this.checkoutForm.shipping_method
      this.loadCheckoutEstimate()
    },
    onCheckoutBarangayChange(){
      if (this.checkoutForm.address) {
        this.checkoutForm.shipping_method = 'delivery'
        this.shippingMethod = 'delivery'
      }
      this.loadCheckoutEstimate()
    },
    async openOrderDetails(order){
      this.selectedOrder = order
      this.selectedOrderItems = []
      this.showOrderDetails = true
      this.loadingOrderDetails = true
      try{
        const { data } = await api.get(`/customer/orders/${order.id}/items`)
        this.selectedOrder = data?.order || order
        this.selectedOrderItems = data?.items || []
      }catch(err){
        alert(err.response?.data?.message || 'Failed to load purchased products')
      }finally{
        this.loadingOrderDetails = false
      }
    },
    closeOrderDetails(){
      this.showOrderDetails = false
      this.loadingOrderDetails = false
      this.selectedOrder = null
      this.selectedOrderItems = []
    },
    formatDateTime(dateString) {
      if (!dateString) return 'N/A'
      try {
        return new Date(dateString).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      } catch (e) {
        return dateString
      }
    },
    formatDate(value) {
      if (!value) return 'N/A'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    },
    formatShippingMethod(method) {
      const methods = {
        'delivery': 'Delivery',
        'pickup': 'Pickup',
        'dine_in': 'Dine In'
      }
      return methods[String(method || '').toLowerCase()] || 'N/A'
    },
    formatPaymentMethod(method) {
      const methods = {
        'cod': 'Cash',
        'gcash': 'GCash',
        'cash': 'Cash',
        'card': 'Card Payment'
      }
      return methods[String(method || '').toLowerCase()] || 'N/A'
    },
    calculateOrderSubtotal() {
      return this.selectedOrderItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)
    },
    async placeOrder(){
      if(!this.validateCheckout()) return
      if(!this.checkoutForm.full_name){ alert('Full name is required'); return }
      if(!this.checkoutForm.phone){ alert('Phone number is required'); return }
      if(this.checkoutForm.shipping_method==='delivery'){
        if(this.checkoutForm.address_mode === 'home'){
          if(!this.getHomeBaseAddress().trim()){ alert('Add a home address in Profile or Address Book, or choose Custom location.'); return }
          if(!this.homeBarangayValid){ alert('Your saved address must include a supported barangay (first part before a comma), or use Custom location and select a barangay.'); return }
        } else if(!this.checkoutForm.address){
          alert('Select a barangay for your custom drop-off location.')
          return
        }
      }

      if(this.checkoutForm.payment_method === 'gcash'){
        this.checkoutForm.payment_method = 'cod'
        alert('GCash is available soon. Please pay with Cash for now.')
        return
      }

      // For GCash payment, create order first with payment pending status
      if(this.checkoutForm.payment_method==='gcash' && Number(this.checkoutEstimate.total_amount || 0) > 0){
        await this.createOrderAndInitiateGcashPayment()
        return
      }

      // For COD (or fully points-covered orders), proceed with normal order creation
      this.loading = true
      try{
        const items = this.cart.map(i=>({ product_id: i.product_id, quantity: i.quantity }))
        const { data } = await api.post('/customer/orders', {
          items,
          shipping_method: this.checkoutForm.shipping_method,
          payment_method: this.checkoutForm.payment_method,
          address: this.getDeliveryAddressString(),
          preferred_delivery_date: this.checkoutForm.shipping_method === 'delivery' ? this.checkoutForm.preferred_delivery_date : null,
          points_to_redeem: this.useRewardPoints ? Math.max(0, Math.floor(Number(this.checkoutForm.points_to_redeem) || 0)) : 0
        })
        const discountNote = Number(data.discount_amount || 0) > 0
          ? ` (saved ${this.formatCurrency(data.discount_amount)} with points)`
          : ''
        alert('Order created: #' + data.id + discountNote)
        this.showCheckout = false
        this.$store.dispatch('clearCart')
        await this.loadSummary()
        await this.loadOrders()
      }catch(err){
        alert(err.response?.data?.message || 'Checkout failed')
      }finally{
        this.loading = false
      }
    },
    async createOrderAndInitiateGcashPayment(){
      this.loading = true
      try{
        const items = this.cart.map(i=>({ product_id: i.product_id, quantity: i.quantity }))
        const { data: orderData } = await api.post('/customer/orders', {
          items,
          shipping_method: this.checkoutForm.shipping_method,
          payment_method: 'gcash',
          address: this.getDeliveryAddressString(),
          preferred_delivery_date: this.checkoutForm.shipping_method === 'delivery' ? this.checkoutForm.preferred_delivery_date : null,
          points_to_redeem: this.useRewardPoints ? Math.max(0, Math.floor(Number(this.checkoutForm.points_to_redeem) || 0)) : 0
        })
        const orderId = orderData.id
        this.pendingOrderId = orderId
        const payAmount = Number(orderData.total_amount ?? this.checkoutEstimate.total_amount)

        if (payAmount <= 0) {
          alert('Order created: #' + orderId + ' (fully covered by reward points)')
          this.showCheckout = false
          this.$store.dispatch('clearCart')
          await this.loadSummary()
          await this.loadOrders()
          return
        }

        // Initiate GCash payment session
        const { data: paymentData } = await api.post('/gcash/initiate-payment', {
          orderId,
          amount: payAmount,
          storeId: this.derivedStoreId,
          customerName: this.checkoutForm.full_name,
          customerEmail: this.user?.email || 'customer@kadiwa.local',
          customerPhone: this.checkoutForm.phone
        })

        this.gcashSessionId = paymentData.data.sessionId
        this.gcashPaymentUrl = paymentData.data.paymentUrl
        this.gcashDeepLinkUrl = paymentData.data.deepLinkUrl || paymentData.data.paymentUrl
        this.gcashQrCodeUrl = paymentData.data.qrCodeUrl || this.buildGcashQrUrl(this.gcashDeepLinkUrl)
        this.gcashPaymentStatus = 'pending'
        this.gcashPollingCount = 0

        // Show payment modal and start polling
        this.showCheckout = false
        this.showGcashPayment = true
        this.startGcashPolling()
      }catch(err){
        alert(err.response?.data?.message || 'Failed to initiate payment')
      }finally{
        this.loading = false
      }
    },
    buildGcashQrUrl(payload){
      if(!payload) return null
      return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&ecc=M&data=${encodeURIComponent(payload)}`
    },
    openInGcash(){
      const url = this.gcashDeepLinkUrl || this.gcashPaymentUrl
      if(!url){
        alert('Payment link is not ready yet. Please wait a moment and try again.')
        return
      }
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      // Popup blockers return null — fall back to same-tab navigation
      if (!win) {
        window.location.href = url
      }
    },
    startGcashPolling(){
      // Poll every 2 seconds for payment confirmation
      this.gcashPollingInterval = setInterval(() => {
        this.pollGcashPaymentStatus()
      }, 2000)
    },
    async pollGcashPaymentStatus(){
      if(this.gcashPollingCount >= this.gcashMaxPollingAttempts){
        clearInterval(this.gcashPollingInterval)
        this.gcashPaymentStatus = 'failed'
        return
      }
      this.gcashPollingCount++
      try{
        const { data } = await api.get(`/gcash/verify-payment/${this.gcashSessionId}`)
        const status = data.data.status
        if(status === 'success'){
          clearInterval(this.gcashPollingInterval)
          this.gcashPaymentStatus = 'success'
          this.onGcashPaymentSuccess()
        } else if(status === 'failed' || status === 'cancelled'){
          clearInterval(this.gcashPollingInterval)
          this.gcashPaymentStatus = 'failed'
        }
      }catch(err){
        console.error('Polling error:', err)
      }
    },
    onGcashPaymentSuccess(){
      // Clear cart immediately so items don't linger after a successful pay
      this.$store.dispatch('clearCart')
      this.loadSummary()
      this.loadOrders()
      if (typeof this.setActive === 'function') {
        this.setActive('purchaseHistory')
      }
    },
    handleGcashReturnQuery(){
      const q = this.$route?.query || {}
      if (q.gcash !== 'paid') return
      this.$store.dispatch('clearCart')
      this.loadSummary()
      this.loadOrders()
      this.setActive('purchaseHistory')
      if (q.orderId) {
        alert('Order #' + q.orderId + ' paid successfully. Waiting for the store to process it.')
      }
      // Clean query so refresh doesn't re-alert
      this.$router.replace({ path: '/customer/dashboard/orders' }).catch(() => {})
    },
    completeGcashPayment(){
      this.showGcashPayment = false
      this.$store.dispatch('clearCart')
      this.loadSummary()
      this.loadOrders()
      if (typeof this.setActive === 'function') {
        this.setActive('purchaseHistory')
      }
      alert('Order #' + this.pendingOrderId + ' confirmed! Your payment has been processed.')
      this.gcashSessionId = null
      this.gcashPaymentUrl = null
      this.gcashDeepLinkUrl = null
      this.gcashQrCodeUrl = null
      this.pendingOrderId = null
    },
    retryGcashPayment(){
      clearInterval(this.gcashPollingInterval)
      this.showGcashPayment = false
      this.openCheckout()
    },
    cancelGcashPayment(){
      clearInterval(this.gcashPollingInterval)
      if(this.gcashSessionId && this.gcashPaymentStatus === 'pending'){
        api.post(`/gcash/cancel-payment/${this.gcashSessionId}`).catch(err=>console.error('Cancel error:', err))
      }
      this.showGcashPayment = false
      this.gcashSessionId = null
      this.gcashPaymentUrl = null
      this.gcashDeepLinkUrl = null
      this.gcashQrCodeUrl = null
      this.gcashPaymentStatus = 'pending'
      this.pendingOrderId = null
    },
    async saveProfile(){
      if (!this.profileBarangay) {
        alert('Please select your barangay')
        return
      }
      this.profile.address = joinAddress(this.profileBarangay, this.profileStreet)
      try{
        const { data } = await api.put('/customer/account/profile', {
          full_name: this.profile.full_name,
          phone: this.profile.phone,
          address: this.profile.address
        })
        if(data?.user){
          this.$store.commit('SET_USER', data.user)
          localStorage.setItem('user', JSON.stringify(data.user))
          this.profile.email = data.user.email || this.profile.email
          this.profile.address = data.user.address || this.profile.address
          const parts = splitAddress(this.profile.address)
          this.profileBarangay = parts.barangay
          this.profileStreet = parts.details
          this.checkoutForm.full_name = data.user.full_name || ''
          this.checkoutForm.phone = data.user.phone || ''
          this.checkoutForm.address = data.user.address || ''
          alert('Profile updated')
        } else {
          alert(data?.message || 'No changes')
        }
      } catch(err){
        alert(err.response?.data?.message || 'Failed to update profile')
      }
    },
    async saveEmail(){
      if(!this.emailForm.email || !this.emailForm.current_password){
        alert('Enter new email and current password')
        return
      }
      this.savingEmail = true
      try{
        const { data } = await api.put('/customer/account/email', {
          email: this.emailForm.email,
          current_password: this.emailForm.current_password
        })
        if(data?.user){
          this.$store.commit('SET_USER', data.user)
          localStorage.setItem('user', JSON.stringify(data.user))
          this.profile.email = data.user.email || ''
        }
        this.cancelEmailEditor()
        alert('Email updated')
      } catch(err){
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update email')
      } finally{
        this.savingEmail = false
      }
    },
    async savePassword(){
      if(!this.passwordForm.current_password || !this.passwordForm.new_password){
        alert('Enter current and new password')
        return
      }
      if(this.passwordForm.new_password !== this.passwordForm.confirm_password){
        alert('New password and confirmation do not match')
        return
      }
      this.savingPassword = true
      try{
        await api.put('/customer/account/password', {
          current_password: this.passwordForm.current_password,
          new_password: this.passwordForm.new_password
        })
        this.cancelPasswordEditor()
        alert('Password updated')
      } catch(err){
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update password')
      } finally{
        this.savingPassword = false
      }
    },
    maskedEmail(email) {
      const value = String(email || '').trim()
      if (!value || !value.includes('@')) return 'Not set'
      const [local, domain] = value.split('@')
      if (!local) return '••••@' + domain
      const visible = local.slice(0, Math.min(2, local.length))
      return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
    },
    toggleEmailEditor() {
      this.showEmailEditor = !this.showEmailEditor
      if (this.showEmailEditor) {
        this.showPasswordEditor = false
        this.emailForm = { email: '', current_password: '' }
      } else {
        this.cancelEmailEditor()
      }
    },
    togglePasswordEditor() {
      this.showPasswordEditor = !this.showPasswordEditor
      if (this.showPasswordEditor) {
        this.showEmailEditor = false
        this.passwordForm = { current_password: '', new_password: '', confirm_password: '' }
      } else {
        this.cancelPasswordEditor()
      }
    },
    cancelEmailEditor() {
      this.showEmailEditor = false
      this.emailForm = { email: '', current_password: '' }
    },
    cancelPasswordEditor() {
      this.showPasswordEditor = false
      this.passwordForm = { current_password: '', new_password: '', confirm_password: '' }
    },
    async saveAddressBook(){
      this.savingAddressBook = true
      try{
        this.addressBook.home_address = joinAddress(this.homeBarangay, this.homeStreet)
        this.addressBook.work_address = joinAddress(this.workBarangay, this.workStreet)
        let selectedAddress = this.profile.address || ''
        if(this.addressBook.defaultType === 'home') selectedAddress = this.addressBook.home_address || ''
        if(this.addressBook.defaultType === 'work') selectedAddress = this.addressBook.work_address || ''

        const { data } = await api.put('/customer/account/addresses', {
          address: selectedAddress,
          home_address: this.addressBook.home_address,
          work_address: this.addressBook.work_address
        })

        if(data?.user){
          this.$store.commit('SET_USER', data.user)
          localStorage.setItem('user', JSON.stringify(data.user))
          this.profile.address = data.user.address || ''
          const parts = splitAddress(this.profile.address)
          this.profileBarangay = parts.barangay
          this.profileStreet = parts.details
          this.checkoutForm.address = data.user.address || ''
        }
        alert('Address book updated')
      }catch(err){
        alert(err.response?.data?.message || 'Failed to update address book')
      }finally{
        this.savingAddressBook = false
      }
    },
    removeFilter(key){
      if(key==='q') this.q = ''
      if(key==='store') this.selectedStore = ''
      if(key==='cat') this.selectedCategory = ''
      if(key==='sort') this.sortBy = 'name'
      if(key==='priceMin') this.priceMin = null
      if(key==='priceMax') this.priceMax = null
      this.loadProducts()
    },
    clearProductFilters(){
      this.q = ''
      this.selectedStore = ''
      this.selectedCategory = ''
      this.sortBy = 'name'
      this.priceMin = null
      this.priceMax = null
      this.page = 1
      this.loadProducts()
    },
    formatCurrency(v){
      const n = Number(v || 0)
      return n.toLocaleString(undefined,{ style:'currency', currency:'PHP' })
    },
    toPublicImageUrl(imageUrl){
      if (!imageUrl) return ''
      if (/^https?:\/\//i.test(imageUrl)) return imageUrl
      return `${API_ROOT}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
    }
  },
  created(){
    this.restoreActivePanel()
  },
  mounted(){
    this.restoreActivePanel()
    this.loadSummary()
    this.loadNotifications()
    this.loadOrders()
    this.loadStores()
    this.loadProducts()
    this.loadProfile()
    this.loadAddressBook()
    this.handleGcashReturnQuery()
    const u = this.user || {}
    this.profile.full_name = u.full_name || ''
    this.profile.phone = u.phone || ''
    this.profile.address = u.address || ''
    this.profile.email = u.email || ''
    this.emailForm.email = ''
    this.emailForm.current_password = ''
    this.showEmailEditor = false
    this.showPasswordEditor = false
    this.notificationPollTimer = setInterval(this.loadNotifications, 30000)
    const parts = splitAddress(this.profile.address)
    this.profileBarangay = parts.barangay
    this.profileStreet = parts.details
    document.addEventListener('click', this.handleOutside)
  },
  beforeUnmount(){
    document.removeEventListener('click', this.handleOutside)
    clearTimeout(this.landmarkEstimateTimer)
    clearTimeout(this.pointsEstimateTimer)
    clearInterval(this.gcashPollingInterval)
    clearInterval(this.notificationPollTimer)
  }
}
</script>

<style scoped>
:root { color-scheme: light; }

.dashboard {
  min-height: 100vh;
  background: radial-gradient(circle at top right, #f3f7eb 0%, #edf3e4 45%, #e8efe0 100%);
  color: #1f2430;
  font-family: Inter, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif;
}

.dashboard.dark {
  color: #eef2ff;
  background: radial-gradient(circle at top right, #1a2318 0%, #131a12 50%, #0e140d 100%);
}

.glass-surface {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.46);
  box-shadow: 0 14px 40px rgba(28, 35, 58, 0.08);
  border-radius: 20px;
}

.dashboard.dark .glass-surface {
  background: rgba(22, 27, 39, 0.74);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 14px 40px rgba(0,0,0,0.45);
}

.glass-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,255,255,0.45));
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 12px 28px rgba(28,35,58,0.08);
}

.dashboard.dark .glass-card {
  background: linear-gradient(135deg, rgba(29,35,50,0.72), rgba(22,27,39,0.5));
  border: 1px solid rgba(255,255,255,0.07);
}

.topbar {
  position: fixed;
  top: 12px;
  left: 16px;
  right: 16px;
  z-index: 60;
  height: 72px;
  display: grid;
  grid-template-columns: 220px 1fr auto;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}

.brand { display:flex; align-items:center; gap:10px; font-weight:700; }
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
}
.brand-text { font-size: 1rem; }

.top-search-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.76);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 999px;
  padding: 0 14px;
  height: 46px;
}
.dashboard.dark .top-search-wrap {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
}
.top-search {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  color: inherit;
  font-size: 0.95rem;
}

.top-actions { display:flex; align-items:center; gap:10px; }
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  background: rgba(255,255,255,0.75);
  box-shadow: 0 6px 18px rgba(28,35,58,0.08);
}
.dashboard.dark .icon-btn { background: rgba(255,255,255,0.1); color:#f3f6ff; }

.cart-btn,
.notification-btn { position: relative; }
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: #fff;
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 700;
}

.avatar-menu {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  background: rgba(255,255,255,0.7);
}
.dashboard.dark .avatar-menu { background: rgba(255,255,255,0.09); }
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
}
.avatar-name { font-size: 0.87rem; max-width: 110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.caret { font-size: 11px; opacity: .8; }

.dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 180px;
  display: grid;
  padding: 8px;
  gap: 4px;
}
.dropdown button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
}
.dropdown button:hover { background: rgba(78,125,50,0.14); }

.body-wrap {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 20px;
  padding: 100px 16px 20px;
}

.sidebar {
  position: sticky;
  top: 96px;
  align-self: start;
  padding: 12px;
  min-height: calc(100vh - 120px);
  transition: width 260ms cubic-bezier(.2,.8,.2,1);
}
.sidebar.collapsed { width: 72px; }
.collapse-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: none;
  margin-bottom: 10px;
  cursor: pointer;
  background: rgba(255,255,255,0.72);
}
.dashboard.dark .collapse-btn { background: rgba(255,255,255,0.09); color: #fff; }

.menu { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
.nav-label.short { display: none; }
.menu li {
  display:flex;
  align-items:center;
  gap:10px;
  padding: 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 600;
  transition: all 220ms cubic-bezier(.2,.8,.2,1);
}
.how-to-panel {
  display: grid;
  gap: 18px;
}
.how-to-header h2 { margin: 0 0 6px; }
.how-to-lead {
  margin: 0;
  opacity: 0.78;
  max-width: 42rem;
}
.how-to-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.how-to-steps li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  align-items: start;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255,255,255,0.55);
  border: 1px solid rgba(0,0,0,0.06);
}
.dashboard.dark .how-to-steps li {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.08);
}
.step-num {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
}
.how-to-steps h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.how-to-steps p {
  margin: 0;
  line-height: 1.45;
  opacity: 0.86;
  font-size: 0.94rem;
}
.how-to-tips {
  padding: 14px;
  border-radius: 14px;
  background: rgba(124,179,66,0.1);
  border: 1px solid rgba(78,125,50,0.18);
}
.how-to-tips h3 { margin: 0 0 8px; font-size: 0.95rem; }
.how-to-tips ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  line-height: 1.4;
}
.how-to-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.how-to-actions .primary,
.how-to-actions .ghost {
  min-height: 44px;
}

.notifications-panel { display: grid; gap: 14px; }
.notifications-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.notifications-head h2 { margin-bottom: 4px; }
.notification-list { display: grid; gap: 8px; }
.notification-card {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 14px;
  background: rgba(255,255,255,0.46);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dashboard.dark .notification-card {
  border-color: rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
}
.notification-card.unread {
  border-color: rgba(78,125,50,0.38);
  background: rgba(124,179,66,0.1);
}
.notification-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(124,179,66,0.16);
  font-size: 1.2rem;
}
.notification-copy { display: grid; gap: 3px; min-width: 0; }
.notification-copy > span { line-height: 1.4; }
.notification-copy small { opacity: 0.65; }
.unread-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #5d9634;
}
.notification-empty {
  padding: 32px 12px;
  text-align: center;
  opacity: 0.65;
}

@media (max-width: 900px) {
  .how-to-actions {
    flex-direction: column;
  }
  .how-to-actions .primary,
  .how-to-actions .ghost {
    width: 100%;
  }
  .how-to-steps li {
    grid-template-columns: 36px 1fr;
    padding: 12px;
  }
  .step-num {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
}
.menu li:hover {
  transform: translateX(2px);
  box-shadow: 0 8px 18px rgba(78,125,50,0.16);
  background: rgba(78,125,50,0.1);
}
.menu li.active {
  color: #fff;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  box-shadow: 0 12px 24px rgba(78,125,50,0.34);
}
.menu li.disabled {
  opacity: .45;
  cursor: not-allowed;
}
.mi { width: 20px; text-align:center; }

.main { display: grid; gap: 16px; }
.welcome {
  display:flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
}
.welcome h1 { margin:0 0 4px; font-size: 1.6rem; }
.welcome p { margin:0; opacity: .75; }
.welcome-actions { display:flex; gap:8px; }

.analytics {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px,1fr));
  gap: 12px;
}
.metric {
  padding: 14px;
  border-radius: 16px;
}
.metric h3 { margin:0; font-size: .86rem; opacity: .72; font-weight: 600; }
.metric strong { display:block; margin-top:8px; font-size: 1.28rem; }
.metric small { display:block; margin-top:6px; opacity:.75; font-size:.74rem; }

.panel { padding: 16px; }
.panel-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.panel h2 { margin:0 0 10px; font-size:1.2rem; }
.subtle { opacity:.72; font-size:.84rem; }

.product-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mobile-filter-toggle { display: none; }
.product-search-row {
  margin-bottom: 10px;
}
.product-search-row .ai-search {
  min-height: 46px;
}
.filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.42);
}
.dashboard.dark .filters {
  border-color: rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.035);
}
.filter-control {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 700;
}
.filter-control .select,
.filter-control .input { width: 100%; }
.price-filter { grid-column: span 2; }
.price-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
}
.price-range .input {
  width: 100%;
  min-width: 0;
  max-width: none;
}
.clear-filters {
  align-self: end;
  min-height: 44px;
  border: 1px solid rgba(78,125,50,0.2);
  border-radius: 12px;
  background: rgba(124,179,66,0.1);
  color: #466936;
  cursor: pointer;
  font-weight: 700;
}
.field { display:flex; align-items:center; gap:8px; }
.price-range-row { margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
.price-label { color: var(--muted); font-size: .9rem; }
.ai-search {
  padding: 0 10px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.1);
  background: rgba(255,255,255,0.76);
}
.dashboard.dark .ai-search {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.12);
}

.chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.chip {
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  background: rgba(108,153,74,0.16);
  color: #355e2a;
}
.dashboard.dark .chip { color:#d7efc3; background: rgba(124,179,66,0.24); }

.input, .select {
  width: 100%;
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.12);
  padding: 0 12px;
  outline: none;
  background: rgba(255,255,255,0.86);
  color: inherit;
}
.dashboard.dark .input,
.dashboard.dark .select {
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.08);
}

.view-toggle {
  display:flex;
  gap:6px;
  border: 1px solid rgba(0,0,0,.1);
  border-radius: 12px;
  padding: 4px;
}
.dashboard.dark .view-toggle { border-color: rgba(255,255,255,.14); }
.view-toggle button {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.view-toggle button.active {
  color: #fff;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 12px;
}
@media (min-width: 1500px){
  .product-grid { grid-template-columns: repeat(5, minmax(0,1fr)); }
}
.product-list { display:grid; gap:10px; }

.product-card {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.84);
  transition: transform 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms cubic-bezier(.2,.8,.2,1);
}
.dashboard.dark .product-card {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.05);
}
.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 30px rgba(17, 25, 45, 0.14);
}
.product-card.list { display:grid; grid-template-columns: 220px 1fr; }
.thumb {
  height: 150px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(124,179,66,0.24), rgba(176,122,46,0.12));
}
.thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-card.list .thumb { height:100%; min-height: 130px; }
.wishlist {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  background: rgba(255,255,255,0.88);
  cursor: pointer;
}
.content { padding: 12px; }
.content h3 {
  margin: 0 0 6px;
  font-size: .98rem;
}
.price {
  font-weight: 800;
  color: #3F7D20;
  margin-bottom: 6px;
}
.price-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin-bottom: 6px;
}
.price-row .price,
.price-row .market-price {
  margin-bottom: 0;
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.15;
}
.price-label-tag {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #6b7c62;
}
.price .price-value { color: #3F7D20; font-weight: 800; font-size: 1em; }
.market-price .price-value {
  color: #7a8694;
  font-weight: 700;
  text-decoration: line-through;
  font-size: 0.92em;
}
.stock { font-size: .84rem; margin-bottom: 6px; }
.stock-ok { color: #128f5b; }
.stock-low { color: #c77700; }
.stock-out { color: #c93838; }
.stars { letter-spacing: 1px; opacity: .8; margin-bottom: 8px; font-size: .86rem; }
.row { display:flex; gap: 8px; align-items:center; }

.qty-pill {
  display:flex;
  align-items:center;
  gap: 4px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.12);
  padding: 2px;
}
.dashboard.dark .qty-pill { border-color: rgba(255,255,255,.16); }
.qty-pill button {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  background: rgba(0,0,0,0.06);
}
.dashboard.dark .qty-pill button { background: rgba(255,255,255,0.12); color: #fff; }
.qty {
  width: 48px;
  text-align: center;
  border: none;
  background: transparent;
  color: inherit;
}
.fixed-quantity {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 8px;
  color: #5f7256;
  font-weight: 600;
  white-space: nowrap;
}

button { transition: all 220ms cubic-bezier(.2,.8,.2,1); }
.primary,
.add-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  box-shadow: 0 10px 18px rgba(78,125,50,0.3);
}
.primary:hover,
.add-btn:hover { filter: brightness(1.04); transform: translateY(-1px); }
.primary:disabled,
.add-btn:disabled { opacity: .56; cursor: not-allowed; box-shadow:none; }
.ghost {
  border: 1px solid rgba(0,0,0,.14);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  padding: 9px 12px;
  cursor: pointer;
}
.dashboard.dark .ghost { border-color: rgba(255,255,255,.18); }

.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 12px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  text-align: left;
  white-space: nowrap;
}
.dashboard.dark .table th,
.dashboard.dark .table td { border-bottom-color: rgba(255,255,255,0.08); }

.clickable-row { cursor: pointer; }
.clickable-row:hover { background: rgba(78,125,50,0.08); }
.order-meta { justify-content: flex-start; margin: 6px 0 12px; }

.panel-summary {
  margin-top: 12px;
  display:flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items:center;
  justify-content: flex-end;
}

.map { height: 420px; border-radius: 16px; overflow: hidden; }
.map-error {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff1f1;
  border: 1px solid #f4c8c8;
  color: #b42318;
  font-size: 13px;
}
.map-actions { margin-top: 10px; display:flex; gap: 8px; align-items:center; flex-wrap: wrap; }
.hint { opacity: .75; }

/* GCash payment gateway (Open in GCash + QR) */
.gcash-gateway-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) 0 env(safe-area-inset-left, 0);
}
.gcash-gateway-overlay .modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(15, 23, 42, 0.55);
}
.gcash-gateway {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 100vw;
  max-height: min(92dvh, 100%);
  margin: auto 0 0;
  background: #eef1f5;
  border-radius: 20px 20px 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 32px rgba(0,0,0,.18);
  pointer-events: auto;
}
.gcash-gateway-header {
  background: #007dff;
  color: #fff;
  padding: 12px 14px 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.gcash-logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff;
  color: #007dff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.95rem;
  line-height: 1;
  flex-shrink: 0;
}
.gcash-logo-text {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.01em;
}
.gcash-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  flex-shrink: 0;
}
.gcash-close:hover { background: rgba(255,255,255,.12); }
.gcash-gateway-body {
  padding: 14px 14px calc(18px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
}
.gcash-pay-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px 16px 16px;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0,0,0,.06);
}
.gcash-amount {
  margin: 0 0 4px;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
  line-height: 1.15;
}
.gcash-secure-copy {
  margin: 0 0 16px;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #475569;
}
.gcash-order-meta {
  margin: 0 0 12px;
  font-size: 0.86rem;
  color: #64748b;
}
.gcash-open-btn {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 14px;
  padding: 15px 18px;
  min-height: 52px;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  background: #007dff;
  color: #fff;
  touch-action: manipulation;
}
.gcash-open-btn:hover:not(:disabled) { background: #005ce6; }
.gcash-open-btn:disabled { opacity: 0.55; cursor: default; }
.gcash-qr-details {
  margin-top: 16px;
  text-align: left;
  border-top: 1px solid #e8edf3;
  padding-top: 4px;
}
.gcash-qr-summary {
  list-style: none;
  cursor: pointer;
  color: #007dff;
  font-size: 0.92rem;
  font-weight: 600;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.gcash-qr-summary::-webkit-details-marker { display: none; }
.gcash-qr-summary::after {
  content: '';
  width: 0.45em;
  height: 0.45em;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  margin-top: -0.2em;
  transition: transform 0.15s ease;
}
.gcash-qr-details[open] .gcash-qr-summary::after {
  transform: rotate(-135deg);
  margin-top: 0.2em;
}
.gcash-or-copy {
  margin: 4px 0 12px;
  color: #64748b;
  font-size: 0.86rem;
  line-height: 1.4;
  text-align: center;
}
.gcash-qr-wrap {
  display: flex;
  justify-content: center;
  min-height: 180px;
  align-items: center;
}
.gcash-qr {
  width: min(200px, 72vw);
  height: auto;
  aspect-ratio: 1;
  display: block;
  border-radius: 8px;
  background: #fff;
}
.gcash-qr-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #666;
  font-size: 0.9rem;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(0, 125, 255, 0.2);
  border-top-color: #007dff;
  border-radius: 50%;
  animation: gcash-spin 0.8s linear infinite;
}
@keyframes gcash-spin { to { transform: rotate(360deg); } }
.gcash-poll-hint {
  margin: 14px 0 4px;
  font-size: 0.78rem;
  color: #94a3b8;
}
.gcash-cancel-link {
  border: 0;
  background: transparent;
  color: #64748b;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.88rem;
  min-height: 44px;
  padding: 8px 12px;
  width: 100%;
}
.payment-success,
.payment-failed,
.payment-cancelled {
  text-align: center;
  display: grid;
  gap: 10px;
  padding: 20px 14px 14px;
  background: #fff;
  border-radius: 16px;
}
.payment-success h4,
.payment-failed h4,
.payment-cancelled h4 {
  margin: 0;
  font-size: 1.15rem;
}
.payment-success p,
.payment-failed p,
.payment-cancelled p {
  margin: 0;
  color: #475569;
  font-size: 0.92rem;
  line-height: 1.45;
}
.gcash-result-btn {
  width: 100%;
  min-height: 48px;
  margin-top: 6px;
}
.gcash-result-actions {
  margin-top: 6px;
  flex-direction: column;
  align-items: stretch;
}
.gcash-result-actions .primary,
.gcash-result-actions .ghost {
  width: 100%;
  min-height: 48px;
}
.success-icon,
.failed-icon,
.cancelled-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  font-weight: 700;
}
.success-icon { background: rgba(18,143,91,0.15); color: #128f5b; }
.failed-icon { background: rgba(201,56,56,0.12); color: #c93838; }
.cancelled-icon { background: rgba(0,0,0,0.08); color: #666; }
.order-id { font-weight: 700; color: #355e2a; }
.gcash-info {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 12px;
}
.gcash-info p { margin: 4px 0 0; font-size: 0.9rem; opacity: 0.85; }
.gcash-icon { font-size: 1.4rem; line-height: 1; }
.gcash-soon {
  margin-top: 8px;
  border: 1px dashed rgba(0, 95, 230, 0.35);
  background: rgba(0, 95, 230, 0.06);
}
.gcash-soon .gcash-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #007dff;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 800;
}
.gcash-soon strong { color: #005ce6; }

.points-redeem {
  margin-top: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
  border-radius: 12px;
}
.points-redeem-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  align-items: baseline;
}
.points-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  min-height: 44px;
  cursor: pointer;
}
.points-toggle input {
  width: 18px;
  height: 18px;
}
.points-controls {
  display: grid;
  gap: 8px;
}
.points-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.points-quick .ghost {
  min-height: 40px;
  flex: 1 1 auto;
}

@media (max-width: 900px) {
  .points-redeem-head {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (min-width: 768px) {
  .gcash-gateway-overlay {
    padding: 24px;
    align-items: center;
  }
  .gcash-gateway {
    width: min(100%, 420px);
    max-width: 420px;
    margin: auto;
    border-radius: 16px;
    max-height: min(90vh, 680px);
  }
  .gcash-gateway-body {
    padding: 18px 16px 22px;
  }
  .gcash-pay-card {
    padding: 28px 22px 22px;
  }
  .gcash-amount {
    font-size: 2rem;
  }
  .gcash-secure-copy {
    font-size: 0.95rem;
  }
  .gcash-open-btn {
    border-radius: 999px;
  }
  /* Desktop: QR is primary alternate — keep it open and visible */
  .gcash-qr-details {
    border-top: none;
    padding-top: 0;
  }
  .gcash-qr-details[open] .gcash-qr-summary,
  .gcash-qr-summary {
    display: none;
  }
  .gcash-qr-details {
    display: block;
  }
  .gcash-qr-details > *:not(summary) {
    display: block;
  }
  .gcash-or-copy {
    margin: 22px 0 14px;
    font-size: 0.95rem;
  }
  .gcash-qr-wrap { min-height: 220px; }
  .gcash-qr {
    width: 220px;
    height: 220px;
  }
  .gcash-result-actions {
    flex-direction: row;
    justify-content: center;
  }
  .gcash-result-actions .primary,
  .gcash-result-actions .ghost {
    width: auto;
  }
  .gcash-result-btn {
    width: auto;
    justify-self: center;
  }
  .gcash-cancel-link { width: auto; }
}

.pagination {
  margin-top: 12px;
  display:flex;
  align-items:center;
  justify-content:center;
  gap: 10px;
}

.empty { text-align:center; opacity:.72; padding: 16px; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8,12,18,0.55);
  z-index: 70;
}
.modal {
  position: fixed;
  z-index: 80;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: min(900px, calc(100vw - 24px));
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 16px;
}
.modal h3 { margin: 0 0 10px; }

.home-address-preview {
  margin: 10px 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
}
.home-address-preview .preview-label {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.75;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.home-address-preview .preview-text {
  margin: 8px 0 0;
  line-height: 1.55;
  font-size: 14px;
}
.home-address-preview .address-warn {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: #c0392b;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid rgba(0,0,0,0.08);
}
.modal-header h3 {
  margin: 0;
  font-size: 22px;
}

.status-badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 24px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status-pending { background: #ffeaa7; color: #d63031; }
.status-on-the-way { background: #a29bfe; color: #fff; }
.status-delivered { background: #55efc4; color: #00b894; }
.status-pickup { background: #74b9ff; color: #0984e3; }
.status-completed { background: #81ecec; color: #00b894; }

.order-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin: 20px 0;
  padding: 16px;
  background: rgba(0,0,0,0.02);
  border-radius: 12px;
}
.info-block {
  padding-left: 16px;
  border-left: 4px solid #7CB342;
}
.info-block h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #2a3a24;
}
.info-block p {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
}
.info-block strong {
  color: #1a1a1a;
  display: inline-block;
  min-width: 140px;
  font-weight: 600;
}
.address-block {
  margin-top: 12px !important;
  font-weight: 500;
}
.address-block span {
  display: block;
  margin-top: 6px;
  font-weight: 400;
  line-height: 1.6;
  color: #555;
}

.items-section {
  margin: 20px 0;
}
.items-section h4 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
  padding-bottom: 8px;
  border-bottom: 2px solid #7CB342;
}
.items-section .table {
  width: 100%;
  border-collapse: collapse;
}
.items-section .table th,
.items-section .table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.items-section .table th {
  background: rgba(124, 179, 66, 0.08);
  font-weight: 600;
  color: #2a3a24;
  font-size: 13px;
}
.items-section .table td.qty,
.items-section .table td.price {
  text-align: right;
}
.items-section .table tbody tr:hover {
  background: rgba(0,0,0,0.02);
}

.order-total {
  background: rgba(124, 179, 66, 0.08);
  border-radius: 12px;
  padding: 16px;
  margin: 20px 0;
  border-left: 4px solid #7CB342;
}
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 14px;
}
.total-row:last-child {
  border-bottom: none;
}
.total-row span:first-child {
  color: #555;
  font-weight: 500;
}
.total-row span:last-child {
  font-weight: 600;
  color: #2a3a24;
  text-align: right;
  min-width: 100px;
}
.total-row.amount-total {
  border-top: 2px solid #7CB342;
  padding-top: 12px;
  margin-top: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #2a3a24;
}

.form { display:grid; gap: 10px; }
.settings-subhead { margin: 22px 0 8px; color: #355e2a; font-size: 16px; }
.form label { display:grid; gap: 6px; font-size: .92rem; }

.settings-panel {
  max-width: 920px;
}
.settings-header h2 {
  margin: 0;
}
.settings-lead {
  margin: 6px 0 0;
  color: #5f7256;
  font-size: 0.95rem;
}
.settings-grid {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}
.settings-card {
  border: 1px solid rgba(78, 125, 50, 0.16);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  padding: 16px;
  box-shadow: 0 8px 20px rgba(56, 92, 35, 0.06);
}
.dashboard.dark .settings-card {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}
.settings-card-wide {
  max-width: 640px;
}
.settings-card-head h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #2f5a23;
}
.dashboard.dark .settings-card-head h3 { color: #d7efc3; }
.settings-card-head p {
  margin: 4px 0 0;
  color: #6a7b60;
  font-size: 0.88rem;
}
.settings-form {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  max-width: 560px;
}
.settings-form label {
  display: grid;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #48603b;
}
.dashboard.dark .settings-form label { color: #c9d8bd; }
.settings-form .input,
.settings-form .select {
  font-weight: 500;
}
.settings-form .input:disabled {
  opacity: 0.72;
  background: rgba(0, 0, 0, 0.04);
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.settings-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.security-summary {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(78, 125, 50, 0.08);
  border: 1px solid rgba(78, 125, 50, 0.12);
}
.security-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.security-row span {
  color: #6a7b60;
  font-size: 0.86rem;
}
.security-row strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
  color: #355e2a;
}
.dashboard.dark .security-row strong { color: #d7efc3; }
.security-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.security-toggle.open {
  border-color: rgba(78, 125, 50, 0.45);
  background: rgba(78, 125, 50, 0.1);
}
.security-editor {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(78, 125, 50, 0.14);
}
.security-hint {
  margin: 0;
  font-size: 0.88rem;
  color: #6a7b60;
}
.settings-actions .primary {
  min-width: 140px;
  width: auto;
  padding: 10px 18px;
}
.actions { margin-top: 12px; display:flex; justify-content:flex-end; gap: 8px; }

@media (max-width: 1200px){
  .filters { grid-template-columns: 1fr 1fr; }
  .analytics { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .product-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .price-range-row { flex-wrap: wrap; }
  .price-range { flex-wrap: wrap; }
  .order-info-grid { grid-template-columns: 1fr; }
}

@media (max-width: 980px){
  .product-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .modal { width: min(600px, calc(100vw - 24px)); }
  .product-card.list { grid-template-columns: 160px 1fr; }
}

@media (max-width: 900px){
  .dashboard {
    overflow-x: hidden;
    padding-top: env(safe-area-inset-top, 0px);
  }
  .topbar {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    left: auto;
    right: auto;
    margin: 8px 10px 0;
    width: auto;
    padding: 8px 10px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    height: auto;
    min-height: 56px;
    border-radius: 16px;
  }
  .brand { gap: 0; }
  .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .brand-text,
  .avatar-name { display: none; }
  .top-actions { gap: 6px; flex-shrink: 0; }
  .icon-btn {
    width: 40px;
    height: 40px;
  }
  .avatar-menu {
    padding: 4px;
  }
  .top-search-wrap {
    grid-column: auto;
    grid-row: auto;
    min-width: 0;
    height: 40px;
    padding: 0 10px;
  }
  .top-search {
    font-size: 0.88rem;
  }
  .body-wrap {
    display: block;
    padding: 12px 12px calc(96px + env(safe-area-inset-bottom, 0px));
  }
  .sidebar {
    position: fixed;
    left: 10px;
    right: 10px;
    top: auto;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    z-index: 55;
    padding: 8px 6px;
    min-height: 0;
    height: auto;
    width: auto;
    overflow: visible;
    border-radius: 18px;
  }
  .collapse-btn { display: none; }
  .menu {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    width: 100%;
  }
  .menu li {
    flex: 1 1 0;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    min-width: 0;
    min-height: 52px;
    padding: 6px 4px;
    border-radius: 14px;
    text-align: center;
  }
  .menu li.logout-item { display: none; }
  .menu li.mobile-secondary { display: none; }
  .nav-label.long { display: none !important; }
  .nav-label.short {
    display: block;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .menu li .mi { width: auto; font-size: 1.15rem; line-height: 1; }
  .product-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
  .product-card.list {
    grid-template-columns: 1fr;
  }
  .product-card.list .thumb {
    height: 160px;
    min-height: 160px;
  }
  .analytics {
    grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 8px;
  }
  .metric {
    padding: 12px;
  }
  .metric h3 { font-size: 0.78rem; }
  .metric strong { font-size: 1.05rem; }
  .welcome {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 14px;
  }
  .welcome h1 { font-size: 1.2rem; }
  .welcome p { font-size: 0.9rem; }
  .welcome-actions { width: 100%; display: flex; flex-wrap: wrap; gap: 8px; }
  .welcome-actions .primary,
  .welcome-actions .ghost { flex: 1 1 auto; min-height: 44px; }
  .notifications-head { flex-direction: column; }
  .notifications-head .ghost { width: 100%; min-height: 44px; }
  .notification-card {
    grid-template-columns: 38px minmax(0, 1fr) auto;
    gap: 10px;
  }
  .panel-head {
    align-items: center;
  }
  .product-head-actions {
    gap: 6px;
  }
  .mobile-filter-toggle {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid rgba(78,125,50,0.18);
    border-radius: 12px;
    background: rgba(255,255,255,0.65);
    color: #446336;
    font-weight: 700;
  }
  .mobile-filter-toggle.active {
    color: #fff;
    background: linear-gradient(135deg, #7CB342, #4E7D32);
  }
  .mobile-filter-toggle span {
    min-width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(255,255,255,0.22);
    font-size: 0.72rem;
  }
  .product-search-row .ai-search {
    min-height: 48px;
    border-radius: 14px;
  }
  .filters {
    display: none;
    grid-template-columns: 1fr 1fr;
    padding: 12px;
    gap: 10px;
  }
  .filters.open { display: grid; }
  .price-filter { grid-column: 1 / -1; }
  .clear-filters {
    grid-column: 1 / -1;
    min-height: 44px;
  }
  .price-range-row { align-items: stretch; flex-direction: column; }
  .price-range { width: 100%; }
  .price-range .input { width: 100%; min-width: 0; max-width: none; }
  .row { flex-wrap: wrap; }
  .qty-pill button {
    width: 36px;
    height: 36px;
  }
  .wishlist {
    width: 40px;
    height: 40px;
  }
  .add-btn { flex: 1 1 100%; min-height: 44px; }
  .panel-summary {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }
  .panel-summary .primary,
  .panel-summary .ghost { width: 100%; min-height: 44px; }
  .actions {
    flex-wrap: wrap;
  }
  .actions .primary,
  .actions .ghost { flex: 1 1 auto; min-height: 44px; }

  /* Card-style tables on mobile */
  .table-wrap {
    overflow-x: visible;
  }
  .table {
    min-width: 0 !important;
    width: 100%;
  }
  .table thead { display: none; }
  .table tbody,
  .table tr,
  .table td {
    display: block;
    width: 100%;
  }
  .table tr {
    margin-bottom: 10px;
    padding: 12px;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 14px;
    background: rgba(255,255,255,0.55);
  }
  .dashboard.dark .table tr {
    border-color: rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
  }
  .table td {
    padding: 4px 0;
    border-bottom: none;
    white-space: normal;
  }
  .table td::before {
    content: attr(data-label);
    display: block;
    font-size: 0.72rem;
    opacity: 0.65;
    margin-bottom: 2px;
    font-weight: 600;
  }
  .table td:not([data-label])::before,
  .table td[data-label=""]::before { display: none; }
  .table td[colspan] {
    text-align: center;
    padding: 16px 8px;
  }
  .table td[colspan]::before { display: none; }
  .table td:empty { display: none; }
  .items-section .table { min-width: 0 !important; }
  .modal {
    width: min(95vw, calc(100vw - 16px));
    padding: 16px;
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
  }
  .order-info-grid { grid-template-columns: 1fr; }
  .info-block strong { display: block; min-width: unset; }
  .map { height: 260px; }
  .settings-subhead { margin-top: 18px; }
  .field-row { grid-template-columns: 1fr; }
  .settings-form { max-width: 100%; }
  .settings-actions .primary { width: 100%; min-height: 44px; }
  .panel { padding: 14px; }
}

@media (max-width: 420px){
  .product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .product-card { border-radius: 14px; }
  .product-card .thumb { height: 105px; }
  .product-card .content { padding: 8px; }
  .product-card .content h3 {
    min-height: 2.4em;
    margin-bottom: 4px;
    font-size: 0.82rem;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .product-card .price { font-size: 0.88rem; margin-bottom: 4px; }
  .product-card .price-row { gap: 4px 8px; margin-bottom: 4px; }
  .product-card .price-label-tag { font-size: 0.58rem; }
  .product-card .market-price .price-value { font-size: 0.78rem; }
  .product-card .stock { font-size: 0.72rem; margin-bottom: 5px; }
  .product-card .stars { display: none; }
  .product-card .row { gap: 6px; }
  .product-card .qty-pill {
    width: 100%;
    justify-content: space-between;
  }
  .product-card .qty-pill button {
    width: 34px;
    height: 34px;
  }
  .product-card .qty { width: 34px; }
  .product-card .add-btn {
    min-height: 40px;
    padding: 8px 6px;
    font-size: 0.78rem;
  }
  .analytics { grid-template-columns: 1fr; }
  .panel-head { flex-wrap: wrap; }
  .product-head-actions {
    width: 100%;
    justify-content: space-between;
  }
  .topbar {
    margin-left: 8px;
    margin-right: 8px;
    gap: 6px;
    padding: 6px 8px;
  }
  .top-search-wrap { height: 38px; }
  .icon-btn {
    width: 38px;
    height: 38px;
  }
  .body-wrap { padding-left: 8px; padding-right: 8px; }
  .sidebar { left: 8px; right: 8px; }
  .nav-label.short { font-size: 9px; }
  .welcome h1 { font-size: 1.1rem; }
}
</style>

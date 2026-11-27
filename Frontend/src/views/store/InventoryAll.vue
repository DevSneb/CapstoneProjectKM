<template>
	<div>
		<h2>Inventory • All</h2>

		<div class="toolbar">
			<button class="primary" type="button" @click="openAddModal">Add Product</button>
		</div>

		<teleport to="body">
			<div
				v-if="showAddForm"
				class="add-product-overlay"
				@click.self="closeAddModal"
			>
				<div
					class="modal glass-surface"
					role="dialog"
					aria-modal="true"
					aria-labelledby="add-product-title"
					@click.stop
				>
					<div class="modal-head">
						<h3 id="add-product-title">Add Product</h3>
						<button type="button" class="icon-close" aria-label="Close" @click="closeAddModal">×</button>
					</div>

					<form class="form" @submit.prevent="createProduct">
						<div class="form-scroll">
							<label class="full">Product name
								<input class="input" v-model.trim="form.name" placeholder="Product name" required />
							</label>
							<label>Price
								<input class="input" type="number" min="0.01" step="0.01" v-model.number="form.price" placeholder="0.00" required />
							</label>
							<label>Stock
								<input class="input" type="number" min="0" step="1" v-model.number="form.stock" placeholder="0" required />
							</label>
							<label>Cost
								<input class="input" type="number" min="0" step="0.01" v-model.number="form.cost" placeholder="0.00" />
							</label>
							<label>SRP
								<input class="input" type="number" min="0" step="0.01" v-model.number="form.srp" placeholder="0.00" />
							</label>
							<label>SRP (VAT)
								<input class="input" type="number" min="0" step="0.01" v-model.number="form.srp_vat" placeholder="0.00" />
							</label>
							<label>Unit
								<select class="select" v-model="form.unit" required>
									<option disabled value="">Select unit</option>
									<option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option>
									<option value="__other__">Others</option>
								</select>
							</label>
							<label v-if="form.unit === '__other__'" class="full">Specify unit
								<input class="input" v-model.trim="form.unit_other" placeholder="Specify unit" required />
							</label>
							<label>Category
								<select class="select" v-model="form.category" required>
									<option disabled value="">Select category</option>
									<option v-for="c in categoryOptions" :key="c" :value="c">{{ c }}</option>
									<option value="__other__">Others</option>
								</select>
							</label>
							<label v-if="form.category === '__other__'" class="full">Specify category
								<input class="input" v-model.trim="form.category_other" placeholder="Specify category" required />
							</label>
							<label>Status
								<select class="select" v-model="form.status">
									<option value="active">active</option>
									<option value="inactive">inactive</option>
								</select>
							</label>
							<label class="full">Image (optional)
								<input class="input file-input" type="file" accept="image/*" @change="onImageSelected" />
								<small class="hint">PNG/JPG/WEBP/GIF, max 2MB</small>
							</label>
							<label class="full">Description
								<textarea class="input textarea" v-model.trim="form.description" placeholder="Description" required></textarea>
							</label>
						</div>

						<div class="actions">
							<button type="button" class="ghost" @click="closeAddModal">Cancel</button>
							<button class="primary" type="submit" :disabled="saving">
								{{ saving ? 'Saving...' : 'Save Product' }}
							</button>
						</div>
					</form>
				</div>
			</div>
		</teleport>

		<inventory-table ref="inventoryTable" mode="all"/>
	</div>
</template>
<script>
import api from '../../services/api'
import InventoryTable from './_InventoryTable.vue'
const UNIT_OPTIONS = ['PC/S', 'KG/S', 'LT/S']
const CATEGORY_OPTIONS = ['LOWLAND', 'HIGHLAND', 'FRUITS', 'RICE', 'EGGS (pc)', 'SEAFOOD', 'PORK', 'BEEF', 'CHICKEN', 'OTHER PRODUCTS']

function emptyForm() {
	return {
		name: '',
		price: null,
		stock: null,
		cost: null,
		srp: null,
		srp_vat: null,
		unit: '',
		unit_other: '',
		category: '',
		category_other: '',
		description: '',
		status: 'active',
		image_data_url: null
	}
}

export default {
	components:{ InventoryTable },
	data() {
		return {
			unitOptions: UNIT_OPTIONS,
			categoryOptions: CATEGORY_OPTIONS,
			showAddForm: false,
			saving: false,
			form: emptyForm()
		}
	},
	methods: {
		lockBodyScroll(lock) {
			document.body.style.overflow = lock ? 'hidden' : ''
		},
		openAddModal() {
			this.form = emptyForm()
			this.showAddForm = true
			this.lockBodyScroll(true)
		},
		closeAddModal() {
			this.showAddForm = false
			this.form = emptyForm()
			this.lockBodyScroll(false)
		},
		async onImageSelected(event) {
			const file = event.target?.files?.[0]
			if (!file) {
				this.form.image_data_url = null
				return
			}
			if (!file.type.startsWith('image/')) {
				alert('Please select a valid image file.')
				event.target.value = ''
				this.form.image_data_url = null
				return
			}
			if (file.size > 2 * 1024 * 1024) {
				alert('Image is too large. Maximum size is 2MB.')
				event.target.value = ''
				this.form.image_data_url = null
				return
			}
			this.form.image_data_url = await this.readAsDataUrl(file)
		},
		readAsDataUrl(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(reader.result)
				reader.onerror = () => reject(new Error('Failed to read image file'))
				reader.readAsDataURL(file)
			})
		},
		async createProduct() {
			try {
				const resolvedUnit = this.form.unit === '__other__' ? (this.form.unit_other || '').trim() : this.form.unit
				const resolvedCategory = this.form.category === '__other__' ? (this.form.category_other || '').trim() : this.form.category
				if (!resolvedUnit) {
					alert('Please select a unit or specify one in Others.')
					return
				}
				if (!resolvedCategory) {
					alert('Please select a category or specify one in Others.')
					return
				}
				const toOptionalNumber = (value) => {
					if (value === null || value === '' || typeof value === 'undefined') return null
					const n = Number(value)
					return Number.isFinite(n) ? n : null
				}
				const cost = toOptionalNumber(this.form.cost)
				const srp = toOptionalNumber(this.form.srp)
				const srpVat = toOptionalNumber(this.form.srp_vat)
				if (cost !== null && cost < 0) {
					alert('Cost must be a non-negative number.')
					return
				}
				if (srp !== null && srp < 0) {
					alert('SRP must be a non-negative number.')
					return
				}
				if (srpVat !== null && srpVat < 0) {
					alert('SRP (VAT) must be a non-negative number.')
					return
				}
				this.saving = true
				await api.post('/store/products', {
					name: this.form.name,
					price: Number(this.form.price),
					stock: Number(this.form.stock || 0),
					cost,
					srp,
					srp_vat: srpVat,
					unit: resolvedUnit,
					category: resolvedCategory,
					description: this.form.description || null,
					status: this.form.status,
					image_data_url: this.form.image_data_url || null
				})

				this.closeAddModal()
				if (this.$refs.inventoryTable?.refreshRows) {
					await this.$refs.inventoryTable.refreshRows()
				}
			} catch (err) {
				const backendErrors = err.response?.data?.errors
				const backendMessage = Array.isArray(backendErrors) && backendErrors.length
					? backendErrors.map((e) => e.msg).join(', ')
					: err.response?.data?.message
				alert(backendMessage || 'Failed to add product')
			} finally {
				this.saving = false
			}
		}
	},
	beforeUnmount() {
		this.lockBodyScroll(false)
	}
}
</script>

<style scoped>
.toolbar { margin-bottom: 10px; }

.add-product-overlay {
	position: fixed;
	inset: 0;
	z-index: 2000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
	background: rgba(8, 12, 18, 0.55);
	box-sizing: border-box;
	overflow: auto;
	-webkit-overflow-scrolling: touch;
}

.glass-surface {
	background: rgba(255, 255, 255, 0.96);
	backdrop-filter: blur(14px);
	-webkit-backdrop-filter: blur(14px);
	border: 1px solid rgba(255, 255, 255, 0.46);
	box-shadow: 0 14px 40px rgba(28, 35, 58, 0.16);
}

.modal {
	width: min(520px, 100%);
	max-height: min(90dvh, 90vh);
	display: flex;
	flex-direction: column;
	border-radius: 16px;
	overflow: hidden;
	margin: auto;
}

.modal-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 18px 20px 10px;
	flex-shrink: 0;
}

.modal h3 {
	margin: 0;
	color: #1f2a1c;
	font-size: 1.25rem;
}

.icon-close {
	border: none;
	background: transparent;
	font-size: 28px;
	line-height: 1;
	cursor: pointer;
	color: #48603b;
	padding: 0 4px;
}

.form {
	display: flex;
	flex-direction: column;
	min-height: 0;
	flex: 1;
}

.form-scroll {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
	padding: 0 20px 8px;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	flex: 1;
	min-height: 0;
}

.form-scroll label {
	display: grid;
	gap: 6px;
	font-size: 0.92rem;
	color: #2a3a24;
}

.form-scroll label.full {
	grid-column: 1 / -1;
}

.input, .select {
	width: 100%;
	min-height: 42px;
	border-radius: 12px;
	border: 1px solid rgba(0,0,0,0.12);
	padding: 0 12px;
	outline: none;
	background: rgba(255,255,255,0.86);
	box-sizing: border-box;
	font: inherit;
	color: inherit;
}

.textarea {
	min-height: 84px;
	padding: 10px 12px;
	resize: vertical;
}

.file-input {
	padding: 8px 12px;
	min-height: auto;
}

.hint {
	color: #6f7d67;
	font-size: 12px;
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 20px 18px;
	border-top: 1px solid rgba(0,0,0,0.06);
	background: #fff;
	flex-shrink: 0;
}

.primary {
	border: none;
	border-radius: 12px;
	padding: 10px 14px;
	color: #fff;
	cursor: pointer;
	background: linear-gradient(135deg, #7CB342, #4E7D32);
	box-shadow: 0 10px 18px rgba(78,125,50,0.3);
	font-weight: 600;
}

.primary:disabled {
	opacity: 0.56;
	cursor: not-allowed;
	box-shadow: none;
}

.ghost {
	border: 1px solid rgba(0,0,0,.14);
	border-radius: 12px;
	background: transparent;
	color: inherit;
	padding: 9px 12px;
	cursor: pointer;
}

@media (max-width: 640px) {
	.add-product-overlay {
		align-items: flex-end;
		padding: 0;
	}
	.modal {
		width: 100%;
		max-height: min(92dvh, 92vh);
		border-radius: 16px 16px 0 0;
		margin: 0;
	}
	.form-scroll {
		grid-template-columns: 1fr;
	}
	.actions {
		flex-wrap: wrap;
		padding-bottom: max(18px, env(safe-area-inset-bottom));
	}
	.actions .primary,
	.actions .ghost {
		flex: 1 1 auto;
		min-height: 44px;
	}
}
</style>

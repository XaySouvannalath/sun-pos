import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api } from '@/api'
import type { Category, Product, Promotion, Station, StockMove } from '@/types'

export const useCatalogStore = defineStore('catalog', () => {
  const categories = ref<Category[]>([])
  const products = ref<Product[]>([])
  const stockMoves = ref<StockMove[]>([])
  /** Kitchen, bar and other places where orders are prepared. */
  const stations = ref<Station[]>([])
  const promotions = ref<Promotion[]>([])

  const byId = computed(() => new Map(products.value.map((p) => [p.id, p])))
  const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const activeProducts = computed(() => products.value.filter((p) => p.active))
  const lowStock = computed(() =>
    products.value.filter((p) => p.active && p.stock !== null && p.stock <= p.lowStockAt),
  )

  async function load() {
    ;[categories.value, products.value, stations.value, promotions.value] = await Promise.all([
      api.categories.list(),
      api.products.list(),
      api.stations.list(),
      api.promotions.list(),
    ])
  }

  async function savePromotion(p: Promotion) {
    const { id, ...body } = p
    const saved = id ? await api.promotions.update(id, body) : await api.promotions.create(body)
    const i = promotions.value.findIndex((x) => x.id === saved.id)
    if (i >= 0) promotions.value[i] = saved
    else promotions.value.push(saved)
    return saved
  }

  async function removePromotion(id: string) {
    await api.promotions.remove(id)
    promotions.value = promotions.value.filter((x) => x.id !== id)
  }

  async function saveStations(list: Partial<Station>[]) {
    stations.value = await api.stations.save(list)
    // Categories sent to a removed station were changed on the server.
    categories.value = await api.categories.list()
  }

  async function refreshProducts() {
    products.value = await api.products.list()
  }

  function replaceProduct(p: Product) {
    const i = products.value.findIndex((x) => x.id === p.id)
    if (i >= 0) products.value[i] = p
    else products.value.push(p)
  }

  /** Barcode or SKU lookup from the loaded catalog (instant, for scanners). */
  function findByCode(code: string): Product | undefined {
    const c = code.trim().toLowerCase()
    if (!c) return undefined
    return activeProducts.value.find(
      (p) => p.barcode.toLowerCase() === c || p.sku.toLowerCase() === c,
    )
  }

  /** A blank product for the editor. An empty id means it has not been saved yet. */
  function newProduct(): Product {
    return {
      id: '',
      name: '',
      categoryId: categories.value[0]?.id ?? '',
      price: 0,
      cost: 0,
      sku: `SKU-${String(products.value.length + 1).padStart(3, '0')}`,
      barcode: '',
      emoji: '🍽️',
      stock: null,
      lowStockAt: 5,
      active: true,
      options: [],
    }
  }

  async function saveProduct(p: Product): Promise<Product> {
    const { id, ...body } = p
    const saved = id ? await api.products.update(id, body) : await api.products.create(body)
    replaceProduct(saved)
    return saved
  }

  async function removeProduct(id: string) {
    await api.products.remove(id)
    products.value = products.value.filter((p) => p.id !== id)
  }

  async function saveCategory(c: Category): Promise<Category> {
    const { id, ...body } = c
    const saved = id ? await api.categories.update(id, body) : await api.categories.create(body)
    const i = categories.value.findIndex((x) => x.id === saved.id)
    if (i >= 0) categories.value[i] = saved
    else categories.value.push(saved)
    return saved
  }

  /** Returns an error message (e.g. the category still has products), or null on success. */
  async function removeCategory(id: string): Promise<string | null> {
    try {
      await api.categories.remove(id)
      categories.value = categories.value.filter((c) => c.id !== id)
      return null
    } catch (e) {
      if (e instanceof ApiError) return e.message
      throw e
    }
  }

  async function adjustStock(productId: string, delta: number, reason: string) {
    const { product, move } = await api.stock.adjust({ productId, delta, reason })
    replaceProduct(product)
    stockMoves.value.unshift(move)
  }

  async function loadMoves(limit = 40) {
    stockMoves.value = await api.stock.movements({ limit })
  }

  return {
    categories,
    products,
    stockMoves,
    stations,
    saveStations,
    promotions,
    savePromotion,
    removePromotion,
    byId,
    categoryById,
    activeProducts,
    lowStock,
    load,
    refreshProducts,
    findByCode,
    newProduct,
    saveProduct,
    removeProduct,
    saveCategory,
    removeCategory,
    adjustStock,
    loadMoves,
  }
})

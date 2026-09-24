import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { seedCategories, seedProducts } from '@/data/seed'
import { clone, uid } from '@/utils/pos'
import type { Category, Product, StockMove } from '@/types'

export const useCatalogStore = defineStore('catalog', () => {
  const categories = persisted<Category[]>('categories', () => clone(seedCategories))
  const products = persisted<Product[]>('products', () => clone(seedProducts))
  const stockMoves = persisted<StockMove[]>('stock-moves', () => [])

  const byId = computed(() => new Map(products.value.map((p) => [p.id, p])))
  const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const activeProducts = computed(() => products.value.filter((p) => p.active))
  const lowStock = computed(() =>
    products.value.filter((p) => p.active && p.stock !== null && p.stock <= p.lowStockAt),
  )

  function findByCode(code: string): Product | undefined {
    const c = code.trim().toLowerCase()
    if (!c) return undefined
    return activeProducts.value.find(
      (p) => p.barcode.toLowerCase() === c || p.sku.toLowerCase() === c,
    )
  }

  function saveProduct(p: Product) {
    const i = products.value.findIndex((x) => x.id === p.id)
    if (i >= 0) products.value[i] = p
    else products.value.push(p)
  }

  function removeProduct(id: string) {
    products.value = products.value.filter((p) => p.id !== id)
  }

  function newProduct(): Product {
    return {
      id: uid(),
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

  function saveCategory(c: Category) {
    const i = categories.value.findIndex((x) => x.id === c.id)
    if (i >= 0) categories.value[i] = c
    else categories.value.push(c)
  }

  function removeCategory(id: string): string | null {
    if (products.value.some((p) => p.categoryId === id))
      return 'Move or delete the products in this category first'
    categories.value = categories.value.filter((c) => c.id !== id)
    return null
  }

  /** Change stock for a tracked product and log the movement. */
  function adjustStock(productId: string, delta: number, reason: string, by: string) {
    const p = byId.value.get(productId)
    if (!p || p.stock === null || delta === 0) return
    p.stock = p.stock + delta
    stockMoves.value.unshift({ id: uid(), at: Date.now(), productId, delta, reason, by })
    if (stockMoves.value.length > 1000) stockMoves.value.length = 1000
  }

  function reset() {
    categories.value = clone(seedCategories)
    products.value = clone(seedProducts)
    stockMoves.value = []
  }

  return {
    categories,
    products,
    stockMoves,
    byId,
    categoryById,
    activeProducts,
    lowStock,
    findByCode,
    saveProduct,
    removeProduct,
    newProduct,
    saveCategory,
    removeCategory,
    adjustStock,
    reset,
  }
})

import { useFetch } from '@/hooks/use-fetch'
import { db } from '@/lib/api'

/** Daily rows of one shop, oldest first. */
export function useShopDaily(shopId) {
  return useFetch(
    () => (shopId ? db(`/shopDailyMetrics?shopId=${encodeURIComponent(shopId)}&_sort=date&_order=asc`) : Promise.resolve([])),
    [shopId],
  )
}

/** Request persistent storage to prevent iOS from evicting IndexedDB and localStorage data */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    const persisted = await navigator.storage.persisted()
    if (persisted) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

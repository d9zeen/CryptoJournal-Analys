import { supabase } from '@/lib/supabase'

const BUCKET = 'screenshots'
const MAX_SIDE = 1920

/** Сжимает картинку в браузере (WebP, при отсутствии поддержки — JPEG), чтобы экономить место. */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await toBlob('image/webp', 0.82)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob('image/jpeg', 0.85)
  if (!jpeg) throw new Error('compress failed')
  return jpeg
}

/** Загружает скриншот сделки. Путь: {user_id}/{trade_id}/{случайное имя}.{ext} */
export async function uploadScreenshot(userId: string, tradeId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${tradeId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
  if (error) throw error
  return path
}

/** Удалить файлы из хранилища (ошибки не критичны: запись в базе уже удалена). */
export async function deleteScreenshots(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
  }
}

/** Временные ссылки на приватные файлы (1 час): путь → ссылка. */
export async function screenshotUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl)
  return out
}


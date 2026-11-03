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

/** Загружает скриншот сделки. Путь: {user_id}/{trade_id}.{ext} */
export async function uploadScreenshot(userId: string, tradeId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${tradeId}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type })
  if (error) throw error
  return path
}

export async function deleteScreenshot(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}

/** Временная ссылка на приватный файл (1 час). */
export async function screenshotUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

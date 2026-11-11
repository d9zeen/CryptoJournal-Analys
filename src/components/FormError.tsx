import { Alert } from '@/components/ui/Alert'

/** Ошибка формы плавно выезжает (grid-rows 0fr → 1fr, utility rows-open); новая ошибка — снова выезжает (key) */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div key={message} className="rows-open">
      <div className="min-h-0 overflow-hidden">
        <Alert tone="error">{message}</Alert>
      </div>
    </div>
  )
}

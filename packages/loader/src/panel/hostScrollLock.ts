// Fullscreen-панель перекрывает весь экран — фоновая страница хоста не должна
// скроллиться под ней. На iOS Safari одного overflow:hidden на body недостаточно
// (bounce/rubber-band скроллит страницу насквозь) — нужны ещё html и блокировка
// touchmove с passive:false.
export class HostScrollLock {
  private saved: { html: string; body: string } | null = null
  private blockTouchMove: ((e: TouchEvent) => void) | null = null

  lock(): void {
    if (this.saved !== null) return
    this.saved = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    }
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    this.blockTouchMove = (e: TouchEvent) => e.preventDefault()
    document.addEventListener('touchmove', this.blockTouchMove, { passive: false })
  }

  unlock(): void {
    if (this.saved === null) return
    document.documentElement.style.overflow = this.saved.html
    document.body.style.overflow = this.saved.body
    this.saved = null

    if (this.blockTouchMove) {
      document.removeEventListener('touchmove', this.blockTouchMove)
      this.blockTouchMove = null
    }
  }
}

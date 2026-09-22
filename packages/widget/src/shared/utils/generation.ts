/**
 * Поколение: сигнал, который гаснет, когда начинается следующее поколение или текущее
 * закрывают. Замена счётчику «снимок id → сравнить после await»: снимок — это `signal`,
 * сравнение — `signal.aborted`, а сам сигнал можно отдать в `fetch`/`sleep`, и они оборвутся.
 */
export class Generation {
  private controller = new AbortController()

  /** Гасит текущее поколение и начинает новое. */
  begin(): AbortSignal {
    this.controller.abort()
    this.controller = new AbortController()

    return this.controller.signal
  }

  /** Гасит текущее поколение, нового не начиная: до `begin()` сигнал остаётся погашенным. */
  end(): void {
    this.controller.abort()
  }

  /** Сигнал текущего поколения — снимок без смены поколения. */
  get signal(): AbortSignal {
    return this.controller.signal
  }
}

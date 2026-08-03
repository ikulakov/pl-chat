import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SystemMessage } from './SystemMessage'

describe('SystemMessage', () => {
  it('подставляет параметры в переведённую плашку', () => {
    // до выноса перевода в рендер это проверял маппер (content.body содержал имя);
    // теперь склейка ключа с params живёт здесь, и без теста она осталась бы непокрытой
    render(
      <SystemMessage
        itemId="sys1"
        label={{ source: 'i18n', key: 'system.operatorJoinedHuman', params: { name: 'Оля' } }}
      />,
    )

    expect(screen.getByText(/Оля/)).toBeInTheDocument()
  })

  it('серверный текст выводится как есть, без обращения к словарю', () => {
    render(
      <SystemMessage
        itemId="sys2"
        label={{ source: 'literal', body: 'Ищем оператора' }}
      />,
    )

    expect(screen.getByText('Ищем оператора')).toBeInTheDocument()
  })
})

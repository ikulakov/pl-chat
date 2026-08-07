import styles from './QuickReplies.module.css'

interface Props {
  rows: string[][]
  lastRow?: string
  onSelect?: (label: string) => void
}

export function QuickReplies({ rows, lastRow, onSelect }: Props) {
  return (
    <div className={styles.wrap}>
      {rows.map((row, i) => (
        <div
          key={i}
          className={styles.row}
        >
          {row.map((label) => (
            <button
              key={label}
              className={styles.chip}
              onClick={() => onSelect?.(label)}
            >
              {label}
            </button>
          ))}
        </div>
      ))}
      {lastRow && (
        <button
          className={styles.chipFull}
          onClick={() => onSelect?.(lastRow)}
        >
          {lastRow}
        </button>
      )}
    </div>
  )
}

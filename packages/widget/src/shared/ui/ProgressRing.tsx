import styles from './ProgressRing.module.css'

interface Props {
  percent: number
  size?: number
}

const STROKE = 1.5

export function ProgressRing({ percent, size = 24 }: Props) {
  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(percent, 0), 100)

  return (
    <svg
      className={styles.ring}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        className={styles.track}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={STROKE}
      />
      <circle
        className={styles.value}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={STROKE}
        strokeDasharray={circumference}
        style={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
      />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16.5 16.5L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MoreIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="5"
        r="1.5"
        fill="currentColor"
      />
      <circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
      />
      <circle
        cx="12"
        cy="19"
        r="1.5"
        fill="currentColor"
      />
    </svg>
  )
}

export function AttachIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57a4 4 0 015.66 5.66l-8.58 8.57a2 2 0 01-2.83-2.83l7.94-7.93"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StickerIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="9"
        cy="10.5"
        r="1"
        fill="currentColor"
      />
      <circle
        cx="15"
        cy="10.5"
        r="1"
        fill="currentColor"
      />
      <path
        d="M8.5 14.5c.8 1.7 6.2 1.7 7 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MicIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="9"
        y="2"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 11a7 7 0 0014 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 18v3M10 21h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.83898 8.50715L5.94421 14.4027C6.06656 15.0553 6.91112 15.2205 7.26317 14.6606L13.8851 4.12962C14.1925 3.64085 13.847 3 13.2761 3H1.7241C1.1048 3 0.772366 3.73969 1.17797 4.21519L4.83898 8.50715ZM4.83898 8.50715L13.8728 3.36714"
        stroke="white"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function ChecksIcon({ color }: { color?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M1.5 8l3 3L11 4"
        stroke={color ?? 'currentColor'}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 8l3 3 6.5-7"
        stroke={color ?? 'currentColor'}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

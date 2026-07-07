import type { SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number
  color?: string
}

function Icon({ size = 24, color, style, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={color ? { color, ...style } : style}
      {...props}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
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
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Icon>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
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
    </Icon>
  )
}

export function AttachIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57a4 4 0 015.66 5.66l-8.58 8.57a2 2 0 01-2.83-2.83l7.94-7.93"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function StickerIcon(props: IconProps) {
  return (
    <Icon {...props}>
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
    </Icon>
  )
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
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
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <Icon
      size={16}
      viewBox="0 0 16 16"
      {...props}
    >
      <path
        d="M4.83898 8.50715L5.94421 14.4027C6.06656 15.0553 6.91112 15.2205 7.26317 14.6606L13.8851 4.12962C14.1925 3.64085 13.847 3 13.2761 3H1.7241C1.1048 3 0.772366 3.73969 1.17797 4.21519L4.83898 8.50715ZM4.83898 8.50715L13.8728 3.36714"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </Icon>
  )
}

export function ChecksIcon(props: IconProps) {
  return (
    <Icon
      size={16}
      viewBox="0 0 16 16"
      {...props}
    >
      <path
        d="M1.5 8l3 3L11 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 8l3 3 6.5-7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function FailedIcon(props: IconProps) {
  return (
    <Icon
      size={16}
      viewBox="0 0 16 16"
      {...props}
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8ZM8 4.25C8.41421 4.25 8.75 4.58579 8.75 5V8.5C8.75 8.91421 8.41421 9.25 8 9.25C7.58579 9.25 7.25 8.91421 7.25 8.5V5C7.25 4.58579 7.58579 4.25 8 4.25ZM8 11.75C8.41421 11.75 8.75 11.4142 8.75 11C8.75 10.5858 8.41421 10.25 8 10.25C7.58579 10.25 7.25 10.5858 7.25 11C7.25 11.4142 7.58579 11.75 8 11.75Z"
        fill="#C51E37"
      />
    </Icon>
  )
}

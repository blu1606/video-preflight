import { ICONS } from './icons-data'

const EXTRA = {
  'volume-high': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 9.99997V14C2 16 3 17 5 17H6.43C6.8 17 7.17 17.11 7.49 17.3L10.41 19.13C12.93 20.71 15 19.56 15 16.59V7.40997C15 4.42997 12.93 3.28997 10.41 4.86997L7.49 6.69997C7.17 6.88997 6.8 6.99997 6.43 6.99997H5C3 6.99997 2 7.99997 2 9.99997Z" stroke-width="1.5" stroke="currentColor"/><path d="M18 8C19.78 10.37 19.78 13.63 18 16" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M19.8301 5.5C22.7201 9.35 22.7201 14.65 19.8301 18.5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/></svg>',
  'volume-mute': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 9.99997V14C5.5 16 6.5 17 8.5 17H9.93C10.3 17 10.67 17.11 10.99 17.3L13.91 19.13C16.43 20.71 18.5 19.56 18.5 16.59V7.40997C18.5 4.42997 16.43 3.28997 13.91 4.86997L10.99 6.69997C10.67 6.88997 10.3 6.99997 9.93 6.99997H8.5C6.5 6.99997 5.5 7.99997 5.5 9.99997Z" stroke-width="1.5" stroke="currentColor"/></svg>',
  shop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.00977 11.2202V15.7102C3.00977 20.2002 4.80977 22.0002 9.29977 22.0002H14.6898C19.1798 22.0002 20.9798 20.2002 20.9798 15.7102V11.2202" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M12 12C13.83 12 15.18 10.51 15 8.68L14.34 2H9.66999L8.99999 8.68C8.81999 10.51 10.17 12 12 12Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M18.3098 12C20.3298 12 21.8098 10.36 21.6098 8.35L21.3298 5.6C20.9698 3 19.9698 2 17.3498 2H14.2998L14.9998 9.01C15.1698 10.66 16.6598 12 18.3098 12Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M5.63988 12C7.28988 12 8.77988 10.66 8.93988 9.01L9.15988 6.8L9.63988 2H6.58988C3.96988 2 2.96988 3 2.60988 5.6L2.33988 8.35C2.13988 10.36 3.61988 12 5.63988 12Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M12 17C10.33 17 9.5 17.83 9.5 19.5V22H14.5V19.5C14.5 17.83 13.67 17 12 17Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.73 3.51L15.49 7.03C15.73 7.52 16.37 7.99 16.91 8.08L20.1 8.61C22.14 8.95 22.62 10.43 21.15 11.89L18.67 14.37C18.25 14.79 18.02 15.6 18.15 16.18L18.86 19.25C19.42 21.68 18.13 22.62 15.98 21.35L12.99 19.58C12.45 19.26 11.56 19.26 11.01 19.58L8.02 21.35C5.88 22.62 4.58 21.67 5.14 19.25L5.85 16.18C5.98 15.6 5.75 14.79 5.33 14.37L2.85 11.89C1.39 10.43 1.86 8.95 3.9 8.61L7.09 8.08C7.62 7.99 8.26 7.52 8.5 7.03L10.26 3.51C11.22 1.6 12.78 1.6 13.73 3.51Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

/** One Iconsax glyph from the mockup-v2 set (static markup owned by this repo). */
export function Icon({ name, className = 'ic', label }) {
  const svg = ICONS[name] ?? EXTRA[name]
  if (!svg) return null
  return (
    <span
      className={className}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

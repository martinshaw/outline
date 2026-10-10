type Props = {
  size?: number;
};

/** Geometric × for icon buttons — avoids font glyph centering issues. */
export function CloseIcon({ size = 14 }: Props) {
  return (
    <svg
      className="btn__close-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 7l10 10M17 7L7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

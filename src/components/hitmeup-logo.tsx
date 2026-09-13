export const HITMEUP_LOGO_PATHS = {
  top: "M13 29C14 14 31 5 53 4C78 2 103 12 112 32C121 52 109 70 92 78C79 84 71 77 72 63C73 48 63 35 47 34C32 33 22 39 13 29Z",
  left: "M46 35C60 36 66 45 60 56C55 66 43 72 38 83C33 95 42 104 55 113C61 118 61 124 54 126C39 121 21 110 11 95C-1 77 0 56 12 45C22 36 35 32 46 35Z",
  right: "M91 78C105 69 117 72 117 84C117 100 102 114 86 123C73 128 59 125 60 113C61 99 72 91 91 78Z",
} as const;

export function HitMeUpLogo({
  size = 44,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const labelled = Boolean(title);

  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      className={className}
      fill="none"
      height={size}
      role={labelled ? "img" : "presentation"}
      viewBox="0 0 128 128"
      width={size}
    >
      <path d={HITMEUP_LOGO_PATHS.top} fill="#E7011F" />
      <path d={HITMEUP_LOGO_PATHS.left} fill="#FB4443" />
      <path d={HITMEUP_LOGO_PATHS.right} fill="#B30121" />
      <circle cx="64" cy="66" fill="#E7011F" r="13" />
    </svg>
  );
}

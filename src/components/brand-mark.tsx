import Image from "next/image";

// The logo file matches the scheme it sits on: logo-light.png for light
// backgrounds, logo-dark.png for dark.
export function BrandMark({
  size = 32,
  priority = false,
  className,
}: {
  size?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={className}>
      <Image
        alt="Blu Builders logo"
        className="dark:hidden"
        height={size}
        priority={priority}
        src="/logo-light.png"
        width={size}
      />
      <Image
        alt="Blu Builders logo"
        className="hidden dark:block"
        height={size}
        priority={priority}
        src="/logo-dark.png"
        width={size}
      />
    </span>
  );
}

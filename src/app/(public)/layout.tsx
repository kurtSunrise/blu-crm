// Minimal chrome for the unauthenticated surfaces (the embeddable enquiry
// form and tokenised quote views): no app navigation, nothing to explore.
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}

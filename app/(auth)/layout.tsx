export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">VPO</h1>
          <p className="text-sm text-muted-foreground">
            Virtual Product Owner
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

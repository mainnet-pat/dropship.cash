import "./globals.css";
import { ConnectorContextProvider } from "@/contexts/ConnectorContext";
import { Toaster } from "@/components/ui/sonner";
export { metadata } from "@/lib/utils";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConnectorContextProvider>

      <html lang="en">
        <body
          className=""
        >
          {children}
          <Toaster position="top-center" richColors />
        </body>
      </html>
    </ConnectorContextProvider>
  );
}

import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "MIDAS Control Room",
  description: "Operator control room for Atlas walking-slice evaluation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

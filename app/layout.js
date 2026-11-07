import { Roboto } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "./components/Toast";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

export const metadata = {
  title: "Medipharmac | Administration pharmacie",
  description: "Interface d'administration Medipharmac pour les pharmacies",
  icons: {
    icon: [
      { url: "/icon.png?v=20261107", type: "image/png" },
      { url: "/favicon.ico?v=20261107", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico?v=20261107",
    apple: "/apple-icon.png?v=20261107",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${roboto.variable} h-full bg-gray-50 antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

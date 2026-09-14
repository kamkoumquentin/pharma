import { Roboto } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "./components/Toast";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

export const metadata = {
  title: "Boutique Admin",
  description: "Interface d'administration pour la gestion de boutique",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50/50">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}


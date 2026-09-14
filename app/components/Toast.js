"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "success", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl shadow-2xl border backdrop-blur-md transform transition-all duration-300 animate-slide-in ${
              toast.type === "success"
                ? "bg-emerald-500/90 border-emerald-400 text-white"
                : toast.type === "error"
                ? "bg-rose-500/90 border-rose-400 text-white"
                : "bg-sky-500/90 border-sky-400 text-white"
            }`}
          >
            <div className="flex items-center space-x-3">
              {toast.type === "success" && <CheckCircleIcon className="w-6 h-6 shrink-0 text-emerald-100" />}
              {toast.type === "error" && <ExclamationCircleIcon className="w-6 h-6 shrink-0 text-rose-100" />}
              {toast.type === "info" && <InformationCircleIcon className="w-6 h-6 shrink-0 text-sky-100" />}
              <p className="text-sm font-medium leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

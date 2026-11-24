"use client";

import { createContext, useContext } from "react";

const AdminContext = createContext(null);

export function AdminProvider({ value, children }) {
  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin doit être utilisé à l'intérieur de AdminProvider.");
  }
  return context;
}

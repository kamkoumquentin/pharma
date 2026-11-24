"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowDownTrayIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export default function ExportMenu({
  disabled = false,
  onExportExcel,
  onExportPdf,
  onExportCsv,
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef(null);

  useEffect(() => {
    if (!ouvert) return undefined;

    const handleClickExterieur = (event) => {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target)) {
        setOuvert(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOuvert(false);
      }
    };

    document.addEventListener("mousedown", handleClickExterieur);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickExterieur);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [ouvert]);

  const executer = (fn) => {
    setOuvert(false);
    fn?.();
  };

  return (
    <div ref={conteneurRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOuvert((prev) => !prev)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        title="Exporter les données"
        className="h-10 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-emerald-200 rounded-xl transition cursor-pointer text-xs font-semibold text-gray-700 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600" />
        <span>Exporter</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-44 rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg z-30"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => executer(onExportExcel)}
            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer flex items-center justify-between"
          >
            <span>Excel</span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              .xlsx
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => executer(onExportPdf)}
            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-rose-50 hover:text-rose-800 transition cursor-pointer flex items-center justify-between"
          >
            <span>PDF</span>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
              .pdf
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => executer(onExportCsv)}
            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition cursor-pointer flex items-center justify-between"
          >
            <span>CSV</span>
            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              .csv
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

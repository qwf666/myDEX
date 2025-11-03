"use client";

import { useEffect, useState } from "react";
import { Header } from "./header";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {mounted && <Header />}
      {children}
    </>
  );
}


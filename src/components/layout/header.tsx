"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";

const routes = [
  { path: "/", label: "Swap" },
  { path: "/pool", label: "Pool" },
  { path: "/position", label: "Position" },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(pathname || "/");

  useEffect(() => {
    setActiveTab(pathname || "/");
  }, [pathname]);

  return (
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center space-x-6">
          <h1 className="text-xl font-bold">MetaNodeSwap</h1>
          <Tabs value={activeTab} onValueChange={(value: string) => router.push(value)}>
            <TabsList className="bg-transparent">
              {routes.map((route) => (
                <TabsTrigger
                  key={route.path}
                  value={route.path}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none relative data-[state=active]:text-primary before:content-[''] before:absolute before:bottom-0 before:left-0 before:w-full before:h-[2px] before:bg-primary before:scale-x-0 data-[state=active]:before:scale-x-100 before:transition-transform before:duration-300"
                >
                  {route.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <ConnectButton 
          showBalance={true} 
          chainStatus="icon" 
          accountStatus="address" 
        />
      </div>
    </header>
  );
}


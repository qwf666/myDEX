"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TOKENS } from "@/lib/contracts/addresses";
import { formatAddress } from "@/lib/utils/format";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import type { ERC20TokenInfo } from "@/lib/contracts/types";
import type { Address } from "viem";

interface TokenSelectorProps {
  selectedToken: Address | undefined;
  onSelect: (token: Address) => void;
  disabled?: boolean;
}

const AVAILABLE_TOKENS = [
  { address: TOKENS.MN_TOKEN_A, symbol: "MNTokenA" },
  { address: TOKENS.MN_TOKEN_B, symbol: "MNTokenB" },
  { address: TOKENS.MN_TOKEN_C, symbol: "MNTokenC" },
  { address: TOKENS.MN_TOKEN_D, symbol: "MNTokenD" },
];

export function TokenSelector({ selectedToken, onSelect, disabled }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const { tokenInfo } = useTokenInfo(selectedToken);

  const filteredTokens = AVAILABLE_TOKENS.filter(
    (token) =>
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (tokenAddress: Address) => {
    onSelect(tokenAddress);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-full justify-between">
          <span>{tokenInfo?.symbol || selectedToken ? formatAddress(selectedToken || "0x") : "选择代币"}</span>
          <span>▼</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择代币</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            placeholder="搜索代币名称或地址..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {filteredTokens.map((token) => (
              <Button
                key={token.address}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleSelect(token.address)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{token.symbol}</span>
                  <span className="text-xs text-muted-foreground">{formatAddress(token.address)}</span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


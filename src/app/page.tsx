"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { useSimulateContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TokenSelector } from "@/components/token/TokenSelector";
import { TokenBalance } from "@/components/token/TokenBalance";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { SWAP_ROUTER_ABI } from "@/lib/contracts/abis";
import { usePools } from "@/hooks/usePools";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/format";
import { ArrowUpDown } from "lucide-react";
import type { Address } from "viem";

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  
  const [tokenIn, setTokenIn] = useState<Address | undefined>(undefined);
  const [tokenOut, setTokenOut] = useState<Address | undefined>(undefined);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [isExactInput, setIsExactInput] = useState(true);
  const [indexPath, setIndexPath] = useState<bigint[]>([]);

  const { pools } = usePools();
  const { tokenInfo: tokenInInfo } = useTokenInfo(tokenIn);
  const { tokenInfo: tokenOutInfo } = useTokenInfo(tokenOut);

  // 使用 useMemo 计算匹配的池子索引，避免不必要的重新计算
  // 使用 pools.length 和序列化的方式作为依赖，避免数组引用问题
  const poolsKey = pools.length > 0 ? pools.map(p => `${p.token0}-${p.token1}-${p.index}`).join(',') : '';
  const calculatedIndexPath = useMemo(() => {
    if (!tokenIn || !tokenOut || pools.length === 0) {
      return [];
    }

    // 找到tokenIn和tokenOut匹配的池子
    const matchingPools = pools.filter(
      (pool) =>
        (pool.token0.toLowerCase() === tokenIn.toLowerCase() &&
          pool.token1.toLowerCase() === tokenOut.toLowerCase()) ||
        (pool.token0.toLowerCase() === tokenOut.toLowerCase() &&
          pool.token1.toLowerCase() === tokenIn.toLowerCase())
    );

    if (matchingPools.length > 0) {
      // 选择第一个匹配的池子（可以后续优化为选择流动性最大的）
      return [matchingPools[0].index];
    }
    return [];
  }, [tokenIn, tokenOut, poolsKey]);

  // 根据计算结果设置indexPath，useMemo确保calculatedIndexPath稳定
  useEffect(() => {
    setIndexPath(calculatedIndexPath);
  }, [calculatedIndexPath]);

  // 价格估算 - 使用static call (simulateContract)
  const { data: quoteSimulation, isLoading: isQuoteLoading } = useSimulateContract({
    address: CONTRACTS.SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: isExactInput ? "quoteExactInput" : "quoteExactOutput",
    args: isExactInput && amountIn && indexPath.length > 0 && tokenIn && tokenOut
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPath as readonly bigint[],
            amountIn: parseTokenAmount(amountIn, tokenInInfo?.decimals || 18),
            sqrtPriceLimitX96: 0n,
          },
        ]
      : !isExactInput && amountOut && indexPath.length > 0 && tokenIn && tokenOut
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPath as readonly bigint[],
            amountOut: parseTokenAmount(amountOut, tokenOutInfo?.decimals || 18),
            sqrtPriceLimitX96: 0n,
          },
        ]
      : undefined,
    query: {
      enabled:
        !!tokenIn &&
        !!tokenOut &&
        indexPath.length > 0 &&
        ((isExactInput && !!amountIn && amountIn !== "0") ||
          (!isExactInput && !!amountOut && amountOut !== "0")),
    },
  });

  const quoteAmount = quoteSimulation?.result;

  // 更新输出金额
  useEffect(() => {
    if (isExactInput && quoteAmount && tokenOutInfo) {
      setAmountOut(formatTokenAmount(quoteAmount as bigint, tokenOutInfo.decimals));
    } else if (!isExactInput && quoteAmount && tokenInInfo) {
      setAmountIn(formatTokenAmount(quoteAmount as bigint, tokenInInfo.decimals));
    }
  }, [quoteAmount, isExactInput, tokenInInfo, tokenOutInfo]);

  const { writeContract: swap, data: swapHash, isPending: isSwapPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  // 处理Swap成功
  useEffect(() => {
    if (isSwapSuccess) {
      queryClient.invalidateQueries();
      setAmountIn("");
      setAmountOut("");
    }
  }, [isSwapSuccess, queryClient]);

  const handleSwap = () => {
    if (!tokenIn || !tokenOut || !address || indexPath.length === 0) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20分钟后过期

    if (isExactInput && amountIn && tokenInInfo) {
      const amountInBig = parseTokenAmount(amountIn, tokenInInfo.decimals);
      const amountOutMinimum = quoteAmount
        ? (quoteAmount as bigint) - ((quoteAmount as bigint) * 5n) / 100n // 5%滑点保护
        : 0n;

      swap({
        address: CONTRACTS.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInput",
        args: [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPath as readonly bigint[],
            recipient: address,
            deadline,
            amountIn: amountInBig,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
    } else if (!isExactInput && amountOut && tokenOutInfo) {
      const amountOutBig = parseTokenAmount(amountOut, tokenOutInfo.decimals);
      const amountInMaximum = quoteAmount
        ? (quoteAmount as bigint) + ((quoteAmount as bigint) * 5n) / 100n // 5%滑点保护
        : 2n ** 256n - 1n;

      swap({
        address: CONTRACTS.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactOutput",
        args: [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPath as readonly bigint[],
            recipient: address,
            deadline,
            amountOut: amountOutBig,
            amountInMaximum,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
    }
  };

  const handleSwitchTokens = () => {
    const tempToken = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tempToken);
    const tempAmount = amountIn;
    setAmountIn(amountOut);
    setAmountOut(tempAmount);
    setIsExactInput(!isExactInput);
  };

  const canSwap =
    isConnected &&
    tokenIn &&
    tokenOut &&
    tokenIn !== tokenOut &&
    indexPath.length > 0 &&
    ((isExactInput && amountIn && amountIn !== "0") ||
      (!isExactInput && amountOut && amountOut !== "0"));

  if (!isConnected) {
    return (
      <main className="container py-6">
        <Card>
          <CardHeader>
            <CardTitle>连接钱包</CardTitle>
            <CardDescription>请连接钱包以进行Swap交易</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="container py-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Swap</CardTitle>
          <CardDescription>交换代币</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 输入代币 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">From</label>
              <TokenBalance tokenAddress={tokenIn} />
            </div>
            <div className="flex gap-2">
              <TokenSelector selectedToken={tokenIn} onSelect={setTokenIn} />
              <Input
                type="number"
                placeholder="0.0"
                value={amountIn}
                onChange={(e) => {
                  setAmountIn(e.target.value);
                  setIsExactInput(true);
                }}
                disabled={!isExactInput && isQuoteLoading}
              />
            </div>
          </div>

          {/* 切换按钮 */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwitchTokens}
              className="rounded-full"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>

          {/* 输出代币 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">To</label>
              <TokenBalance tokenAddress={tokenOut} />
            </div>
            <div className="flex gap-2">
              <TokenSelector selectedToken={tokenOut} onSelect={setTokenOut} />
              <Input
                type="number"
                placeholder="0.0"
                value={amountOut}
                onChange={(e) => {
                  setAmountOut(e.target.value);
                  setIsExactInput(false);
                }}
                disabled={isExactInput && isQuoteLoading}
              />
            </div>
            {isQuoteLoading && (amountIn || amountOut) && (
              <p className="text-xs text-muted-foreground">计算中...</p>
            )}
          </div>

          <Separator />

          {/* Swap按钮 */}
          <Button
            onClick={handleSwap}
            disabled={!canSwap || isSwapPending || isConfirming || isQuoteLoading}
            className="w-full"
          >
            {isSwapPending || isConfirming
              ? "交易中..."
              : !canSwap
              ? "输入金额"
              : "Swap"}
          </Button>

          {/* 路由信息 */}
          {indexPath.length > 0 && (
            <div className="text-xs text-muted-foreground">
              路由: 使用 {indexPath.length} 个池子
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}


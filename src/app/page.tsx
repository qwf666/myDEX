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
import { parseTokenAmount, formatTokenAmount, formatFee } from "@/lib/utils/format";
import { tickToSqrtPriceX96 } from "@/lib/utils/tick";
import { ArrowUpDown } from "lucide-react";
import type { Address } from "viem";

// 常量：来自 TickMath.sol
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;

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
      // 过滤掉价格为 0 的池子（未初始化的池子）
      const validPools = matchingPools.filter(pool => pool.sqrtPriceX96 > 0n && pool.liquidity > 0n);
      
      if (validPools.length === 0) {
        console.log('没有有效的池子（价格或流动性为 0）');
        return [];
      }
      
      // 选择流动性最大的池子（最优池子）
      // 如果流动性相同，选择费率最低的
      const bestPool = validPools.reduce((best, current) => {
        // 比较流动性
        if (current.liquidity > best.liquidity) {
          return current;
        }
        if (current.liquidity < best.liquidity) {
          return best;
        }
        // 流动性相同，选择费率更低的
        if (current.fee < best.fee) {
          return current;
        }
        return best;
      });
      
      console.log('选择的池子:', {
        index: bestPool.index,
        liquidity: bestPool.liquidity.toString(),
        fee: bestPool.fee.toString(),
        sqrtPriceX96: bestPool.sqrtPriceX96.toString(),
        token0: bestPool.token0,
        token1: bestPool.token1,
      });
      
      return [bestPool.index];
    }
    return [];
  }, [tokenIn, tokenOut, poolsKey]);

  // 根据计算结果设置indexPath，useMemo确保calculatedIndexPath稳定
  useEffect(() => {
    setIndexPath(calculatedIndexPath);
  }, [calculatedIndexPath]);

  // 价格估算 - 使用static call (simulateContract)
  // 将 indexPath 从 bigint[] 转换为 number[] (uint32[])
  const indexPathAsNumbers = useMemo(() => {
    return indexPath.map(idx => Number(idx));
  }, [indexPath]);

  // 计算 sqrtPriceLimitX96：根据交易方向设置合适的价格限制
  const sqrtPriceLimitX96 = useMemo(() => {
    if (!tokenIn || !tokenOut || calculatedIndexPath.length === 0 || pools.length === 0) {
      return 0n;
    }

    // 找到选择的池子：不仅要匹配 index，还要确保 token 地址匹配
    const selectedPool = pools.find(p => {
      const indexMatch = p.index === calculatedIndexPath[0];
      const tokenMatch = 
        (p.token0.toLowerCase() === tokenIn.toLowerCase() && p.token1.toLowerCase() === tokenOut.toLowerCase()) ||
        (p.token0.toLowerCase() === tokenOut.toLowerCase() && p.token1.toLowerCase() === tokenIn.toLowerCase());
      return indexMatch && tokenMatch;
    });
    
    if (!selectedPool) {
      console.log("sqrtPriceLimitX96 计算: 未找到匹配的池子", {
        calculatedIndexPath: calculatedIndexPath[0].toString(),
        tokenIn,
        tokenOut,
        availablePools: pools.filter(p => p.index === calculatedIndexPath[0]).map(p => ({
          index: p.index.toString(),
          token0: p.token0,
          token1: p.token1,
        })),
      });
      return 0n;
    }
    
    // 确保池子已初始化（价格不为 0）且有流动性
    if (selectedPool.sqrtPriceX96 === 0n || selectedPool.liquidity === 0n) {
      console.log("sqrtPriceLimitX96 计算: 池子未初始化或没有流动性", {
        poolIndex: selectedPool.index.toString(),
        sqrtPriceX96: selectedPool.sqrtPriceX96.toString(),
        liquidity: selectedPool.liquidity.toString(),
        token0: selectedPool.token0,
        token1: selectedPool.token1,
      });
      return 0n;
    }

    // 判断交易方向：zeroForOne = tokenIn 是 token0 (从 token0 换 token1)
    // 在池子中，token0 和 token1 是排序的，所以需要判断 tokenIn 是 token0 还是 token1
    const zeroForOne = tokenIn.toLowerCase() === selectedPool.token0.toLowerCase();
    const currentPrice = selectedPool.sqrtPriceX96;
    
    let result = 0n;
    
    if (zeroForOne) {
      // 从 token0 换 token1，价格会下降
      // sqrtPriceLimitX96 必须 < sqrtPriceX96 且 > MIN_SQRT_PRICE
      // 设置一个合理的下限：使用池子的 tickLower 对应的价格，或当前价格的 1%
      const tickLowerNum = Number(selectedPool.tickLower);
      if (tickLowerNum > -887272) {
        const lowerLimit = tickToSqrtPriceX96(tickLowerNum);
        // 确保 lowerLimit < currentPrice 且 > MIN_SQRT_PRICE
        if (lowerLimit < currentPrice && lowerLimit > MIN_SQRT_PRICE) {
          result = lowerLimit;
        }
      }
      // 如果 tickLower 不可用，使用当前价格的 99%（但确保 > MIN_SQRT_PRICE）
      if (result === 0n) {
        const onePercentPrice = (currentPrice * 99n) / 100n;
        result = onePercentPrice > MIN_SQRT_PRICE ? onePercentPrice : MIN_SQRT_PRICE + 1n;
      }
    } else {
      // 从 token1 换 token0，价格会上升
      // sqrtPriceLimitX96 必须 > sqrtPriceX96 且 < MAX_SQRT_PRICE
      // 设置一个合理的上限：使用池子的 tickUpper 对应的价格，或当前价格的 101%
      const tickUpperNum = Number(selectedPool.tickUpper);
      if (tickUpperNum < 887272) {
        const upperLimit = tickToSqrtPriceX96(tickUpperNum);
        // 确保 upperLimit > currentPrice 且 < MAX_SQRT_PRICE
        if (upperLimit > currentPrice && upperLimit < MAX_SQRT_PRICE) {
          result = upperLimit;
        }
      }
      // 如果 tickUpper 不可用，使用当前价格的 101%（但确保 < MAX_SQRT_PRICE）
      if (result === 0n) {
        const onePercentPrice = (currentPrice * 101n) / 100n;
        result = onePercentPrice < MAX_SQRT_PRICE ? onePercentPrice : MAX_SQRT_PRICE - 1n;
      }
    }
    
    console.log("sqrtPriceLimitX96 计算结果:", {
      zeroForOne,
      currentPrice: currentPrice.toString(),
      result: result.toString(),
      poolIndex: selectedPool.index.toString(),
    });
    
    return result;
  }, [tokenIn, tokenOut, calculatedIndexPath, pools]);
  
  const { data: quoteSimulation, isLoading: isQuoteLoading, error: quoteError } = useSimulateContract({
    address: CONTRACTS.SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: isExactInput ? "quoteExactInput" : "quoteExactOutput",
    args: isExactInput && amountIn && calculatedIndexPath.length > 0 && tokenIn && tokenOut && sqrtPriceLimitX96 > 0n && tokenInInfo
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            amountIn: parseTokenAmount(amountIn, tokenInInfo.decimals),
            sqrtPriceLimitX96,
          },
        ]
      : !isExactInput && amountOut && calculatedIndexPath.length > 0 && tokenIn && tokenOut && sqrtPriceLimitX96 > 0n && tokenOutInfo
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            amountOut: parseTokenAmount(amountOut, tokenOutInfo.decimals),
            sqrtPriceLimitX96,
          },
        ]
      : undefined,
    query: {
      enabled:
        !!tokenIn &&
        !!tokenOut &&
        calculatedIndexPath.length > 0 &&
        tokenInInfo &&
        tokenOutInfo &&
        sqrtPriceLimitX96 > 0n &&
        indexPathAsNumbers.length > 0 &&
        ((isExactInput && !!amountIn && amountIn !== "0") ||
          (!isExactInput && !!amountOut && amountOut !== "0")),
    },
  });

  const quoteAmount = quoteSimulation?.result;

  // 处理价格计算错误
  useEffect(() => {
    if (quoteError) {
      console.error("价格计算错误:", quoteError);
      console.error("错误详情:", {
        tokenIn,
        tokenOut,
        indexPath: indexPathAsNumbers,
        amountIn,
        amountOut,
        isExactInput,
        tokenInInfo,
        tokenOutInfo,
      });
      // 如果计算失败，清空输出金额
      if (isExactInput) {
        setAmountOut("");
      } else {
        setAmountIn("");
      }
    }
  }, [quoteError, isExactInput, tokenIn, tokenOut, indexPathAsNumbers, amountIn, amountOut, tokenInInfo, tokenOutInfo]);

  // 更新输出金额
  useEffect(() => {
    console.log("更新输出金额 useEffect 触发:", {
      quoteAmount: quoteAmount?.toString(),
      isExactInput,
      hasTokenOutInfo: !!tokenOutInfo,
      hasTokenInInfo: !!tokenInInfo,
      quoteError: !!quoteError,
    });
    
    // 只有在没有错误时才更新金额
    if (quoteError) {
      console.log("有错误，不更新金额");
      return;
    }
    
    if (isExactInput && quoteAmount && tokenOutInfo) {
      const formatted = formatTokenAmount(quoteAmount as bigint, tokenOutInfo.decimals);
      console.log("格式化输出金额:", {
        quoteAmount: quoteAmount.toString(),
        decimals: tokenOutInfo.decimals,
        formatted,
      });
      // 确保格式化的金额是有效的数字
      if (formatted && formatted !== "0" && !isNaN(Number(formatted))) {
        setAmountOut(formatted);
      } else {
        console.log("格式化后的金额无效，清空");
        setAmountOut("");
      }
    } else if (!isExactInput && quoteAmount && tokenInInfo) {
      const formatted = formatTokenAmount(quoteAmount as bigint, tokenInInfo.decimals);
      console.log("格式化输入金额:", {
        quoteAmount: quoteAmount.toString(),
        decimals: tokenInInfo.decimals,
        formatted,
      });
      // 确保格式化的金额是有效的数字
      if (formatted && formatted !== "0" && !isNaN(Number(formatted))) {
        setAmountIn(formatted);
      } else {
        console.log("格式化后的金额无效，清空");
        setAmountIn("");
      }
    } else {
      console.log("不满足更新条件");
    }
  }, [quoteAmount, isExactInput, tokenInInfo, tokenOutInfo, quoteError]);

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
            indexPath: indexPathAsNumbers as readonly number[],
            recipient: address,
            deadline,
            amountIn: amountInBig,
            amountOutMinimum,
            sqrtPriceLimitX96,
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
            indexPath: indexPathAsNumbers as readonly number[],
            recipient: address,
            deadline,
            amountOut: amountOutBig,
            amountInMaximum,
            sqrtPriceLimitX96,
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
        <CardContent className="space-y-6">
          {/* 输入代币 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">From</label>
              <TokenBalance tokenAddress={tokenIn} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <TokenSelector selectedToken={tokenIn} onSelect={setTokenIn} />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => {
                    setAmountIn(e.target.value);
                    setIsExactInput(true);
                  }}
                  disabled={!isExactInput && isQuoteLoading}
                  className="text-right text-lg"
                />
              </div>
            </div>
          </div>

          {/* 切换按钮 */}
          <div className="flex justify-center -my-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwitchTokens}
              className="rounded-full h-10 w-10"
            >
              <ArrowUpDown className="h-5 w-5" />
            </Button>
          </div>

          {/* 输出代币 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">To</label>
              <TokenBalance tokenAddress={tokenOut} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <TokenSelector selectedToken={tokenOut} onSelect={setTokenOut} />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amountOut}
                  onChange={(e) => {
                    setAmountOut(e.target.value);
                    setIsExactInput(false);
                  }}
                  disabled={isExactInput && isQuoteLoading}
                  className="text-right text-lg"
                />
              </div>
            </div>
            {isQuoteLoading && (amountIn || amountOut) && (
              <p className="text-xs text-muted-foreground text-center">计算中...</p>
            )}
            {quoteError && (
              <p className="text-xs text-red-500 text-center">
                价格计算失败，请检查池子是否有足够的流动性
              </p>
            )}
          </div>

          <Separator />

          {/* 池子选择信息 */}
          {indexPath.length > 0 && calculatedIndexPath.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                路由: 使用 {indexPath.length} 个池子
              </div>
              {pools.length > 0 && (() => {
                const selectedPool = pools.find(p => p.index === calculatedIndexPath[0]);
                if (selectedPool) {
                  // 流动性格式化：流动性值通常很大，使用科学计数法或简单格式化
                  const liquidityStr = selectedPool.liquidity.toString();
                  const liquidityDisplay = liquidityStr.length > 10 
                    ? `${liquidityStr.slice(0, 10)}...` 
                    : formatTokenAmount(selectedPool.liquidity, 0); // 流动性没有小数位
                  
                  return (
                    <div className="text-xs">
                      池子信息: Index {selectedPool.index.toString()} | 
                      流动性: {liquidityDisplay} | 
                      费率: {formatFee(selectedPool.fee)}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

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


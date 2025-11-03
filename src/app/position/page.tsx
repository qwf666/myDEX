"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TokenSelector } from "@/components/token/TokenSelector";
import { TokenBalance } from "@/components/token/TokenBalance";
import { usePositions } from "@/hooks/usePositions";
import { usePoolsByPair } from "@/hooks/usePoolsByPair";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { POSITION_MANAGER_ABI } from "@/lib/contracts/abis";
import { formatTokenAmount, formatFee, formatAddress, parseTokenAmount } from "@/lib/utils/format";
import type { PositionInfo } from "@/lib/contracts/types";
import type { Address } from "viem";

const ITEMS_PER_PAGE = 10;

export default function PositionPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { positions, isLoading: positionsLoading, refetch: refetchPositions } = usePositions();

  const [mintDialogOpen, setMintDialogOpen] = useState(false);
  const [token0, setToken0] = useState<Address | undefined>(undefined);
  const [token1, setToken1] = useState<Address | undefined>(undefined);
  const [poolIndex, setPoolIndex] = useState<bigint | undefined>(undefined);
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");

  const { pools: availablePools, indexes } = usePoolsByPair(token0, token1);
  const { tokenInfo: token0Info } = useTokenInfo(token0);
  const { tokenInfo: token1Info } = useTokenInfo(token1);

  const [currentPage, setCurrentPage] = useState(1);

  // 当池子列表变化时，自动选择第一个池子
  useEffect(() => {
    if (indexes.length > 0 && poolIndex === undefined) {
      setPoolIndex(indexes[0]);
    }
  }, [indexes, poolIndex]);

  // 计算分页数据
  const totalPages = Math.ceil(positions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPositions = positions.slice(startIndex, endIndex);

  const { writeContract: mint, data: mintHash, isPending: isMinting } = useWriteContract();

  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  // 处理Mint成功
  useEffect(() => {
    if (isMintSuccess) {
      queryClient.invalidateQueries();
      refetchPositions();
      setMintDialogOpen(false);
      setToken0(undefined);
      setToken1(undefined);
      setPoolIndex(undefined);
      setAmount0("");
      setAmount1("");
    }
  }, [isMintSuccess, queryClient, refetchPositions]);

  const handleMint = () => {
    if (!token0 || !token1 || poolIndex === undefined || !amount0 || !amount1 || !address) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20分钟后过期
    const amount0Desired = parseTokenAmount(amount0, token0Info?.decimals || 18);
    const amount1Desired = parseTokenAmount(amount1, token1Info?.decimals || 18);

    mint({
      address: CONTRACTS.POSITION_MANAGER,
      abi: POSITION_MANAGER_ABI,
      functionName: "mint",
      args: [
        {
          token0,
          token1,
          index: Number(poolIndex),
          amount0Desired,
          amount1Desired,
          recipient: address,
          deadline,
        },
      ],
    });
  };

  if (!isConnected) {
    return (
      <main className="container py-6">
        <Card>
          <CardHeader>
            <CardTitle>连接钱包</CardTitle>
            <CardDescription>请连接钱包以查看和管理头寸</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Positions</h1>
        <Dialog open={mintDialogOpen} onOpenChange={setMintDialogOpen}>
          <DialogTrigger asChild>
            <Button>添加流动性</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>添加流动性</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Token0</label>
                <TokenSelector selectedToken={token0} onSelect={setToken0} />
                {token0 && (
                  <>
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={amount0}
                      onChange={(e) => setAmount0(e.target.value)}
                    />
                    <TokenBalance tokenAddress={token0} />
                  </>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Token1</label>
                <TokenSelector selectedToken={token1} onSelect={setToken1} />
                {token1 && (
                  <>
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={amount1}
                      onChange={(e) => setAmount1(e.target.value)}
                    />
                    <TokenBalance tokenAddress={token1} />
                  </>
                )}
              </div>

              {/* 池子选择 */}
              {availablePools.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">选择池子</label>
                  <div className="space-y-1">
                    {availablePools.map((pool, idx) => (
                      <Button
                        key={idx}
                        variant={poolIndex === pool.index ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => setPoolIndex(pool.index)}
                      >
                        <div className="flex flex-col items-start">
                          <span>
                            费率: {formatFee(pool.fee)} | Index: {pool.index.toString()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Tick {pool.tickLower.toString()} - {pool.tickUpper.toString()}
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleMint}
                disabled={
                  !token0 ||
                  !token1 ||
                  poolIndex === undefined ||
                  !amount0 ||
                  !amount1 ||
                  isMinting ||
                  isMintConfirming ||
                  token0 === token1 ||
                  availablePools.length === 0
                }
                className="w-full"
              >
                {isMinting || isMintConfirming ? "添加中..." : "添加流动性"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {positionsLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">暂无头寸</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>交易对</TableHead>
                    <TableHead>Position ID</TableHead>
                    <TableHead>费率</TableHead>
                    <TableHead>流动性</TableHead>
                    <TableHead>价格范围</TableHead>
                    <TableHead>待收取手续费</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPositions.map((position: PositionInfo) => (
                    <PositionTableRow key={position.id.toString()} position={position} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 分页 */}
          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          {/* 分页信息 */}
          <div className="mt-2 text-sm text-muted-foreground text-center">
            显示 {startIndex + 1}-{Math.min(endIndex, positions.length)} / 共 {positions.length} 个头寸
          </div>
        </>
      )}
    </main>
  );
}

function PositionTableRow({ position }: { position: PositionInfo }) {
  const queryClient = useQueryClient();
  const { tokenInfo: token0Info } = useTokenInfo(position.token0);
  const { tokenInfo: token1Info } = useTokenInfo(position.token1);

  const { writeContract: burn, data: burnHash, isPending: isBurning } = useWriteContract();
  const { writeContract: collect, data: collectHash, isPending: isCollecting } = useWriteContract();

  const { isLoading: isBurnConfirming, isSuccess: isBurnSuccess } = useWaitForTransactionReceipt({
    hash: burnHash,
  });

  const { isLoading: isCollectConfirming, isSuccess: isCollectSuccess } = useWaitForTransactionReceipt({
    hash: collectHash,
  });

  // 处理操作成功
  useEffect(() => {
    if (isBurnSuccess || isCollectSuccess) {
      queryClient.invalidateQueries();
    }
  }, [isBurnSuccess, isCollectSuccess, queryClient]);

  const handleBurn = () => {
    burn({
      address: CONTRACTS.POSITION_MANAGER,
      abi: POSITION_MANAGER_ABI,
      functionName: "burn",
      args: [position.id],
    });
  };

  const handleCollect = () => {
    collect({
      address: CONTRACTS.POSITION_MANAGER,
      abi: POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [position.id, position.owner],
    });
  };

  const hasFees = position.tokensOwed0 > BigInt(0) || position.tokensOwed1 > BigInt(0);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {token0Info?.symbol || formatAddress(position.token0)} /{" "}
        {token1Info?.symbol || formatAddress(position.token1)}
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs">{position.id.toString()}</span>
      </TableCell>
      <TableCell>{formatFee(position.fee)}</TableCell>
      <TableCell>{formatTokenAmount(position.liquidity)}</TableCell>
      <TableCell>
        Tick {position.tickLower.toString()} - {position.tickUpper.toString()}
      </TableCell>
      <TableCell>
        {hasFees ? (
          <div className="space-y-1">
            <div className="text-sm">
              {formatTokenAmount(position.tokensOwed0, token0Info?.decimals || 18)}{" "}
              {token0Info?.symbol || ""}
            </div>
            <div className="text-sm">
              {formatTokenAmount(position.tokensOwed1, token1Info?.decimals || 18)}{" "}
              {token1Info?.symbol || ""}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {hasFees && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCollect}
              disabled={isCollecting || isCollectConfirming}
            >
              {isCollecting || isCollectConfirming ? "提取中..." : "提取"}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBurn}
            disabled={isBurning || isBurnConfirming}
          >
            {isBurning || isBurnConfirming ? "移除中..." : "移除"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}


/**
 * 错误处理工具函数
 */

export function parseError(error: unknown): string {
  if (error instanceof Error) {
    // 处理常见的用户拒绝错误
    if (error.message.includes("User rejected") || error.message.includes("用户拒绝了")) {
      return "用户取消了交易";
    }
    
    // 处理余额不足
    if (error.message.includes("insufficient funds") || error.message.includes("余额不足")) {
      return "余额不足";
    }
    
    // 处理授权不足
    if (error.message.includes("allowance") || error.message.includes("授权")) {
      return "代币授权不足，请先授权";
    }
    
    // 处理gas相关错误
    if (error.message.includes("gas") || error.message.includes("Gas")) {
      return "Gas费用不足或交易失败";
    }
    
    // 处理超时错误
    if (error.message.includes("timeout") || error.message.includes("超时")) {
      return "交易超时，请重试";
    }
    
    // 返回原始错误信息
    return error.message;
  }
  
  return "未知错误";
}

export function isUserRejectionError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("User rejected") || 
           error.message.includes("用户拒绝了");
  }
  return false;
}


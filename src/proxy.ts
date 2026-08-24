import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 基线内容安全策略：为每个文档请求生成一次性 nonce，注入到 script-src，
// 让 Next 运行时 / hydration 的内联脚本通过 nonce 放行（Next 从请求头的
// Content-Security-Policy 里解析 nonce 并自动加到它生成的内联脚本上），
// 而不是开放 'unsafe-inline'。其余来源收紧到 self。
//
// CSP 只作用于 HTML 文档；API 与静态资源走 matcher 排除。
//
// Next.js 16 起 middleware 约定更名为 proxy（语义更准：请求进入应用前的边缘代理层），
// 函数名同步由 middleware 改为 proxy，config 不变。
export function proxy(request: NextRequest) {
  // 18 字节随机量的 base64，落在 CSP nonce 字符集内。
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const nonce = btoa(String.fromCharCode(...bytes));

  // 开发模式下 React 需要 eval() 重建调用栈等调试功能，必须放行 'unsafe-eval'；
  // 生产模式 React 永不使用 eval，保持收紧以守住 CSP 强度。
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 局域网开发通常使用 HTTP；强制升级会让浏览器改用不存在的 HTTPS 静态资源。
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // 关键：把 CSP 写到请求头，Next 才能从中解析 nonce 应用到内联脚本。
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 排除 API、静态资源与带后缀的文件；CSP 只覆盖页面文档。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};

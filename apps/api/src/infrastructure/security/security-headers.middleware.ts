import type { NextFunction, Request, Response } from 'express';

/**
 * Cabeçalhos de segurança da API (JSON puro, sem HTML): nada de sniffing de tipo, sem moldura,
 * sem referrer, CSP que não permite carregar nada, HSTS em produção e respostas de autenticação
 * sem cache. Em Express, `x-powered-by` também sai.
 */
export function securityHeaders(production: boolean) {
  return (request: Request, response: Response, next: NextFunction): void => {
    response.removeHeader('X-Powered-By');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    if (request.originalUrl.startsWith('/auth')) response.setHeader('Cache-Control', 'no-store');
    next();
  };
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Optional HTTP Basic Auth gate. This portal calls paid third-party APIs on
// every request, so once deployed to a public URL, anyone with the link can
// spend your API credits. Set PORTAL_BASIC_AUTH_USER / PORTAL_BASIC_AUTH_PASS
// to require a login prompt; leave them unset to disable (e.g. local dev).
export function middleware(req: NextRequest) {
  const user = process.env.PORTAL_BASIC_AUTH_USER;
  const pass = process.env.PORTAL_BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [reqUser, reqPass] = decoded.split(':');
    if (reqUser === user && reqPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AI Detector Testing Portal"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};

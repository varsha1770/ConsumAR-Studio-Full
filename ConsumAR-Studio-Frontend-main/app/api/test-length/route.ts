import { NextResponse } from 'next/server';

export async function GET() {
  const buffer = new ArrayBuffer(100);
  const headers = new Headers();
  headers.set('Content-Length', '100');
  headers.set('Accept-Ranges', 'bytes');
  return new NextResponse(buffer, { status: 206, headers });
}

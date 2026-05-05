import { NextRequest, NextResponse } from 'next/server';

/**
 * Universal S3 Proxy (V6 Reliability Pass)
 * This route fetches content from Amazon S3 on the server side
 * to bypass browser CORS blocks. It now uses pure 'fetch' which is faster
 * and much more reliable for signed security links.
 * 
 * UPDATE: Now supports local backend models (localhost:5001) to bypass local CORS blocks.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const isS3 = hostname.includes(".s3.") || hostname.endsWith(".amazonaws.com");
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

    if (isS3 || isLocal) {
      console.log(`[proxy-model] >> START PROXY for: ${url}`);
      
      const tryFetch = async (targetUrl: string) => {
        return fetch(targetUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Accept': '*/*' }
        });
      };

      let response = await tryFetch(url);
      
      // V16: IPv6 -> IPv4 Fallback
      if (!response.ok && url.includes("localhost")) {
        const fallbackUrl = url.replace("localhost", "127.0.0.1");
        console.warn(`[proxy-model] IPv6 Fail, trying IPv4: ${fallbackUrl}`);
        response = await tryFetch(fallbackUrl);
      }

      if (!response.ok) {
        console.error(`[proxy-model] Backend error ${response.status} for ${url}`);
        return new NextResponse(null, { status: response.status });
      }

      let contentType = response.headers.get('content-type');
      if (!contentType || contentType === 'application/octet-stream') {
        if (url.toLowerCase().endsWith('.glb')) contentType = 'model/gltf-binary';
        else if (url.toLowerCase().endsWith('.usdz')) contentType = 'model/vnd.usdz+zip';
        else contentType = 'application/octet-stream';
      }

      // V17: High Performance Streaming
      // Directly stream the body to avoid the 'await response.blob()' bottleneck.
      // This allows the data to flow to the browser immediately.
      console.log(`[proxy-model] SUCCESS (Streaming): Starting transfer for ${url}`);

      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          // Pass through content-length if available for browser progress tracking
          ...(response.headers.get('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}),
        },
      });
    }

    return new NextResponse('Access Denied', { status: 403 });

  } catch (err: any) {
    console.error('[proxy-model] Fatal Error:', err.message);
    return new NextResponse(`Proxy error: ${err.message}`, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

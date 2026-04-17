import { NextRequest, NextResponse } from 'next/server';

/**
 * Universal S3 Proxy (V6 Reliability Pass)
 * This route fetches content from Amazon S3 on the server side
 * to bypass browser CORS blocks. It now uses pure 'fetch' which is faster
 * and much more reliable for signed security links.
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
    
    // Check if it's an S3 URL (Regional or Global)
    if (hostname.includes(".s3.") || hostname.endsWith(".amazonaws.com")) {
      console.log(`[proxy-model] Universal Fetch: ${url.substring(0, 80)}...`);
      
      const fetchRes = await fetch(url, {
        method: 'GET',
        // Next.js cache bypass to ensure fresh models
        cache: 'no-store'
      });
      
      if (!fetchRes.ok) {
        throw new Error(`S3 Fetch failed with status ${fetchRes.status}`);
      }

      const headers: Record<string, string> = {
        'Content-Type': fetchRes.headers.get('Content-Type') || (url.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream'),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, max-age=3600',
      };

      const contentLength = fetchRes.headers.get('Content-Length');
      if (contentLength) {
        headers['Content-Length'] = contentLength;
      }

      // Stream the response body directly to the client
      return new NextResponse(fetchRes.body, { status: 200, headers });
    }

    return NextResponse.json({ error: 'Only S3 URLs are supported via this proxy' }, { status: 403 });

  } catch (err: any) {
    console.error('[proxy-model] Universal Error:', err);
    return NextResponse.json({ 
      error: 'Proxy Fetch Failed', 
      details: err.message,
      code: err.name 
    }, { status: 500 });
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

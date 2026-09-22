import { NextRequest, NextResponse } from 'next/server';

/**
 * Universal S3 Proxy (V6 Reliability Pass)
 * This route fetches content from Amazon S3 on the server side
 * to bypass browser CORS blocks. It now uses pure 'fetch' which is faster
 * and much more reliable for signed security links.
 * 
 * UPDATE: Now supports local backend models (localhost:5001) to bypass local CORS blocks.
 */
export async function GET(request: NextRequest, { params }: { params: any }) {
  const { searchParams } = new URL(request.url);
  let url = searchParams.get('url');

  // Next.js 15+ compatibility: params is a promise
  const resolvedParams = await Promise.resolve(params);

  // V20: Apple AR Quick Look URL Fix (Base64 path encoding with chunking)
  if (!url && resolvedParams?.path && resolvedParams.path.length >= 2) {
    try {
      // All segments except the last one (which is file.usdz) make up the base64 URL
      const chunks = resolvedParams.path.slice(0, -1);
      const encodedUrl = chunks.join('');
      // Decode base64url to regular URL
      let base64 = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      url = Buffer.from(base64, 'base64').toString('utf-8');
    } catch (e) {
      console.error('[proxy-model] Failed to decode base64url:', resolvedParams.path);
    }
  }

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

    if (isHttp) {
      console.log(`[proxy-model] >> START PROXY for: ${url}`);
      
      // FIX: Node fetch() hangs on Windows when connecting to IPv6 localhost if Python is on IPv4
      let targetUrl = url;
      try {
        const u = new URL(targetUrl);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          u.hostname = '127.0.0.1';
          targetUrl = u.toString();
        }
      } catch (e) {}

      const tryFetch = async (fetchUrl: string) => {
        return fetch(fetchUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Accept': '*/*' }
        });
      };

      let response: Response | null = null;
      try {
        response = await tryFetch(targetUrl);
      } catch (fetchErr: any) {
        console.warn(`[proxy-model] Primary fetch failed for ${targetUrl}:`, fetchErr.message);
      }

      // Fallback: If primary fetch failed or returned non-200, try local Python backend (http://127.0.0.1:5001/models/<filename>)
      if (!response || !response.ok) {
        const cleanUrl = targetUrl.split('?')[0];
        const filename = cleanUrl.split('/').pop();
        if (filename && (filename.endsWith('.glb') || filename.endsWith('.usdz'))) {
          const fallbackLocalUrl = `http://127.0.0.1:5001/models/${filename}`;
          console.log(`[proxy-model] Attempting local backend fallback: ${fallbackLocalUrl}`);
          try {
            const fallbackRes = await tryFetch(fallbackLocalUrl);
            if (fallbackRes.ok) {
              response = fallbackRes;
            }
          } catch (fallbackErr: any) {
            console.warn(`[proxy-model] Fallback fetch failed:`, fallbackErr.message);
          }
        }
      }

      if (!response || !response.ok) {
        const status = response ? response.status : 502;
        const errorText = response ? await response.text() : "Network Connection Failed";
        console.error(`[proxy-model] Backend error ${status} for ${url} | Response: ${errorText}`);
        return new NextResponse(`Model Load Error: ${errorText}`, { status });
      }

      let contentType = response.headers.get('content-type') || '';
      if (!contentType || contentType === 'application/octet-stream' || contentType === 'binary/octet-stream') {
        const urlWithoutQuery = url.split('?')[0].toLowerCase();
        if (urlWithoutQuery.endsWith('.glb')) contentType = 'model/gltf-binary';
        else if (urlWithoutQuery.endsWith('.usdz')) contentType = 'model/vnd.usdz+zip';
        else contentType = 'application/octet-stream';
      }

      // V18: Apple AR Quick Look Fix
      // We CANNOT stream `response.body` here. Next.js converts streams to `Transfer-Encoding: chunked`
      // and strips the Content-Length header. Apple AR Quick Look strictly REQUIRES a Content-Length
      // header and will infinitely spin if it receives a chunked stream.
      console.log(`[proxy-model] Buffering ${url} into memory to satisfy Apple AR Quick Look...`);
      const buffer = await response.arrayBuffer();
      console.log(`[proxy-model] SUCCESS: Buffered ${buffer.byteLength} bytes.`);

      const headers: any = {
        'Content-Type': contentType,
        // V21: Apple AR Quick Look Filename Fix
        'Content-Disposition': `inline; filename="model${contentType.includes('usdz') ? '.usdz' : '.glb'}"`,
        'Access-Control-Allow-Origin': '*',
        // V19: Apple AR Quick Look Compression Fix
        'Cache-Control': 'public, max-age=3600, no-transform',
        'Accept-Ranges': 'bytes',
        'Content-Length': buffer.byteLength.toString(),
      };

      // V22: Apple AR Quick Look Range Request Fix
      // Safari/quicklookd uses HTTP Range requests (e.g. bytes=0-1, bytes=-22) to probe the end of the ZIP file
      // for the Central Directory. If we return 200 OK with the full file instead of 206 Partial Content, it fails to parse!
      const rangeHeader = request.headers.get('range');
      
      if (rangeHeader) {
        console.log(`[proxy-model] Range request detected: ${rangeHeader}`);
        
        let start = 0;
        let end = buffer.byteLength - 1;
        
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        
        if (parts[0]) {
          start = parseInt(parts[0], 10);
        } else if (parts[1]) {
          // e.g. bytes=-22 (last 22 bytes)
          start = buffer.byteLength - parseInt(parts[1], 10);
        }
        
        if (parts[1] && parts[0]) {
          end = parseInt(parts[1], 10);
        }
        
        if (start < 0) start = 0;
        if (end >= buffer.byteLength) end = buffer.byteLength - 1;
        
        if (isNaN(start) || isNaN(end) || start > end || start >= buffer.byteLength) {
          headers['Content-Range'] = `bytes */${buffer.byteLength}`;
          return new NextResponse(null, { status: 416, headers });
        }
        
        const chunk = buffer.slice(start, end + 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${buffer.byteLength}`;
        headers['Content-Length'] = chunk.byteLength.toString();
        
        return new NextResponse(chunk, { status: 206, headers });
      }

      // No range request, return full file
      headers['Content-Length'] = buffer.byteLength.toString();
      return new NextResponse(buffer, { status: 200, headers });
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

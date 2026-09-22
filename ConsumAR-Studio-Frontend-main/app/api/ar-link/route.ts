import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Create a global cache that survives Next.js HMR in development
const globalThisWithCache = global as typeof globalThis & {
  __arLinksCache?: Map<string, { glbUrl: string; usdzUrl: string; expiresAt: number }>;
  __pendingArConversions?: Set<string>;
};

if (!globalThisWithCache.__arLinksCache) {
  globalThisWithCache.__arLinksCache = new Map();
}
if (!globalThisWithCache.__pendingArConversions) {
  globalThisWithCache.__pendingArConversions = new Set();
}

const cache = globalThisWithCache.__arLinksCache;
const pendingConversions = globalThisWithCache.__pendingArConversions;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function POST(req: NextRequest) {
  try {
    const { glbUrl, usdzUrl, id: providedId } = await req.json();

    if (!glbUrl && !usdzUrl) {
      return NextResponse.json({ error: 'Missing URLs' }, { status: 400 });
    }

    // Clean up expired links periodically
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now > value.expiresAt) {
        cache.delete(key);
      }
    }

    const id = providedId || Math.random().toString(36).substring(2, 8); // Generate 6 character ID if missing
    
    // Preserve existing URLs if not updating them
    const existing = cache.get(id);

    let targetGlb = glbUrl || (existing ? existing.glbUrl : '');
    let targetUsdz = usdzUrl || (existing ? existing.usdzUrl : '');

    // Map sample models to their pre-built static USDZ files
    if (targetGlb.includes('sample1') || targetGlb.includes('sample-model-1')) {
      targetUsdz = '/sample1.usdz';
    } else if (targetGlb.includes('sample2') || targetGlb.includes('sample-model-2')) {
      targetUsdz = '/sample2.usdz';
    } else if (targetGlb.includes('sample3') || targetGlb.includes('sample-model-3')) {
      targetUsdz = '/sample3.usdz';
    }

    cache.set(id, {
      glbUrl: targetGlb,
      usdzUrl: targetUsdz,
      expiresAt: now + CACHE_TTL_MS
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('[ar-link] POST error:', error);
    return NextResponse.json({ error: 'Failed to create AR link' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const data = cache.get(id);

    if (!data) {
      return NextResponse.json({ error: 'Link expired or not found' }, { status: 404 });
    }

    // Map sample models to their pre-built static USDZ files
    if (data.glbUrl) {
      if (data.glbUrl.includes('sample1') || data.glbUrl.includes('sample-model-1')) {
        data.usdzUrl = '/sample1.usdz';
      } else if (data.glbUrl.includes('sample2') || data.glbUrl.includes('sample-model-2')) {
        data.usdzUrl = '/sample2.usdz';
      } else if (data.glbUrl.includes('sample3') || data.glbUrl.includes('sample-model-3')) {
        data.usdzUrl = '/sample3.usdz';
      }
    }

    // On-Demand Conversion Trigger for custom non-sample models on iOS AR
    if (!data.usdzUrl && data.glbUrl && !pendingConversions.has(id)) {
      pendingConversions.add(id);

      (async () => {
        try {
          console.log(`[ar-link] Triggering on-demand USDZ conversion for ID: ${id}`);
          const cleanUrl = data.glbUrl.split('?')[0];
          const filename = cleanUrl.split('/').pop() || 'model.glb';
          const s3_key = filename.includes('.glb') ? filename : 'sample2.glb';

          const fd = new FormData();
          fd.append('s3_key', s3_key);
          const hostHeader = req.headers.get('host') || '127.0.0.1:3000';
          const protocol = req.headers.get('x-forwarded-proto') || 'http';
          const fullGlbUrl = data.glbUrl.startsWith('/') ? `${protocol}://${hostHeader}${data.glbUrl}` : data.glbUrl;
          fd.append('glb_url', fullGlbUrl);
          fd.append('tier', 'NON_LOGGED');
          fd.append('watermark', 'true');
          fd.append('watermark_text', 'TryitFirstLabs');

          const res = await axios.post('http://127.0.0.1:5001/api/convert-usdz', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000
          });

          const resData = res.data;
          const usdzUrl = resData.usdz_url || resData.file_url || resData.url;
          if (usdzUrl) {
            const ext = '.usdz';
            const encodedUrl = Buffer.from(usdzUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const chunks = encodedUrl.match(/.{1,200}/g)?.join('/') || encodedUrl;
            const proxiedUsdz = `/api/proxy-model/${chunks}/file${ext}`;

            data.usdzUrl = proxiedUsdz;
            cache.set(id, data);
            console.log(`[ar-link] Successfully updated USDZ for ID ${id} -> ${proxiedUsdz}`);
          }
        } catch (e: any) {
          console.error('[ar-link] On-demand USDZ conversion error:', e.message);
        } finally {
          pendingConversions.delete(id);
        }
      })();
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[ar-link] GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve AR link' }, { status: 500 });
  }
}

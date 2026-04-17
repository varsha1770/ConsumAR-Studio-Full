import { NextResponse } from 'next/server';

const EC2_USDZ_URL = process.env.EC2_USDZ_URL;

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const incomingForm = await request.formData();
    const s3_key = incomingForm.get('s3_key');
    const glb_url = incomingForm.get('glb_url');

    console.log('[convert-usdz] Received s3_key:', s3_key);

    if (!s3_key) {
      return NextResponse.json({ success: false, error: 'No s3_key provided' }, { status: 400 });
    }

    const GLB_OUTPUT_BUCKET = 'glb-output';
    const PRESIGNED_URL_SERVICE = process.env.PRESIGNED_URL_SERVICE!;

    async function ensureInGlbOutputBucketLocal(key: string, url: string | null): Promise<string> {
      if (!url || url.includes(`${GLB_OUTPUT_BUCKET}.s3`)) return key;

      const fileRes = await fetch(url, { cache: 'no-store' });
      if (!fileRes.ok) throw new Error(`Failed to download source GLB (${fileRes.status})`);
      
      const contentLength = fileRes.headers.get('content-length');

      const signedRes = await fetch(`${PRESIGNED_URL_SERVICE}?bucket_name=${GLB_OUTPUT_BUCKET}&file_type=glb`);
      if (!signedRes.ok) throw new Error(`Failed to get presigned URL (${signedRes.status})`);
      const { upload_url, file_key } = await signedRes.json();

      const headers: Record<string, string> = { 'Content-Type': 'model/gltf-binary' };
      if (contentLength) headers['Content-Length'] = contentLength;

      const arrayBuffer = await fileRes.arrayBuffer();

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: arrayBuffer,
        headers,
      });
      if (!putRes.ok) throw new Error(`Failed to upload to glb-output (${putRes.status})`);
      
      return file_key;
    }

    // Re-host into glb-output if needed (V17 Absolute Bypass)
    const s3KeyStr = s3_key as string;
    let effective_key = s3KeyStr;
    const isLocal = s3KeyStr && (s3KeyStr.includes(":\\") || s3KeyStr.includes("storage\\"));
    
    if (isLocal) {
        console.log(`[convert-usdz] V17: Bypassing re-host for local path: ${s3_key}`);
    } else {
        try {
            effective_key = await ensureInGlbOutputBucketLocal(s3_key as string, glb_url as string | null);
            console.log(`[convert-usdz] Re-hosted to glb-output: ${effective_key}`);
        } catch (reHostErr: any) {
            console.error('[convert-usdz] Re-host error:', reHostErr.message);
        }
    }

    // Build FormData for EC2
    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);

    console.log('[convert-usdz] Forwarding to EC2...');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600_000); // 10-minute maximum conversion timeout

    let ec2Response;
    try {
      ec2Response = await fetch(EC2_USDZ_URL!, {
        method: 'POST',
        body: ec2Form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await ec2Response.text();
    console.log(`[convert-usdz] EC2 ${ec2Response.status}:`, text);

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `EC2 error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('[convert-usdz] error:', err);

    if (err.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Conversion timed out.' }, { status: 504 });
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json({ success: false, error: 'Cannot reach EC2.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

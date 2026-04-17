import { NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes (requires Vercel Pro, but prevents Next.js hard timeouts)

const EC2_RESIZE_URL = process.env.EC2_RESIZE_URL;
const PRESIGNED_URL_SERVICE = process.env.PRESIGNED_URL_SERVICE!;
const GLB_OUTPUT_BUCKET = 'glb-output';

/**
 * If the GLB lives outside glb-output (i.e. a manual upload to tryitproductmodels),
 * download it and re-upload it into glb-output so the EC2 resize script can find it.
 * Returns the new s3_key in glb-output, or the original key if no re-hosting is needed.
 */
async function ensureInGlbOutputBucket(
  s3_key: string,
  glb_url: string | null
): Promise<string> {
  // If no URL provided, or URL is already from glb-output, use key as-is
  if (!glb_url || glb_url.includes(`${GLB_OUTPUT_BUCKET}.s3`)) {
    return s3_key;
  }

  // 1. Fetch the GLB bytes from the current presigned URL natively as stream!
  const fileRes = await fetch(glb_url, { cache: 'no-store' });
  if (!fileRes.ok) throw new Error(`Failed to download source GLB (${fileRes.status})`);
  
  // Extract exact content-length to prevent AWS S3 chunked protocol 501 rejection
  const contentLength = fileRes.headers.get('content-length');

  // 2. Get a presigned PUT URL for glb-output bucket
  const signedRes = await fetch(
    `${PRESIGNED_URL_SERVICE}?bucket_name=${GLB_OUTPUT_BUCKET}&file_type=glb`
  );
  if (!signedRes.ok) throw new Error(`Failed to get presigned URL (${signedRes.status})`);
  const { upload_url, file_key } = await signedRes.json();

  // 3. PUT the file into glb-output cleanly without memory crashes
  const headers: Record<string, string> = { 'Content-Type': 'model/gltf-binary' };
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  const arrayBuffer = await fileRes.arrayBuffer();

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    body: arrayBuffer,
    headers,
  });
  if (!putRes.ok) throw new Error(`Failed to stream GLB to glb-output (${putRes.status})`);

  return file_key;
}

export async function POST(request: Request) {
  try {
    const incomingForm = await request.formData();
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[resize][${requestId}] Request started`);
    
    // Check if we are receiving a direct file (Tunnel Mode)
    const file = incomingForm.get('file') as File | null;
    const depth = incomingForm.get('depth') as string | null;
    const width = incomingForm.get('width') as string | null;
    const height = incomingForm.get('height') as string | null;
    const unit = incomingForm.get('unit') as string | null;

    if (file) {
      console.log('[resize] Tunnel Mode: Forwarding file to Python backend');
      
      const pythonForm = new FormData();
      pythonForm.append('file', file);
      if (width) pythonForm.append('width', width);
      if (height) pythonForm.append('height', height);
      if (depth) pythonForm.append('depth', depth);
      pythonForm.append('unit', unit || 'm');

      // Forward to Python backend (bypass browser CORS/404)
      const PYTHON_RESIZE_URL = "http://localhost:5001/resize";
      const pythonRes = await fetch(PYTHON_RESIZE_URL, {
        method: 'POST',
        body: pythonForm,
      });

      if (!pythonRes.ok) {
        const errorText = await pythonRes.text();
        throw new Error(`Python backend error (${pythonRes.status}): ${errorText}`);
      }

      const data = await pythonRes.json();
      return NextResponse.json(data);
    }

    // Legacy S3-based resize logic
    const s3_key = incomingForm.get('s3_key') as string | null;
    const glb_url = incomingForm.get('glb_url') as string | null;

    console.log('[resize] S3 Mode:', { s3_key, glb_url, depth, width, height, unit });

    if (!s3_key) {
      return NextResponse.json({ success: false, error: 'No s3_key or file provided' }, { status: 400 });
    }

    // Re-host into glb-output if the file is from a different bucket (V17 Absolute Bypass)
    const s3KeyStr = s3_key as string;
    const glbUrlStr = glb_url as string || "";
    let effective_key = s3KeyStr;
    const isLocal = s3KeyStr.includes(":\\") || s3KeyStr.includes("storage\\") || glbUrlStr.includes("localhost") || glbUrlStr.includes("127.0.0.1");
    
    if (isLocal) {
        console.log(`[resize] V17: Bypassing re-host for local path: ${s3_key}`);
    } else {
        try {
            effective_key = await ensureInGlbOutputBucket(s3_key, glb_url);
            if (effective_key !== s3_key) {
                console.log(`[resize] Re-hosted to glb-output: ${effective_key}`);
            }
        } catch (reHostErr: any) {
            console.error('[resize] Re-host error:', reHostErr.message);
            return NextResponse.json(
                { success: false, error: `Could not stage file for resize: ${reHostErr.message}` },
                { status: 500 }
            );
        }
    }

    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);
    if (depth)  ec2Form.append('depth',  depth);
    if (width)  ec2Form.append('width',  width);
    if (height) ec2Form.append('height', height);
    if (unit)   ec2Form.append('unit',   unit);

    console.log('[resize] Forwarding to EC2 with key:', effective_key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600_000);

    let ec2Response;
    try {
      ec2Response = await fetch(EC2_RESIZE_URL!, {
        method: 'POST',
        body: ec2Form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await ec2Response.text();
    console.log(`[resize] EC2 ${ec2Response.status}:`, text);

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `EC2 error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);
    console.log(`[resize] Request finished successfully`);
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('[resize] error:', err);

    // If we have a detailed error from the backend response, use it
    const errorMessage = err.response?.data?.error || err.message || 'Internal error';
    const traceback = err.response?.data?.traceback;

    if (err.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Resize timed out.' }, { status: 504 });
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json({ success: false, error: 'Cannot reach EC2/Backend.' }, { status: 503 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      details: traceback
    }, { status: 500 });
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

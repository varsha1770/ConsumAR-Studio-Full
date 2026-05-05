import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const EC2_URL = process.env.EC2_GENERATE_URL;

export async function POST(request: Request) {
  try {
    const incomingForm = await request.formData();
    const files = incomingForm.getAll('images');

    console.log('[generate-3d] files count:', files.length);
    files.forEach((f: any, i: number) =>
      console.log(`  [${i}] name=${f.name} type=${f.type} size=${f.size}`)
    );

    if (!files.length) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }

    // Build a native Web API FormData
    const ec2Form = new FormData();

    for (const file of files) {
      const f = file as File;
      // Re-create as a proper Blob with the original mime type
      const arrayBuf = await f.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: f.type || 'image/jpeg' });
      ec2Form.append('images', blob, f.name || 'upload.jpg');
      console.log(`[generate-3d] appended ${f.name} as blob (${arrayBuf.byteLength} bytes)`);
    }

    const controller = new AbortController();
    const onClientAbort = () => controller.abort();
    request.signal.addEventListener('abort', onClientAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 110_000);

    let ec2Response;
    try {
      ec2Response = await fetch(EC2_URL!, {
        method: 'POST',
        body: ec2Form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', onClientAbort);
    }

    const text = await ec2Response.text();
    console.log(`[generate-3d] EC2 ${ec2Response.status}:`, text);

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `EC2 error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);

    // LOG HISTORY
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        await (prisma as any).historyItem.create({
          data: {
            userId: (session.user as any).id,
            fileName: data.glb_url?.split('/').pop() || "Generated Model",
            action: "UPLOAD",
            glbFile: data.glb_url,
          }
        });
      }
    } catch (logErr) {
      console.warn("[generate-3d] Failed to log history:", logErr);
    }

    return NextResponse.json(data);

  } catch (err: any) {
    if (request.signal.aborted) {
      // User navigated back/cancelled generation; no server error noise needed.
      return new NextResponse(null, { status: 499 });
    }

    console.error('[generate-3d] error:', err);

    if (err.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Generation timed out. Try fewer/smaller images.' },
        { status: 504 }
      );
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { success: false, error: 'Cannot reach EC2. Is the server running?' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
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

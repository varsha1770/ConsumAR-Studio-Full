import { NextRequest, NextResponse } from 'next/server';

const LAMBDA_PRESIGNED_URL = process.env.PRESIGNED_URL_SERVICE!;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bucket_name = searchParams.get('bucket_name');
  const file_type = searchParams.get('file_type');

  if (!bucket_name || !file_type) {
    return NextResponse.json(
      { error: 'Missing bucket_name or file_type' },
      { status: 400 }
    );
  }

  try {
    const lambdaUrl = new URL(LAMBDA_PRESIGNED_URL);
    lambdaUrl.searchParams.set('bucket_name', bucket_name);
    lambdaUrl.searchParams.set('file_type', file_type);

    let lambdaRes: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      lambdaRes = await fetch(lambdaUrl.toString(), { cache: 'no-store' });

      if (lambdaRes.ok || !TRANSIENT_STATUSES.has(lambdaRes.status)) {
        break;
      }

      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
      }
    }

    if (!lambdaRes) {
      return NextResponse.json(
        { error: 'Failed to reach presigned URL service' },
        { status: 502 }
      );
    }

    if (!lambdaRes.ok) {
      const text = await lambdaRes.text();
      return NextResponse.json(
        { error: `Lambda error (${lambdaRes.status}): ${text}` },
        { status: lambdaRes.status }
      );
    }

    const data = await lambdaRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[presigned-url] error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to get presigned URL' },
      { status: 500 }
    );
  }
}

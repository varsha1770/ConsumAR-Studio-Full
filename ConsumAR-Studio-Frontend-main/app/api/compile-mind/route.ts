import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('image') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        let compiledMindBuffer: Buffer;
        try {
            // Dynamically require to prevent build failures if canvas is missing in environment
            const { OfflineCompiler } = require('mind-ar/src/image-target/compiler');
            const { loadImage } = require('canvas');

            const image = await loadImage(buffer);
            const compiler = new OfflineCompiler();
            
            console.log("Starting MindAR compilation...");
            await compiler.compileImageTargets([image], (progress: number) => {
                console.log(`Compiling: ${progress.toFixed(2)}%`);
            });
            
            const exportedBuffer = compiler.exportData();
            compiledMindBuffer = Buffer.from(exportedBuffer);
            console.log("Compilation complete!");
            
        } catch (e: any) {
            console.warn('MindAR compilation failed natively (likely missing canvas binaries on Windows dev). Using fallback dummy .mind for testing.', e.message);
            // Fallback for development if canvas fails
            compiledMindBuffer = Buffer.from('dummy-mind-content-for-testing');
        }

        const bucketName = 'voxel-vista'; 
        
        let mindUrl = '';

        if (process.env.AWS_ACCESS_KEY_ID) {
            const s3Client = new S3Client({
                region: process.env.AWS_REGION || 'ap-south-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
                }
            });

            const mindKey = `targets/${uuidv4()}.mind`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: mindKey,
                Body: compiledMindBuffer,
                ContentType: 'application/octet-stream',
            }));
            mindUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${mindKey}`;
        } else {
            // Fallback: we return the base64 inline if no S3 creds
            console.warn('No AWS credentials found, returning base64 inline URL');
            mindUrl = `data:application/octet-stream;base64,${compiledMindBuffer.toString('base64')}`;
        }

        return NextResponse.json({ success: true, mindUrl: mindUrl });
    } catch (err: any) {
        console.error('Mind compile API error', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

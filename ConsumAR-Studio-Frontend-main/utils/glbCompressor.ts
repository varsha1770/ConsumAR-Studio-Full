import { WebIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { draco, quantize, weld, dedup } from "@gltf-transform/functions";
// @ts-ignore
import draco3d from "draco3d";

export async function compressGLB(file: File): Promise<File> {
  // Read the file into an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Fetch Draco WASM binaries from CDN to avoid Next.js bundling issues
  const [decoderWasm, encoderWasm] = await Promise.all([
    fetch("https://unpkg.com/draco3d@1.5.7/draco_decoder.wasm").then((r) => r.arrayBuffer()),
    fetch("https://unpkg.com/draco3d@1.5.7/draco_encoder.wasm").then((r) => r.arrayBuffer()),
  ]);

  // Initialize Draco modules using the fetched WebAssembly binaries
  const decoderModule = await draco3d.createDecoderModule({ wasmBinary: decoderWasm });
  const encoderModule = await draco3d.createEncoderModule({ wasmBinary: encoderWasm });

  // Create WebIO instance and register extensions/dependencies
  const io = new WebIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": decoderModule,
      "draco3d.encoder": encoderModule,
    });

  // Read the GLB 
  const document = await io.readBinary(new Uint8Array(arrayBuffer));

  // Apply standard optimizations followed by Draco Compression
  await document.transform(
    weld(),
    quantize(),
    dedup(),
    draco()
  );

  // Write out the compressed binary output
  const compressedBuffer = await io.writeBinary(document);

  // Return it as a new File
  return new File([compressedBuffer], file.name, {
    type: "model/gltf-binary",
  });
}

export async function decompressGLBIfDraco(file: File): Promise<File> {
  try {
    // Fast check: Read first 150KB for JSON chunk to hunt for Draco extension
    const headerBuffer = await file.slice(0, 150 * 1024).arrayBuffer();
    const text = new TextDecoder("utf-8").decode(headerBuffer);
    if (!text.includes("KHR_draco_mesh_compression")) {
      return file; // Already an uncompressed standard GLB!
    }

    console.log("Draco compression detected in source file. Decompressing for backend compatibility...");
    const arrayBuffer = await file.arrayBuffer();

    const [decoderWasm, encoderWasm] = await Promise.all([
      fetch("https://unpkg.com/draco3d@1.5.7/draco_decoder.wasm").then((r) => r.arrayBuffer()),
      fetch("https://unpkg.com/draco3d@1.5.7/draco_encoder.wasm").then((r) => r.arrayBuffer()),
    ]);

    const decoderModule = await draco3d.createDecoderModule({ wasmBinary: decoderWasm });
    const encoderModule = await draco3d.createEncoderModule({ wasmBinary: encoderWasm });

    const io = new WebIO()
      .registerExtensions(KHRONOS_EXTENSIONS)
      .registerDependencies({
        "draco3d.decoder": decoderModule,
        "draco3d.encoder": encoderModule,
      });

    const document = await io.readBinary(new Uint8Array(arrayBuffer));
    
    // Writing without calling .transform(draco()) strips the extension and writes uncompressed buffers
    const uncompressedBuffer = await io.writeBinary(document);
    
    return new File([uncompressedBuffer], file.name, {
      type: "model/gltf-binary",
    });
  } catch (error) {
    console.error("Decompression failed, proceeding with original:", error);
    return file;
  }
}

export async function processModelLocally(
  fileOrBlob: File | Blob,
  scaleFactors: [number, number, number],
  fileName: string
): Promise<File> {
  const arrayBuffer = await fileOrBlob.arrayBuffer();

  const [decoderWasm, encoderWasm] = await Promise.all([
    fetch("https://unpkg.com/draco3d@1.5.7/draco_decoder.wasm").then((r) => r.arrayBuffer()),
    fetch("https://unpkg.com/draco3d@1.5.7/draco_encoder.wasm").then((r) => r.arrayBuffer()),
  ]);

  const decoderModule = await draco3d.createDecoderModule({ wasmBinary: decoderWasm });
  const encoderModule = await draco3d.createEncoderModule({ wasmBinary: encoderWasm });

  const io = new WebIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": decoderModule,
      "draco3d.encoder": encoderModule,
    });

  const document = await io.readBinary(new Uint8Array(arrayBuffer));
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];

  if (scene) {
    for (const node of scene.listChildren()) {
      const currentScale = node.getScale();
      node.setScale([
        currentScale[0] * scaleFactors[0],
        currentScale[1] * scaleFactors[1],
        currentScale[2] * scaleFactors[2],
      ]);
    }
  }

  // Write raw uncompressed buffer so AWS S3 storage is safely uncompressed for future USDZ converters (Backend does not natively parse Draco)
  const uncompressedBuffer = await io.writeBinary(document);

  return new File([uncompressedBuffer], fileName, {
    type: "model/gltf-binary",
  });
}

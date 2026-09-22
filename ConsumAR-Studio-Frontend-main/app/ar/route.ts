import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const mindUrl = searchParams.get('mind');
    const glbUrl = searchParams.get('glb');

    if (!mindUrl || !glbUrl) {
        return new NextResponse("Missing mind or glb URL parameters", { status: 400 });
    }

    const html = `
    <html>
      <head>
        <title>Web AR Experience</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
        <style>
          body { margin: 0; overflow: hidden; background-color: #000; }
          #loading { 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            z-index: 9999; 
            font-family: system-ui, -apple-system, sans-serif; 
            background: rgba(255, 255, 255, 0.9); 
            padding: 20px 30px; 
            border-radius: 16px; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); 
            text-align: center;
            font-weight: 600;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div id="loading">Initializing AR Engine...<br/><small style="font-weight:normal;color:#666;">Please allow camera access</small></div>
        
        <a-scene 
            mindar-image="imageTargetSrc: ${mindUrl}; autoStart: true; uiLoading: no; uiError: no;" 
            color-space="sRGB" 
            renderer="colorManagement: true, physicallyCorrectLights" 
            vr-mode-ui="enabled: false" 
            device-orientation-permission-ui="enabled: false">
          
          <a-assets>
            <a-asset-item id="avatarModel" src="${glbUrl}"></a-asset-item>
          </a-assets>

          <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
          
          <a-entity mindar-image-target="targetIndex: 0">
            <!-- 3D model attached to the image -->
            <a-gltf-model rotation="0 0 0" position="0 0 0.1" scale="1 1 1" src="#avatarModel"></a-gltf-model>
          </a-entity>
        </a-scene>
        
        <script>
            const sceneEl = document.querySelector('a-scene');
            sceneEl.addEventListener('loaded', () => {
                document.getElementById('loading').innerHTML = 'Waiting for camera...';
            });
            sceneEl.addEventListener('arReady', () => {
                document.getElementById('loading').style.display = 'none';
                console.log("AR is ready");
            });
            sceneEl.addEventListener('arError', (ev) => {
                console.error("AR Error", ev);
                document.getElementById('loading').innerHTML = "Camera access denied or AR failed to load.<br/><small>Please reload and grant camera permissions.</small>";
            });
        </script>
      </body>
    </html>
    `;

    return new NextResponse(html, {
        headers: {
            'Content-Type': 'text/html',
        }
    });
}

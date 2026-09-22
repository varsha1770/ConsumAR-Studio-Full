const fs = require('fs');
async function test() {
  const fileBuffer = fs.readFileSync('../ConsumAR-Studio-Frontend-main/public/sample.glb');
  const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
  
  const pythonForm = new FormData();
  pythonForm.append('file', fileBlob, 'sample.glb');
  pythonForm.append('width', '10');
  
  const tempReq = new Request('http://localhost:5001/resize', { method: 'POST', body: pythonForm });
  const reqBuffer = await tempReq.arrayBuffer();
  
  try {
    const res = await fetch('http://localhost:5001/resize', {
      method: 'POST',
      headers: {
        'Content-Type': tempReq.headers.get('Content-Type'),
        'Content-Length': reqBuffer.byteLength.toString()
      },
      body: reqBuffer
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}
test();

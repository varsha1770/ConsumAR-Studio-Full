const fileBlob = new Blob(['dummy content'], { type: 'application/octet-stream' });
const pythonForm = new FormData();
pythonForm.append('file', fileBlob, 'model.glb');
pythonForm.append('width', '10');

async function test() {
  const tempReq = new Request('http://localhost', { method: 'POST', body: pythonForm });
  const reqBuffer = await tempReq.arrayBuffer();
  console.log('Buffer length:', reqBuffer.byteLength);
  console.log('Content-Type:', tempReq.headers.get('Content-Type'));
}
test();

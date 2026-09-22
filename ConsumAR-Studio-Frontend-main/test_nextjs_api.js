const fs = require('fs');
async function test() {
  const fileBuffer = fs.readFileSync('../ConsumAR-Studio-Frontend-main/public/sample.glb');
  const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
  
  const form = new FormData();
  form.append('file', fileBlob, 'sample.glb');
  form.append('width', '10');
  
  try {
    const res = await fetch('http://localhost:3000/api/resize', {
      method: 'POST',
      body: form
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();

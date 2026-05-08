const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function testApi() {
  try {
    console.log("Reading test model...");
    const fileBytes = fs.readFileSync('../3dstudio-backend-main/BoxTextured.glb');
    
    const fd = new FormData();
    fd.append('file', fileBytes, { filename: 'BoxTextured.glb' });
    fd.append('s3_key', 'test_model.glb');
    fd.append('glb_url', 'http://example.com/test_model.glb');
    fd.append('width', '0');
    fd.append('height', '0');
    fd.append('depth', '0');
    fd.append('unit', 'm');
    fd.append('auto_watermark', 'true');
    fd.append('force_watermark', 'true');
    fd.append('tier', 'FREE');

    console.log("Sending POST to /api/resize...");
    const res = await axios.post("http://localhost:3000/api/resize", fd, {
      headers: fd.getHeaders()
    });

    console.log("Success Data:", res.data);
  } catch (err) {
    if (err.response) {
      console.error("Error Status:", err.response.status);
      console.error("Error Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error Message:", err.message);
      if (err.stack) console.error("Error Stack:", err.stack);
    }
  }
}

testApi();

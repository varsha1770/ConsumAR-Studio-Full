const fs = require('fs');
const FormDataNode = require('form-data');
const axios = require('axios');

async function test() {
  const fileBuffer = fs.readFileSync('../ConsumAR-Studio-Frontend-main/public/sample.glb');
  
  const nodeForm = new FormDataNode();
  nodeForm.append('file', fileBuffer, { filename: 'sample.glb' });
  nodeForm.append('width', '10');
  
  try {
    const rawRes = await axios.post('http://localhost:5001/resize', nodeForm, {
      headers: nodeForm.getHeaders(),
      validateStatus: () => true
    });
    console.log(rawRes.status);
    console.log(rawRes.data);
  } catch (e) {
    console.error(e);
  }
}
test();

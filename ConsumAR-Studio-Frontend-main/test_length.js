const FormDataNode = require('form-data');
const nodeForm = new FormDataNode();
const fileBufferObj = Buffer.from('dummy data');
nodeForm.append('file', fileBufferObj, { filename: 'model.glb' });
console.log(nodeForm.getHeaders());
console.log('Length:', nodeForm.getLengthSync());

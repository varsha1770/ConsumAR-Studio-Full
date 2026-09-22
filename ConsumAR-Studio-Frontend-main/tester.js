const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

(async () => {
  try {
    const form = new FormData();
    form.append('images', Buffer.from('test'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    const res = await fetch('http://localhost:3000/api/generate-3d', {
      method: 'POST',
      body: form,
      headers: {
        'x-guest-mac': 'test_uuid_' + Math.random(), // bypass limit
      }
    });

    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.error(e);
  }
})();

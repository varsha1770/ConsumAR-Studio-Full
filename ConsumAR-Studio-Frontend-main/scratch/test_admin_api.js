async function test() {
  const res = await fetch('http://localhost:3000/api/admin/stats');
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text);
}
test();

import MikroNode from "mikronode";

async function test() {
  const device = new MikroNode('181.209.118.162');
  console.log("Connecting...");
  const [login] = await device.connect();
  
  console.log("Logging in...");
  const conn = await login('interred_api', 'InterRed2026');
  
  console.log("Opening channel...");
  const chan = await conn.openChannel();

  console.log("Running command...");
  await chan.write('/system/identity/print');

  chan.on('data', data => {
    console.log("SUCCESS:");
    data.forEach(item => console.log(item));
    process.exit(0);
  });
}

test().catch(err => { console.error("ERROR", err); process.exit(1); });

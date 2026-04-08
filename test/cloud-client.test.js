'use strict';

const assert = require('assert');
const http = require('http');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

function asyncTest(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    result
      .then(() => console.log(`  \x1b[32m\u2713\x1b[0m ${name}`))
      .catch(err => {
        console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
      });
  }
}

console.log('\n  cloud/client.js');

/**
 * Create a local HTTP server that responds with the given handler.
 * Returns { url, close } where url points to the server.
 */
function mockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

asyncTest('apiRequest: successful JSON response', async () => {
  const srv = await mockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: 'hello' }));
  });

  try {
    // Override API_BASE via env
    process.env.CRAG_API_URL = srv.url;
    // Re-require to pick up env change
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    const result = await apiRequest('GET', '/test');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data, 'hello');
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: sends auth header', async () => {
  let receivedAuth = null;
  const srv = await mockServer((req, res) => {
    receivedAuth = req.headers['authorization'];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    await apiRequest('GET', '/auth-test', { token: 'my-secret-token' });
    assert.strictEqual(receivedAuth, 'Bearer my-secret-token');
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: sends JSON body on POST', async () => {
  let receivedBody = null;
  let receivedCT = null;
  const srv = await mockServer((req, res) => {
    receivedCT = req.headers['content-type'];
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      receivedBody = data;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    await apiRequest('POST', '/data', { body: { name: 'test-team' } });
    assert.strictEqual(receivedCT, 'application/json');
    assert.deepStrictEqual(JSON.parse(receivedBody), { name: 'test-team' });
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: throws on HTTP error with JSON body', async () => {
  const srv = await mockServer((req, res) => {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    await apiRequest('GET', '/secret');
    assert.fail('should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 403);
    assert.strictEqual(err.message, 'forbidden');
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: throws on HTTP error with plain text body', async () => {
  const srv = await mockServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    await apiRequest('GET', '/broken');
    assert.fail('should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 500);
    assert.ok(err.message.includes('Internal Server Error'));
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: returns text when not JSON content-type', async () => {
  const srv = await mockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('plain text response');
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    const result = await apiRequest('GET', '/text');
    assert.strictEqual(result, 'plain text response');
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

asyncTest('apiRequest: 409 conflict has correct status', async () => {
  const srv = await mockServer((req, res) => {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'conflict: remote is newer' }));
  });

  try {
    process.env.CRAG_API_URL = srv.url;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
    const { apiRequest } = require('../src/cloud/client');

    await apiRequest('POST', '/push');
    assert.fail('should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 409);
    assert.ok(err.message.includes('conflict'));
  } finally {
    srv.close();
    delete process.env.CRAG_API_URL;
    delete require.cache[require.resolve('../src/cloud/config')];
    delete require.cache[require.resolve('../src/cloud/client')];
  }
});

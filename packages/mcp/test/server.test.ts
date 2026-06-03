import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryTokenStore, PencaClient } from 'penca-ovacion-sdk';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

const tournaments = [{ id: 'T1', name: 'Mundial 2026', shortName: 'Copa 2026', logoName: '' }];

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.endsWith('/api/v1/tournaments') ? tournaments : {};
    return new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

async function connect() {
  const pencaClient = new PencaClient({
    fetch: fakeFetch(),
    tokens: new MemoryTokenStore({ accessToken: 'test' }),
    baseUrl: 'https://api.example.test',
  });
  const server = createServer(pencaClient);
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('mcp server', () => {
  it('registers the expected tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('penca_tournaments');
    expect(names).toContain('penca_predict');
    expect(names).toContain('penca_wall_post');
    expect(names.length).toBeGreaterThanOrEqual(15);
  });

  it('calls a tool and returns JSON content', async () => {
    const client = await connect();
    const res = (await client.callTool({ name: 'penca_tournaments', arguments: {} })) as {
      content: { type: string; text: string }[];
    };
    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed[0].name).toBe('Mundial 2026');
  });
});

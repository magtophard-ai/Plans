import WebSocket from 'ws';

const API = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/api/ws';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failCount++;
  }
}

async function api(path: string, token: string, method = 'GET', body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) return res.json();
  return null;
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    });
    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth_ok') resolve(ws);
      if (msg.type === 'auth_error') { reject(new Error('auth_error')); ws.close(); }
    });
    setTimeout(() => reject(new Error('ws timeout')), 10000);
  });
}

function waitForEvent(ws: WebSocket, eventName: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`timeout waiting for ${eventName}`)); }, timeout);
    const handler = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'event' && msg.event === eventName) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function subscribeAndWait(ws: WebSocket, channel: string, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('subscribe timeout')), timeout);
    const handler = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribed' && msg.channel === channel) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'subscribe', channel }));
  });
}

async function main() {
  console.log('=== Realtime Slice 2 Smoke Test ===\n');

  // Auth two users
  console.log('1. Authenticating users A and B...');
  await api('/auth/otp/send', '', 'POST', { phone: '+79990000000' });
  const authA = await api('/auth/otp/verify', '', 'POST', { phone: '+79990000000', code: '1111' });
  const tokenA: string = authA.access_token;

  await api('/auth/otp/send', '', 'POST', { phone: '+79991111111' });
  const authB = await api('/auth/otp/verify', '', 'POST', { phone: '+79991111111', code: '1111' });
  const tokenB: string = authB.access_token;

  const userAId: string = authA.user.id;
  const userBId: string = authB.user.id;
  assert(!!tokenA && !!tokenB, 'Both users authenticated');

  // Create a plan with both users
  console.log('\n2. Creating plan with A and B as participants...');
  const planRes = await api('/plans', tokenA, 'POST', {
    title: 'Test Plan RT2',
    activity_type: 'bar',
    participant_ids: [userBId],
  });
  const planId: string = planRes.plan.id;
  assert(!!planId, `Plan created: ${planId}`);

  // Accept invitation for B
  const invRes: any = await api('/invitations', tokenB);
  const inv = invRes.invitations?.find((i: any) => i.target_id === planId);
  if (inv) {
    await api(`/invitations/${inv.id}`, tokenB, 'PATCH', { status: 'accepted' });
  }

  // Connect both WS
  console.log('\n3. Connecting WS for A and B...');
  const wsA = await connectWs(tokenA);
  const wsB = await connectWs(tokenB);
  await subscribeAndWait(wsA, `plan:${planId}`);
  await subscribeAndWait(wsB, `plan:${planId}`);
  assert(true, 'Both WS connected and subscribed');

  // --- Test 1: Reconnect + resync ---
  console.log('\n4. Test: reconnect + resync...');
  wsB.close();
  await new Promise<void>((r) => setTimeout(r, 500));
  const wsB2 = await connectWs(tokenB);
  await subscribeAndWait(wsB2, `plan:${planId}`);
  const reFetched: any = await api(`/plans/${planId}`, tokenB);
  assert(!!reFetched.plan, 'Reconnected and can re-fetch plan data');

  // --- Test 2: Optimistic message reconciliation (clientMessageId) ---
  console.log('\n5. Test: optimistic message reconciliation...');
  const cmid = `cmid-test-${Date.now()}`;
  const msgEventPromise = waitForEvent(wsB2, 'plan.message.created');
  const msgRes: any = await api(`/plans/${planId}/messages`, tokenA, 'POST', {
    text: 'Hello with clientMessageId',
    client_message_id: cmid,
  });
  assert(msgRes.message.client_message_id === cmid, `client_message_id roundtripped: ${cmid}`);

  const msgEvent = await msgEventPromise;
  assert(msgEvent.payload.client_message_id === cmid, 'WS event includes client_message_id');

  // --- Test 3: Proposal created appears on B ---
  console.log('\n6. Test: proposal.created appears on B without refresh...');
  const proposalPromise = waitForEvent(wsB2, 'plan.proposal.created');
  await api(`/plans/${planId}/proposals`, tokenA, 'POST', {
    type: 'place',
    value_text: 'Bar TestPlace',
  });
  const propEvent = await proposalPromise;
  assert(propEvent.payload.value_text === 'Bar TestPlace', 'B received proposal via WS');
  assert(propEvent.payload.type === 'place', 'Proposal type is place');
  assert(Array.isArray(propEvent.payload.votes) && propEvent.payload.votes.length === 0, 'Proposal has empty votes');

  // --- Test 4: Vote count updates on B ---
  console.log('\n7. Test: vote.changed appears on B without refresh...');
  const proposalId: string = propEvent.payload.id;

  // B votes, A sees it
  const votePromiseA = waitForEvent(wsA, 'plan.vote.changed');
  await api(`/plans/${planId}/proposals/${proposalId}/vote`, tokenB, 'POST');
  const voteEventA = await votePromiseA;
  assert(voteEventA.payload.action === 'added', 'A received vote.added');
  assert(voteEventA.payload.proposal_id === proposalId, 'Vote proposalId matches');
  assert(voteEventA.payload.voter_id === userBId, 'Vote voterId is B');

  // A votes, B sees it
  const votePromiseB = waitForEvent(wsB2, 'plan.vote.changed');
  await api(`/plans/${planId}/proposals/${proposalId}/vote`, tokenA, 'POST');
  const voteEventB = await votePromiseB;
  assert(voteEventB.payload.action === 'added', 'B received vote.added from A');

  // B unvotes, A sees it
  const unvotePromiseA = waitForEvent(wsA, 'plan.vote.changed');
  await api(`/plans/${planId}/proposals/${proposalId}/vote`, tokenB, 'DELETE');
  const unvoteEventA = await unvotePromiseA;
  assert(unvoteEventA.payload.action === 'removed', 'A received vote.removed from B');

  // --- Test 5: Finalize appears on B ---
  console.log('\n8. Test: finalized appears on B without refresh...');
  // Create a time proposal too, then finalize with both
  const timePropPromise = waitForEvent(wsB2, 'plan.proposal.created');
  await api(`/plans/${planId}/proposals`, tokenA, 'POST', {
    type: 'time',
    value_text: 'Завтра 20:00',
    value_datetime: '2026-05-01T20:00:00+03:00',
  });
  const timePropEvent = await timePropPromise;
  const timeProposalId: string = timePropEvent.payload.id;

  const finalizePromiseB = waitForEvent(wsB2, 'plan.finalized');
  await api(`/plans/${planId}/finalize`, tokenA, 'POST', {
    place_proposal_id: proposalId,
    time_proposal_id: timeProposalId,
  });
  const finalizeEvent = await finalizePromiseB;
  assert(finalizeEvent.payload.plan_id === planId, 'B received plan.finalized');
  assert(finalizeEvent.payload.place_proposal_id === proposalId, 'Finalize includes place proposal id');

  // --- Test 6: Unfinalize appears on B ---
  console.log('\n9. Test: unfinalized appears on B without refresh...');
  const unfinalizePromiseB = waitForEvent(wsB2, 'plan.unfinalized');
  await api(`/plans/${planId}/unfinalize`, tokenA, 'POST');
  const unfinalizeEvent = await unfinalizePromiseB;
  assert(unfinalizeEvent.payload.plan_id === planId, 'B received plan.unfinalized');

  // Cleanup
  wsA.close();
  wsB2.close();

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Smoke test error:', err); process.exit(1); });

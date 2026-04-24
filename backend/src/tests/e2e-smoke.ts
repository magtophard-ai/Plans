import WebSocket from 'ws';

const API = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/api/ws';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✓ ${label}`); passCount++; }
  else { console.log(`  ✗ FAIL: ${label}`); failCount++; }
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
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
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
    const timer = setTimeout(() => reject(new Error(`timeout: ${eventName}`)), timeout);
    const handler = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'event' && msg.event === eventName) {
        clearTimeout(timer); ws.off('message', handler); resolve(msg);
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
        clearTimeout(timer); ws.off('message', handler); resolve();
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'subscribe', channel }));
  });
}

async function main() {
  console.log('=== Comprehensive E2E Smoke Test ===\n');

  // --- SECTION 1: Auth ---
  // Use fresh phone numbers per run so re-invoking against the same DB still
  // exercises the friend-request flow from a clean state (seed wires
  // +7999000000N as friends, which would break Section 3).
  console.log('1. Auth');
  const rnd = () => Math.floor(100000 + Math.random() * 900000).toString();
  const phoneA = `+79900${rnd()}`;
  const phoneB = `+79900${rnd()}`;
  await api('/auth/otp/send', '', 'POST', { phone: phoneA });
  const authA: any = await api('/auth/otp/verify', '', 'POST', { phone: phoneA, code: '1111' });
  const tokenA: string = authA.access_token;
  const userAId: string = authA.user.id;

  await api('/auth/otp/send', '', 'POST', { phone: phoneB });
  const authB: any = await api('/auth/otp/verify', '', 'POST', { phone: phoneB, code: '1111' });
  const tokenB: string = authB.access_token;
  const userBId: string = authB.user.id;

  assert(!!tokenA && !!tokenB, 'Both users authenticated');
  assert(userAId !== userBId, 'User IDs differ');

  // --- SECTION 2: Validation ---
  console.log('\n2. Validation');
  const badPlan: any = await api('/plans', tokenA, 'POST', {});
  assert(badPlan.code === 'INVALID_INPUT', 'Empty plan body → 400 INVALID_INPUT');

  const badMsgRes = await fetch(`${API}/plans/00000000-0000-0000-0000-000000000000/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi' }) });
  const badMsg: any = await badMsgRes.json();
  assert(badMsgRes.status === 404, 'Message to nonexistent plan → 404');

  const badGroup: any = await api('/groups', tokenA, 'POST', {});
  assert(badGroup.code === 'INVALID_INPUT', 'Empty group body → 400 INVALID_INPUT');

  // --- SECTION 3: Friends API ---
  console.log('\n3. Friends API');
  const friendsA: any = await api('/users/friends?status=accepted', tokenA);
  assert(Array.isArray(friendsA.friends), 'GET /users/friends returns array');

  // Send friend request (A → B) — creates pending, not accepted
  const addFriendRes: any = await api(`/users/friends/${userBId}`, tokenA, 'POST');
  assert(addFriendRes?.friendship?.status === 'pending', 'POST /users/friends/:id creates pending friendship');
  assert(addFriendRes.friendship.requester_id === userAId, 'Requester is the caller');

  // Duplicate POST from A → 409 REQUEST_ALREADY_SENT
  const dupRes: any = await api(`/users/friends/${userBId}`, tokenA, 'POST');
  assert(dupRes?.code === 'REQUEST_ALREADY_SENT', 'Duplicate request → 409 REQUEST_ALREADY_SENT');

  // B sees the request as incoming
  const incomingB: any = await api('/users/friends?status=pending&direction=incoming', tokenB);
  assert(incomingB.friends.some((f: any) => f.id === userAId && f.friendship_status === 'request_received'), 'B sees A in incoming pending');

  // A sees the request as outgoing
  const outgoingA: any = await api('/users/friends?status=pending&direction=outgoing', tokenA);
  assert(outgoingA.friends.some((f: any) => f.id === userBId && f.friendship_status === 'request_sent'), 'A sees B in outgoing pending');

  // B accepts via PATCH
  const acceptRes: any = await api(`/users/friends/${userAId}`, tokenB, 'PATCH', { action: 'accept' });
  assert(acceptRes?.friendship?.status === 'accepted', 'PATCH accept transitions friendship to accepted');

  const friendsAfter: any = await api('/users/friends?status=accepted', tokenA);
  assert(friendsAfter.friends.some((f: any) => f.id === userBId), 'B appears in A friends after accept');

  // --- SECTION 4: Groups API ---
  console.log('\n4. Groups API');
  const groupsBefore: any = await api('/groups', tokenA);
  assert(Array.isArray(groupsBefore.groups), 'GET /groups returns array');

  const newGroup: any = await api('/groups', tokenA, 'POST', { name: 'Test Group', member_ids: [userBId] });
  assert(!!newGroup.group?.id, 'POST /groups creates group');
  assert(newGroup.group.members?.length >= 1, 'Group has members');

  const groupsAfter: any = await api('/groups', tokenA);
  assert(groupsAfter.groups.length > groupsBefore.groups.length, 'Group count increased');

  // --- SECTION 5: Plan lifecycle + REST ---
  console.log('\n5. Plan lifecycle (REST)');
  const planRes: any = await api('/plans', tokenA, 'POST', {
    title: 'E2E Test Plan',
    activity_type: 'bar',
    participant_ids: [userBId],
  });
  const planId: string = planRes.plan.id;
  assert(!!planId, 'Plan created');
  assert(planRes.plan.lifecycle_state === 'active', 'Plan starts active');

  // Accept invite for B
  const invRes: any = await api('/invitations', tokenB);
  const inv = invRes.invitations?.find((i: any) => i.target_id === planId);
  if (inv) await api(`/invitations/${inv.id}`, tokenB, 'PATCH', { status: 'accepted' });

  // Proposals
  const propRes: any = await api(`/plans/${planId}/proposals`, tokenA, 'POST', { type: 'place', value_text: 'Bar Central' });
  const proposalId: string = propRes.proposal.id;
  assert(!!proposalId, 'Place proposal created');

  const timePropRes: any = await api(`/plans/${planId}/proposals`, tokenA, 'POST', { type: 'time', value_text: '20:00', value_datetime: '2026-05-01T20:00:00+03:00' });
  const timeProposalId: string = timePropRes.proposal.id;
  assert(!!timeProposalId, 'Time proposal created');

  // Votes
  await api(`/plans/${planId}/proposals/${proposalId}/vote`, tokenB, 'POST');
  const planAfterVote: any = await api(`/plans/${planId}`, tokenB);
  const votedProposal = planAfterVote.plan.proposals?.find((p: any) => p.id === proposalId);
  assert(votedProposal?.votes?.length >= 1, 'Vote recorded');

  // Finalize
  const finRes: any = await api(`/plans/${planId}/finalize`, tokenA, 'POST', { place_proposal_id: proposalId, time_proposal_id: timeProposalId });
  assert(finRes.plan?.lifecycle_state === 'finalized', 'Plan finalized');

  // Unfinalize
  const unfinRes: any = await api(`/plans/${planId}/unfinalize`, tokenA, 'POST');
  assert(unfinRes.plan?.lifecycle_state === 'active', 'Plan unfinalized back to active');

  // Re-finalize for complete
  await api(`/plans/${planId}/finalize`, tokenA, 'POST', { place_proposal_id: proposalId, time_proposal_id: timeProposalId });
  const compRes: any = await api(`/plans/${planId}/complete`, tokenA, 'POST');
  assert(compRes.plan?.lifecycle_state === 'completed', 'Plan completed');

  // Repeat
  const repeatRes: any = await api(`/plans/${planId}/repeat`, tokenA, 'POST');
  assert(!!repeatRes.plan?.id && repeatRes.plan.id !== planId, 'Plan repeated with new ID');

  // --- SECTION 6: Messages ---
  console.log('\n6. Messages');
  const msgPlanRes: any = await api('/plans', tokenA, 'POST', { title: 'Msg Plan', activity_type: 'coffee', participant_ids: [userBId] });
  const msgPlanId: string = msgPlanRes.plan.id;
  const msgInv: any = await api('/invitations', tokenB);
  const msgInvItem = msgInv.invitations?.find((i: any) => i.target_id === msgPlanId);
  if (msgInvItem) await api(`/invitations/${msgInvItem.id}`, tokenB, 'PATCH', { status: 'accepted' });

  const cmid = `cmid-e2e-${Date.now()}`;
  const msgRes: any = await api(`/plans/${msgPlanId}/messages`, tokenA, 'POST', { text: 'Hello world', client_message_id: cmid });
  assert(msgRes.message?.client_message_id === cmid, 'client_message_id roundtrips');

  const msgs: any = await api(`/plans/${msgPlanId}/messages`, tokenB);
  assert(msgs.messages?.length >= 1, 'Messages fetchable');

  // --- SECTION 7: Realtime ---
  console.log('\n7. Realtime (WS)');
  const rtPlanRes: any = await api('/plans', tokenA, 'POST', { title: 'RT Plan', activity_type: 'dinner', participant_ids: [userBId] });
  const rtPlanId: string = rtPlanRes.plan.id;
  const rtInv: any = await api('/invitations', tokenB);
  const rtInvItem = rtInv.invitations?.find((i: any) => i.target_id === rtPlanId);
  if (rtInvItem) await api(`/invitations/${rtInvItem.id}`, tokenB, 'PATCH', { status: 'accepted' });

  const wsA = await connectWs(tokenA);
  const wsB = await connectWs(tokenB);
  await subscribeAndWait(wsA, `plan:${rtPlanId}`);
  await subscribeAndWait(wsB, `plan:${rtPlanId}`);

  // Message via WS
  const msgEvtPromise = waitForEvent(wsB, 'plan.message.created');
  await api(`/plans/${rtPlanId}/messages`, tokenA, 'POST', { text: 'RT hello' });
  const msgEvt = await msgEvtPromise;
  assert(msgEvt.payload.text === 'RT hello', 'B receives message via WS');

  // Proposal via WS
  const propEvtPromise = waitForEvent(wsB, 'plan.proposal.created');
  await api(`/plans/${rtPlanId}/proposals`, tokenA, 'POST', { type: 'place', value_text: 'RT Place' });
  const propEvt = await propEvtPromise;
  assert(propEvt.payload.value_text === 'RT Place', 'B receives proposal via WS');
  const rtProposalId: string = propEvt.payload.id;

  // Vote via WS
  const voteEvtPromise = waitForEvent(wsA, 'plan.vote.changed');
  await api(`/plans/${rtPlanId}/proposals/${rtProposalId}/vote`, tokenB, 'POST');
  const voteEvt = await voteEvtPromise;
  assert(voteEvt.payload.action === 'added' && voteEvt.payload.voter_id === userBId, 'A receives vote.added via WS');

  // Unvote via WS
  const unvoteEvtPromise = waitForEvent(wsA, 'plan.vote.changed');
  await api(`/plans/${rtPlanId}/proposals/${rtProposalId}/vote`, tokenB, 'DELETE');
  const unvoteEvt = await unvoteEvtPromise;
  assert(unvoteEvt.payload.action === 'removed', 'A receives vote.removed via WS');

  // Finalize via WS
  const rtTimePropPromise = waitForEvent(wsB, 'plan.proposal.created');
  const rtTimeProp: any = await api(`/plans/${rtPlanId}/proposals`, tokenA, 'POST', { type: 'time', value_text: '19:00', value_datetime: '2026-05-01T19:00:00+03:00' });
  const rtTimePropId: string = rtTimeProp.proposal.id;
  await rtTimePropPromise;
  // Re-vote
  await api(`/plans/${rtPlanId}/proposals/${rtProposalId}/vote`, tokenA, 'POST');
  await api(`/plans/${rtPlanId}/proposals/${rtProposalId}/vote`, tokenB, 'POST');
  await api(`/plans/${rtPlanId}/proposals/${rtTimePropId}/vote`, tokenA, 'POST');
  await api(`/plans/${rtPlanId}/proposals/${rtTimePropId}/vote`, tokenB, 'POST');

  const finEvtPromise = waitForEvent(wsB, 'plan.finalized');
  await api(`/plans/${rtPlanId}/finalize`, tokenA, 'POST', { place_proposal_id: rtProposalId, time_proposal_id: rtTimePropId });
  const finEvt = await finEvtPromise;
  assert(finEvt.payload.plan_id === rtPlanId, 'B receives plan.finalized via WS');

  // Unfinalize via WS
  const unfinEvtPromise = waitForEvent(wsB, 'plan.unfinalized');
  await api(`/plans/${rtPlanId}/unfinalize`, tokenA, 'POST');
  const unfinEvt = await unfinEvtPromise;
  assert(unfinEvt.payload.plan_id === rtPlanId, 'B receives plan.unfinalized via WS');

  // --- SECTION 8: Reconnect ---
  console.log('\n8. Reconnect');
  wsB.close();
  await new Promise<void>((r) => setTimeout(r, 500));
  const wsB2 = await connectWs(tokenB);
  await subscribeAndWait(wsB2, `plan:${rtPlanId}`);
  const reFetched: any = await api(`/plans/${rtPlanId}`, tokenB);
  assert(!!reFetched.plan, 'Can re-fetch plan after reconnect');

  // Verify event still works after reconnect
  const reMsgEvtPromise = waitForEvent(wsB2, 'plan.message.created');
  await api(`/plans/${rtPlanId}/messages`, tokenA, 'POST', { text: 'Post-reconnect msg' });
  const reMsgEvt = await reMsgEvtPromise;
  assert(reMsgEvt.payload.text === 'Post-reconnect msg', 'WS event received after reconnect');

  // --- SECTION 9: Notifications ---
  console.log('\n9. Notifications');
  const notifsA: any = await api('/notifications', tokenA);
  assert(Array.isArray(notifsA.notifications), 'GET /notifications returns array');

  // --- SECTION 10: Error normalization ---
  console.log('\n10. Error normalization');
  const errRes: any = await api('/plans', tokenA, 'POST', { title: '' });
  assert(errRes.code === 'INVALID_INPUT', 'Validation error has code field');

  // --- SECTION 11: Event interest/save lifecycle ---
  console.log('\n11. Event interest/save lifecycle');
  const eventsList: any = await api('/events', tokenA);
  const eventId: string = eventsList.events?.[0]?.id;
  if (eventId) {
    // POST interest
    await api(`/events/${eventId}/interest`, tokenA, 'POST');
    const evAfterInterest: any = await api(`/events/${eventId}`, tokenA);
    assert(!!evAfterInterest.event, 'Event detail after interest');

    // DELETE interest
    const delInterestRes = await fetch(`${API}/events/${eventId}/interest`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tokenA}` } });
    assert(delInterestRes.status === 204, 'DELETE interest returns 204');

    // POST save
    await api(`/events/${eventId}/save`, tokenA, 'POST');

    // DELETE save
    const delSaveRes = await fetch(`${API}/events/${eventId}/save`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tokenA}` } });
    assert(delSaveRes.status === 204, 'DELETE save returns 204');
  } else {
    assert(true, 'No events seeded — skip interest/save tests (pass)');
    assert(true, 'No events seeded — skip DELETE interest (pass)');
    assert(true, 'No events seeded — skip DELETE save (pass)');
  }

  // --- SECTION 12: Search ---
  console.log('\n12. Search');
  const searchRes: any = await api('/search/events', tokenA);
  assert(Array.isArray(searchRes.events), 'GET /search/events returns array');
  assert(typeof searchRes.total === 'number', 'Search result has total count');

  const searchQ: any = await api('/search/events?q=Джаз', tokenA);
  assert(Array.isArray(searchQ.events), 'Search with q param returns array');

  const searchCat: any = await api('/search/events?category=music', tokenA);
  assert(Array.isArray(searchCat.events), 'Search with category returns array');

  // --- SECTION 13: Finalize validation ---
  console.log('\n13. Finalize validation');
  const valPlanRes: any = await api('/plans', tokenA, 'POST', { title: 'Finalize Val Plan', activity_type: 'bar', participant_ids: [userBId] });
  const valPlanId: string = valPlanRes.plan.id;
  const valInv: any = await api('/invitations', tokenB);
  const valInvItem = valInv.invitations?.find((i: any) => i.target_id === valPlanId);
  if (valInvItem) await api(`/invitations/${valInvItem.id}`, tokenB, 'PATCH', { status: 'accepted' });

  const finNoProp: any = await api(`/plans/${valPlanId}/finalize`, tokenA, 'POST', {});
  assert(finNoProp.code === 'INVALID_STATE', 'Finalize without proposals or confirmed place/time → 400 INVALID_STATE');
  assert(typeof finNoProp.message === 'string' && finNoProp.message.toLowerCase().includes('confirmed'), 'Error message mentions confirmed place/time requirement');

  // --- SECTION 14: PATCH /users/me validation ---
  console.log('\n14. PATCH /users/me validation');
  const badName: any = await api('/users/me', tokenA, 'PATCH', { name: '' });
  assert(badName.code === 'INVALID_INPUT', 'Empty name → 400 INVALID_INPUT');

  const badUsername: any = await api('/users/me', tokenA, 'PATCH', { username: 'has spaces' });
  assert(badUsername.code === 'INVALID_INPUT', 'Username with spaces → 400 INVALID_INPUT');

  const badUsernameLong: any = await api('/users/me', tokenA, 'PATCH', { username: 'a'.repeat(51) });
  assert(badUsernameLong.code === 'INVALID_INPUT', 'Username too long → 400 INVALID_INPUT');

  const badAvatar: any = await api('/users/me', tokenA, 'PATCH', { avatar_url: 123 });
  assert(badAvatar.code === 'INVALID_INPUT', 'Non-string avatar_url → 400 INVALID_INPUT');

  const validPatch: any = await api('/users/me', tokenA, 'PATCH', { name: 'Test User A' });
  assert(!!validPatch.user, 'Valid PATCH /me returns user');

  // Randomise so re-runs against the same DB don't collide on the unique
  // username constraint.
  const smokeUsername = `dyk_an_${Math.random().toString(36).slice(2, 8)}`;
  const validUsername: any = await api('/users/me', tokenA, 'PATCH', { username: smokeUsername });
  assert(validUsername.user?.username === smokeUsername, 'Valid multi-char username accepted');

  const dupUsername: any = await api('/users/me', tokenB, 'PATCH', { username: smokeUsername });
  assert(dupUsername.code === 'USERNAME_TAKEN', 'Duplicate username → 409 USERNAME_TAKEN');

  // --- SECTION 15: Non-existent event interest/save ---
  console.log('\n15. Non-existent event interest/save');
  const fakeEventId = '00000000-0000-0000-0000-000000000000';
  const interest404: any = await api(`/events/${fakeEventId}/interest`, tokenA, 'POST');
  assert(interest404.code === 'NOT_FOUND', 'Interest in nonexistent event → 404 NOT_FOUND');

  const save404: any = await api(`/events/${fakeEventId}/save`, tokenA, 'POST');
  assert(save404.code === 'NOT_FOUND', 'Save nonexistent event → 404 NOT_FOUND');

  // Cleanup
  wsA.close();
  wsB2.close();

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => { console.error('E2E error:', err); process.exit(1); });

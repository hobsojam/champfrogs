<script>
  import { sessionState, wsError, fatalWsError, isSessionExpired, connect, send, disconnect } from './ws.js';
  import JoinForm from './lib/JoinForm.svelte';
  import ArrangeRow from './lib/ArrangeRow.svelte';
  import RevealView from './lib/RevealView.svelte';
  import Phase2Board from './lib/Phase2Board.svelte';

  // Bug 5: restore role + page from sessionStorage on refresh
  const ROLE_KEY = 'champfrogs_role';
  const _urlSession = new URLSearchParams(window.location.search).get('session')?.toUpperCase();
  const _savedRole = sessionStorage.getItem(ROLE_KEY);
  const _autoRestore = Boolean(_urlSession && _savedRole);

  let page = $state(_autoRestore ? 'session' : 'home'); // 'home' | 'session'
  let myRole = $state(_autoRestore ? _savedRole : null);
  let localOrder = $state(null); // draft order during arrange phase
  let cardWidth = $state(90);
  let cardHeight = $state(130);

  let session = $derived($sessionState);
  let error = $derived($wsError);
  let fatalError = $derived($fatalWsError);
  let sessionExpired = $derived($isSessionExpired);

  function computeCardDims() {
    const gap = 6;
    const hPad = 32;
    const vPad = 160; // header + controls approx
    const availW = window.innerWidth - hPad - gap * 9;
    const availH = window.innerHeight - vPad;
    const w = Math.max(60, Math.min(100, Math.floor(availW / 10)));
    const h = Math.min(Math.round(w * 1.45), Math.floor(availH * 0.88));
    cardWidth = w;
    cardHeight = h;
  }

  $effect(() => {
    computeCardDims();
  });

  // Bug 5: connect on mount when auto-restoring (no reactive deps → runs once)
  $effect(() => {
    if (_autoRestore) connect(_urlSession);
  });

  function handleJoin(sessionId, role) {
    myRole = role;
    page = 'session';
    sessionStorage.setItem(ROLE_KEY, role); // Bug 5: persist role
    connect(sessionId);
    // After connecting, send role assignment
    // We need to wait for connection — send after first state arrives
  }

  // Bugs 1 & 2: hasJoined as $state so it can be reactively reset
  let hasJoined = $state(false);

  // Reset hasJoined whenever we're not in the participant list (covers reset + reconnect)
  $effect(() => {
    if (session && myRole && !session.participants.some(p => p.role === myRole)) {
      hasJoined = false;
    }
  });

  // When we get our first state (or after a reset/reconnect), send the join message
  $effect(() => {
    if (session && !hasJoined && myRole) {
      hasJoined = true;
      send({ type: 'join', role: myRole });
    }
  });

  // Bug 3: guard against re-seeding after submit
  let arrangeSubmitted = $state(false);

  // Seed localOrder from server when we enter arrange phase
  $effect(() => {
    if (!session) return;
    if (session.phase !== 'subject_arrange' && session.phase !== 'interviewer_arrange') {
      arrangeSubmitted = false;
    }
    if (session.phase === 'subject_arrange' && myRole === 'subject' && session.subjectOrder && !localOrder && !arrangeSubmitted) {
      localOrder = [...session.subjectOrder];
    }
    if (session.phase === 'interviewer_arrange' && myRole === 'interviewer' && session.interviewerOrder && !localOrder && !arrangeSubmitted) {
      localOrder = [...session.interviewerOrder];
    }
  });

  function submitArrange() {
    if (!localOrder || arrangeSubmitted) return;
    arrangeSubmitted = true; // Bug 3: prevent re-seed and double-submit
    send({ type: 'finish_arrange', order: localOrder });
    localOrder = null;
  }

  function handleLeave() {
    disconnect();
    page = 'home';
    myRole = null;
    localOrder = null;
    hasJoined = false;
    sessionStorage.removeItem(ROLE_KEY); // Bug 5: clear persisted role
    history.replaceState(null, '', '/');
  }

  function handleReset() {
    send({ type: 'reset' });
    localOrder = null;
  }

  let phaseBadge = $derived.by(() => {
    if (!session) return '';
    const labels = {
      waiting: 'Phase 1 — Importance',
      subject_arrange: 'Phase 1 — Importance',
      interviewer_arrange: 'Phase 1 — Importance',
      reveal: 'Phase 1 — Reveal',
      phase2: 'Phase 2 — Realisation',
    };
    return labels[session.phase] || '';
  });

  let otherRole = $derived(myRole === 'subject' ? 'interviewer' : 'subject');

  let otherConnected = $derived.by(() => {
    if (!session) return false;
    return session.participants.some(p => p.role === otherRole);
  });

  let phaseAnnouncement = $derived.by(() => {
    if (!session || !myRole) return '';
    const solo = session.mode === 'solo';
    switch (session.phase) {
      case 'subject_arrange':
        if (myRole === 'subject') return 'Your turn: arrange your cards from least to most important.';
        return solo ? '' : 'Waiting — the subject is arranging their cards.';
      case 'interviewer_arrange':
        return myRole === 'interviewer'
          ? 'Your turn: arrange your cards from least to most important.'
          : 'Waiting — the interviewer is arranging their cards.';
      case 'reveal':
        return 'Both arrangements are now revealed. Discuss the differences.';
      case 'phase2':
        return solo
          ? 'Drag cards up to show realised motivators, down to show prevented ones.'
          : 'Phase 2: drag cards up to show realised motivators, down to show prevented ones.';
      default:
        return '';
    }
  });
</script>

<svelte:window onresize={computeCardDims} />

<div class="app">
  <header>
    <span class="title">Moving Motivators</span>
    {#if session}
      <span class="badge">{phaseBadge}</span>
      <span class="session-id">#{session.id}</span>
    {/if}
    {#if page === 'session'}
      <button class="leave-btn" onclick={handleLeave}>Leave</button>
    {/if}
  </header>

  <main>
    <div class="sr-only" aria-live="polite" aria-atomic="true">{phaseAnnouncement}</div>

    {#if page === 'home'}
      <JoinForm onJoin={handleJoin} />

    {:else if fatalError}
      <div class="screen">
        {#if sessionExpired}
          <h2>Session ended</h2>
          <p>This session expired after 24 hours of inactivity.</p>
        {:else}
          <p class="error">{fatalError}</p>
        {/if}
        <button class="btn-primary" onclick={handleLeave}>
          {sessionExpired ? 'Start new session' : 'Back to home'}
        </button>
      </div>

    {:else if !session}
      <div class="screen"><p class="muted">Connecting…</p></div>

    {:else if session.phase === 'waiting'}
      <div class="screen">
        {#if session.mode === 'solo'}
          <p class="muted">Starting…</p>
        {:else}
          <h2>Session {session.id}</h2>
          <p>Waiting for participants to join…</p>
          {#if !otherConnected}
            <p class="muted">Share the code <strong>{session.id}</strong> with the {otherRole}.</p>
          {/if}
        {/if}
      </div>

    {:else if session.phase === 'subject_arrange'}
      {#if myRole === 'subject'}
        <div class="arrange-view">
          <div class="arrange-header">
            <span class="axis-label"><span aria-hidden="true">←</span> Less Important &nbsp;·&nbsp; More Important <span aria-hidden="true">→</span></span>
            <button class="btn-primary" onclick={submitArrange} disabled={!localOrder || arrangeSubmitted}>Done <span aria-hidden="true">✓</span></button>
          </div>
          {#if localOrder}
            <ArrangeRow bind:order={localOrder} {cardWidth} {cardHeight} />
          {:else}
            <div class="screen"><p class="muted">Loading cards…</p></div>
          {/if}
        </div>
      {:else}
        <div class="screen">
          <h2>Subject is arranging…</h2>
          <p class="muted">Please wait while the subject ranks their motivators.</p>
        </div>
      {/if}

    {:else if session.phase === 'interviewer_arrange'}
      {#if myRole === 'interviewer'}
        <div class="arrange-view">
          <div class="arrange-header">
            <span class="axis-label"><span aria-hidden="true">←</span> Less Important &nbsp;·&nbsp; More Important <span aria-hidden="true">→</span></span>
            <button class="btn-primary" onclick={submitArrange} disabled={!localOrder || arrangeSubmitted}>Done <span aria-hidden="true">✓</span></button>
          </div>
          {#if localOrder}
            <ArrangeRow bind:order={localOrder} {cardWidth} {cardHeight} />
          {:else}
            <div class="screen"><p class="muted">Loading cards…</p></div>
          {/if}
        </div>
      {:else}
        <div class="screen">
          <h2>Interviewer is arranging…</h2>
          <p class="muted">Please wait while the interviewer ranks the motivators.</p>
        </div>
      {/if}

    {:else if session.phase === 'reveal'}
      <RevealView
        subjectOrder={session.subjectOrder}
        interviewerOrder={session.interviewerOrder}
        {cardWidth}
        cardHeight={Math.floor(cardHeight * 0.88)}
        onAdvance={() => send({ type: 'set_phase', phase: 'phase2' })}
      />

    {:else if session.phase === 'phase2'}
      <Phase2Board
        {session}
        onUpdateY={(who, cardId, y) => send({ type: 'update_y', who, cardId, y })}
        onToggleInterviewer={(show) => send({ type: 'toggle_interviewer', show })}
        onBack={session.mode === 'solo' ? null : () => send({ type: 'set_phase', phase: 'reveal' })}
        onReset={handleReset}
      />
    {/if}

    {#if error && !fatalError}
      <div class="toast">{error}</div>
    {/if}
  </main>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

  :global(:focus-visible) {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  :global(body) {
    background: #0f172a;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    height: 100dvh;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }

  .app {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
    min-height: 48px;
  }

  .title { font-size: 15px; font-weight: 700; }

  .badge {
    padding: 2px 10px;
    background: #2563eb;
    color: white;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
  }

  .session-id { font-size: 12px; color: #8b9db5; margin-left: auto; }

  .leave-btn {
    padding: 5px 12px;
    background: #1e293b;
    border: 1px solid #64748b;
    border-radius: 6px;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
  }

  .leave-btn:hover { background: #334155; color: #e2e8f0; }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    height: 100%;
    padding: 32px;
    text-align: center;
  }

  h2 { font-size: 24px; font-weight: 700; }
  p { color: #94a3b8; max-width: 380px; line-height: 1.6; font-size: 14px; }
  .muted { color: #8b9db5; }
  .error { color: #f87171; }

  .arrange-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .arrange-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .axis-label {
    font-size: 11px;
    font-weight: 600;
    color: #8b9db5;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .btn-primary {
    padding: 9px 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary:active:not(:disabled) { transform: scale(0.97); }

  .toast {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    border: 1px solid #334155;
    color: #f87171;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
    z-index: 200;
  }
</style>

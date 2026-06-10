<script>
  let { onJoin } = $props();

  const urlCode = new URLSearchParams(window.location.search).get('session');

  let mode = $state(urlCode ? 'join' : 'home');
  let codeInput = $state(urlCode ? urlCode.toUpperCase().slice(0, 4) : '');
  let createdCode = $state(urlCode ? urlCode.toUpperCase().slice(0, 4) : null);
  let role = $state('subject');
  let error = $state('');
  let loading = $state(false);
  let copied = $state(false);

  async function handleCreate() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create session');
      const { id } = await res.json();
      codeInput = id;
      createdCode = id;
      mode = 'join';
      history.replaceState(null, '', `?session=${id}`);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function handleJoin() {
    const code = codeInput.trim().toUpperCase();
    if (!code) { error = 'Enter a session code'; return; }
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/sessions/${code}`);
      if (!res.ok) throw new Error('Session not found — check the code');
      const info = await res.json();
      if (info.roles.includes(role)) {
        error = `The ${role} role is already taken in this session`;
        return;
      }
      history.replaceState(null, '', `?session=${code}`);
      onJoin(code, role);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // clipboard unavailable — silently ignore, user can copy the URL manually
    }
  }
</script>

<div class="screen">
  {#if mode === 'home'}
    <h2>Moving Motivators</h2>
    <p>A two-player CHAMPFROGS exercise for exploring motivation and role fit.</p>
    <div class="btn-row">
      <button class="btn-primary" onclick={() => { handleCreate(); }} disabled={loading}>
        {loading ? 'Creating…' : 'Create Session'}
      </button>
      <button class="btn-secondary" onclick={() => mode = 'join'}>Join Session</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}

  {:else if mode === 'join'}
    <h2>{createdCode ? 'Session created' : 'Join Session'}</h2>

    {#if createdCode}
      <div class="code-display">
        <span class="code-label">Session code</span>
        <span class="code">{codeInput}</span>
        <span class="code-hint">Share the code or the link below</span>
        <button class="btn-copy" onclick={copyLink}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    {:else}
      <div class="field">
        <label for="code">Session code</label>
        <input
          id="code"
          type="text"
          placeholder="e.g. ABCD"
          maxlength="4"
          bind:value={codeInput}
          oninput={() => { codeInput = codeInput.toUpperCase(); error = ''; }}
          onkeydown={(e) => e.key === 'Enter' && handleJoin()}
        />
      </div>
    {/if}

    <div class="field">
      <label>Your role</label>
      <div class="role-row">
        <button
          class="role-btn"
          class:active={role === 'subject'}
          aria-pressed={role === 'subject'}
          onclick={() => role = 'subject'}
        >
          <span class="role-icon" aria-hidden="true">🙋</span>
          <span class="role-name">Subject</span>
          <span class="role-desc">The person being assessed</span>
        </button>
        <button
          class="role-btn"
          class:active={role === 'interviewer'}
          aria-pressed={role === 'interviewer'}
          onclick={() => role = 'interviewer'}
        >
          <span class="role-icon" aria-hidden="true">🎙️</span>
          <span class="role-name">Interviewer</span>
          <span class="role-desc">The facilitator / coach</span>
        </button>
      </div>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="btn-row">
      <button class="btn-secondary" onclick={() => { mode = 'home'; codeInput = ''; createdCode = null; error = ''; }}>
        ← Back
      </button>
      <button class="btn-primary" onclick={handleJoin} disabled={loading || !codeInput.trim()}>
        {loading ? 'Joining…' : 'Join as ' + (role === 'subject' ? 'Subject' : 'Interviewer')}
      </button>
    </div>
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    height: 100%;
    padding: 32px;
  }

  h2 {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  p {
    color: #94a3b8;
    text-align: center;
    max-width: 380px;
    line-height: 1.6;
    font-size: 14px;
  }

  .btn-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-primary, .btn-secondary {
    padding: 10px 24px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.1s, transform 0.1s;
  }

  .btn-primary:active, .btn-secondary:active { transform: scale(0.97); }
  .btn-primary { background: #2563eb; color: white; }
  .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: #334155; color: #e2e8f0; }
  .btn-secondary:hover { background: #475569; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 400px;
  }

  label {
    font-size: 12px;
    font-weight: 600;
    color: #8b9db5;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  input {
    padding: 10px 14px;
    background: #1e293b;
    border: 1.5px solid #64748b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    outline: none;
    width: 100%;
  }

  input:focus { border-color: #3b82f6; }

  .role-row {
    display: flex;
    gap: 10px;
  }

  .role-btn {
    flex: 1;
    padding: 12px 8px;
    background: #1e293b;
    border: 1.5px solid #64748b;
    border-radius: 10px;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: border-color 0.15s, color 0.15s;
  }

  .role-btn.active {
    border-color: #3b82f6;
    color: #e2e8f0;
    background: #172033;
  }

  .role-icon { font-size: 22px; }
  .role-name { font-size: 13px; font-weight: 700; }
  .role-desc { font-size: 11px; color: #8b9db5; }

  .code-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 32px;
    background: #1e293b;
    border-radius: 12px;
    border: 1.5px solid #64748b;
  }

  .btn-copy {
    padding: 6px 16px;
    background: #1e293b;
    border: 1px solid #64748b;
    border-radius: 6px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .btn-copy:hover { background: #334155; color: #e2e8f0; }

  .code-label {
    font-size: 11px;
    font-weight: 600;
    color: #8b9db5;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .code {
    font-size: 40px;
    font-weight: 900;
    letter-spacing: 0.15em;
    color: #e2e8f0;
  }

  .code-hint {
    font-size: 12px;
    color: #8b9db5;
  }

  .error {
    color: #f87171;
    font-size: 13px;
    text-align: center;
  }
</style>

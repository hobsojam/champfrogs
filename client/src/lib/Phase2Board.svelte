<script>
  import { cardById } from './cards.js';

  let { session, onUpdateY, onToggleInterviewer, onBack, onReset } = $props();

  let boardEl = $state(null);

  const CARD_W = 84;
  const CARD_H = 122;

  function xPct(rank, total = 10) {
    return ((rank + 0.5) / total) * 100;
  }

  function startDrag(e, cardId, who) {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    let rafPending = false;

    function onMove(e) {
      if (!boardEl) return;
      const rect = boardEl.getBoundingClientRect();
      const y = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
      target.style.top = `${y}%`;

      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          onUpdateY(who, cardId, y);
          rafPending = false;
        });
      }
    }

    function onUp() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
</script>

<div class="container">
  <div class="axis-label top">▲ Realised</div>

  <div class="board" bind:this={boardEl}>
    <div class="midline"></div>

    {#each session.subject.order as cardId, rank (cardId)}
      {@const card = cardById(cardId)}
      {@const y = session.subject.yPositions[cardId]}
      {@const x = xPct(rank)}
      <div
        class="card-slot"
        style="left:{x}%;top:{y}%;background:{card.bg};border-color:{card.color}55;"
        onpointerdown={(e) => startDrag(e, cardId, 'subject')}
      >
        <span class="badge-dot" style="background:{card.color}">S</span>
        <div class="letter" style="color:{card.color}">{card.id}</div>
        <div class="name" style="color:{card.color}">{card.name}</div>
        <div class="desc">{card.desc}</div>
      </div>
    {/each}

    {#if session.showInterviewer}
      {#each session.interviewer.order as cardId, rank (cardId)}
        {@const card = cardById(cardId)}
        {@const y = session.interviewer.yPositions[cardId]}
        {@const x = xPct(rank)}
        <div
          class="card-slot interviewer"
          style="left:{x}%;top:{y}%;background:{card.bg};border-color:{card.color}88;"
          onpointerdown={(e) => startDrag(e, cardId, 'interviewer')}
        >
          <span class="badge-dot" style="background:{card.color}">I</span>
          <div class="letter" style="color:{card.color}">{card.id}</div>
          <div class="name" style="color:{card.color}">{card.name}</div>
          <div class="desc">{card.desc}</div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="axis-row">
    <span class="axis-x">← Less Important</span>
    <span class="axis-x">More Important →</span>
  </div>

  <div class="axis-label bottom">Prevented / Not Realised ▼</div>

  <div class="controls">
    <label class="toggle">
      <span class="switch">
        <input type="checkbox" checked={session.showInterviewer} onchange={(e) => onToggleInterviewer(e.target.checked)} />
        <span class="track"></span>
      </span>
      Show interviewer's cards
    </label>
    <div class="btn-group">
      <button class="btn-secondary" onclick={onBack}>← Back to Reveal</button>
      <button class="btn-secondary" onclick={onReset}>New Session</button>
    </div>
  </div>
</div>

<style>
  .container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .axis-label {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 0;
    flex-shrink: 0;
  }

  .board {
    flex: 1;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .midline {
    position: absolute;
    left: 0; right: 0; top: 50%;
    border-top: 1px dashed #1e3a5f;
    pointer-events: none;
  }

  .card-slot {
    position: absolute;
    width: 84px;
    height: 122px;
    border-radius: 10px;
    border: 1.5px solid;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
    transform: translate(-50%, -50%);
    cursor: grab;
    touch-action: none; /* prevents scroll interference on mobile */
    transition: box-shadow 0.1s;
    user-select: none;
  }

  .card-slot:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.5); }
  .card-slot:active { cursor: grabbing; }
  .card-slot.interviewer { opacity: 0.65; }

  .badge-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    font-size: 8px;
    font-weight: 800;
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter {
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }

  .name {
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
  }

  .desc {
    font-size: 8px;
    color: rgba(255,255,255,0.45);
    line-height: 1.3;
  }

  .axis-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 16px;
    font-size: 9px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }

  .controls {
    padding: 8px 16px;
    background: #1e293b;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #94a3b8;
    cursor: pointer;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }

  .switch input { opacity: 0; width: 0; height: 0; }

  .track {
    position: absolute;
    inset: 0;
    background: #334155;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .track::after {
    content: '';
    position: absolute;
    width: 14px; height: 14px;
    background: white;
    border-radius: 50%;
    top: 3px; left: 3px;
    transition: left 0.2s;
  }

  .switch input:checked + .track { background: #3b82f6; }
  .switch input:checked + .track::after { left: 19px; }

  .btn-group { display: flex; gap: 8px; }

  .btn-secondary {
    padding: 8px 16px;
    background: #334155;
    color: #e2e8f0;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary:hover { background: #475569; }
  .btn-secondary:active { transform: scale(0.97); }
</style>

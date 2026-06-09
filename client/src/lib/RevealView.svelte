<script>
  import { cardById } from './cards.js';
  import MotivatorCard from './MotivatorCard.svelte';

  let { subjectOrder, interviewerOrder, cardWidth = 88, cardHeight = 126, onAdvance } = $props();
</script>

<div class="reveal">
  <div class="section">
    <div class="label">Interviewer</div>
    <div class="row">
      {#each interviewerOrder as cardId (cardId)}
        <MotivatorCard card={cardById(cardId)} width={cardWidth} height={cardHeight} />
      {/each}
    </div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="label">Subject</div>
    <div class="row">
      {#each subjectOrder as cardId (cardId)}
        <MotivatorCard card={cardById(cardId)} width={cardWidth} height={cardHeight} />
      {/each}
    </div>
  </div>
</div>

<div class="controls">
  <span class="hint">Discuss the differences, then move to Phase 2</span>
  <button class="btn-primary" onclick={onAdvance}>Phase 2 — Realisation →</button>
</div>

<style>
  .reveal {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  .label {
    font-size: 11px;
    font-weight: 700;
    color: #8b9db5;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .divider {
    height: 1px;
    background: #1e293b;
  }

  .controls {
    padding: 10px 16px;
    background: #1e293b;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .hint {
    font-size: 12px;
    color: #8b9db5;
  }

  .btn-primary {
    padding: 10px 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover { background: #1d4ed8; }
  .btn-primary:active { transform: scale(0.97); }
</style>

<script>
  import { CARDS, cardById } from './cards.js';
  import MotivatorCard from './MotivatorCard.svelte';

  let { order = $bindable(), cardWidth = 90, cardHeight = 130 } = $props();

  let rowEl = $state(null);
  let draggingId = $state(null);
  let insertionIndex = $state(null);
  let ghostEl = null;
  let keyboardDragging = $state(false);
  let announcement = $state('');

  function announce(msg) {
    announcement = '';
    setTimeout(() => { announcement = msg; }, 10);
  }

  let displayOrder = $derived.by(() => {
    if (draggingId === null || insertionIndex === null) return order;
    const without = order.filter(id => id !== draggingId);
    const idx = Math.min(insertionIndex, without.length);
    return [...without.slice(0, idx), draggingId, ...without.slice(idx)];
  });

  function computeInsertionIndex(clientX) {
    if (!rowEl) return order.length - 1;
    const nonDragging = [...rowEl.querySelectorAll('[data-cid]')]
      .filter(el => el.dataset.cid !== draggingId);
    for (let i = 0; i < nonDragging.length; i++) {
      const rect = nonDragging[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return nonDragging.length;
  }

  function moveGhost(x, y) {
    if (!ghostEl) return;
    ghostEl.style.left = `${x - cardWidth / 2}px`;
    ghostEl.style.top = `${y - cardHeight / 2}px`;
  }

  function onPointerDown(e, cardId) {
    e.preventDefault();
    if (keyboardDragging) return; // don't start pointer drag while keyboard drag is active
    const card = cardById(cardId);

    ghostEl = document.createElement('div');
    ghostEl.setAttribute('aria-hidden', 'true');
    ghostEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 1000;
      width: ${cardWidth}px; height: ${cardHeight}px;
      border-radius: 10px; padding: 8px 6px;
      background: ${card.bg}; border: 1.5px solid ${card.color}55;
      display: flex; flex-direction: column; align-items: center;
      gap: 5px; text-align: center;
      transform: rotate(3deg) scale(1.06);
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    `;
    ghostEl.innerHTML = `
      <div style="font-size:30px;font-weight:900;color:${card.color};line-height:1">${card.id}</div>
      <div style="font-size:10px;font-weight:700;color:${card.color}">${card.name}</div>
      <div style="font-size:8.5px;color:rgba(255,255,255,0.75);line-height:1.3">${card.desc}</div>
    `;
    document.body.appendChild(ghostEl);
    moveGhost(e.clientX, e.clientY);

    draggingId = cardId;
    insertionIndex = order.indexOf(cardId);

    const onMove = (e) => {
      moveGhost(e.clientX, e.clientY);
      const newIdx = computeInsertionIndex(e.clientX);
      if (newIdx !== insertionIndex) insertionIndex = newIdx;
    };

    const onUp = () => {
      ghostEl?.remove();
      ghostEl = null;
      order = displayOrder;
      draggingId = null;
      insertionIndex = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function onKeyDown(e, cardId) {
    const card = cardById(cardId);

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!keyboardDragging) {
        draggingId = cardId;
        insertionIndex = order.indexOf(cardId);
        keyboardDragging = true;
        announce(`Grabbed ${card.name}, position ${order.indexOf(cardId) + 1} of ${order.length}. Use Left and Right arrow keys to move, Space or Enter to place, Escape to cancel.`);
      } else if (draggingId === cardId) {
        const pos = displayOrder.indexOf(cardId) + 1;
        order = displayOrder;
        draggingId = null;
        insertionIndex = null;
        keyboardDragging = false;
        announce(`Placed ${card.name} at position ${pos} of ${order.length}.`);
      }
    } else if (e.key === 'Escape' && keyboardDragging && draggingId === cardId) {
      e.preventDefault();
      draggingId = null;
      insertionIndex = null;
      keyboardDragging = false;
      announce(`Cancelled. ${card.name} returned to its original position.`);
    } else if (keyboardDragging && draggingId === cardId) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIdx = Math.max(0, insertionIndex - 1);
        if (newIdx !== insertionIndex) {
          insertionIndex = newIdx;
          announce(`${card.name}, position ${displayOrder.indexOf(cardId) + 1} of ${order.length}.`);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIdx = Math.min(order.length - 1, insertionIndex + 1);
        if (newIdx !== insertionIndex) {
          insertionIndex = newIdx;
          announce(`${card.name}, position ${displayOrder.indexOf(cardId) + 1} of ${order.length}.`);
        }
      }
    }
  }
</script>

<p id="arrange-kb-hint" class="sr-only">
  To reorder with a keyboard: focus a card, press Space or Enter to grab it, use Left and Right arrow keys to move it, then press Space or Enter to place it. Press Escape to cancel.
</p>

<div
  class="row"
  bind:this={rowEl}
  role="group"
  aria-label="Card order — least to most important"
  aria-describedby="arrange-kb-hint"
>
  {#each displayOrder as cardId, i (cardId)}
    {@const card = cardById(cardId)}
    <div
      data-cid={cardId}
      class="card-wrapper"
      class:keyboard-grabbed={keyboardDragging && draggingId === cardId}
      role="button"
      tabindex="0"
      aria-pressed={keyboardDragging && draggingId === cardId}
      aria-label="{card.name}, position {i + 1} of {order.length}"
      onpointerdown={(e) => onPointerDown(e, cardId)}
      onkeydown={(e) => onKeyDown(e, cardId)}
      style="cursor: grab; touch-action: none;"
    >
      <MotivatorCard
        {card}
        width={cardWidth}
        height={cardHeight}
        dragging={draggingId === cardId && !keyboardDragging}
      />
    </div>
  {/each}
</div>

<div class="sr-only" aria-live="assertive" aria-atomic="true">{announcement}</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-height: 0;
  }

  .card-wrapper:hover :global(.card):not(.dragging) {
    transform: translateY(-3px);
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  }

  .keyboard-grabbed :global(.card) {
    outline: 3px solid #60a5fa;
    outline-offset: 3px;
    transform: translateY(-4px);
    box-shadow: 0 8px 28px rgba(96,165,250,0.4);
  }

</style>

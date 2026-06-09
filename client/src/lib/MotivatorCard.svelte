<script>
  let { card, width = 90, height = 130, badge = null, dimmed = false, dragging = false } = $props();
</script>

<div
  class="card"
  class:dimmed
  class:dragging
  style="
    width: {width}px;
    min-width: {width}px;
    height: {height}px;
    background: {card.bg};
    border-color: {card.color}55;
  "
>
  {#if badge}
    <span class="badge" style="background:{card.color}33;color:{card.color}">{badge}</span>
  {/if}
  <div class="letter" style="color:{card.color}">{card.id}</div>
  <div class="name" style="color:{card.color}">{card.name}</div>
  <div class="desc">{card.desc}</div>
</div>

<style>
  .card {
    border-radius: 10px;
    border: 1.5px solid;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    text-align: center;
    position: relative;
    transition: box-shadow 0.15s, transform 0.1s;
    flex-shrink: 0;
  }

  .card.dimmed { opacity: 0.55; }
  .card.dragging { opacity: 0; pointer-events: none; }

  .badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter {
    font-size: 30px;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }

  .name {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1.2;
  }

  .desc {
    font-size: 8.5px;
    color: rgba(255,255,255,0.75);
    line-height: 1.3;
  }
</style>

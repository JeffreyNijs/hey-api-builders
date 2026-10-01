<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  replayScenarioDemo,
  runScenarioDemo,
  type DemoResult,
} from '../../.generated/scenario-demo.ts';

const seed = ref(12345);
const budget = ref(40);
const result = ref<DemoResult>();
const revealed = ref(false);
const replayed = ref(false);
const message = ref('Choose a seed, then find a failing order. All work stays in this browser.');
const valid = computed(
  () =>
    Number.isInteger(seed.value) &&
    seed.value >= -0x80000000 &&
    seed.value <= 0x7fffffff &&
    Number.isInteger(budget.value) &&
    budget.value >= 1 &&
    budget.value <= 200
);
const orders = computed(() => [
  ...(result.value?.first ? [{ title: 'First failure', value: result.value.first }] : []),
  ...(revealed.value && result.value?.shrunk
    ? [{ title: 'Shrunk failure', value: result.value.shrunk }]
    : []),
]);
watch([seed, budget], () => {
  result.value = undefined;
  revealed.value = false;
  replayed.value = false;
  message.value = 'Settings changed. Find a new counterexample to use these settings.';
});
function findFailure() {
  if (!valid.value) return;
  revealed.value = false;
  replayed.value = false;
  try {
    result.value = runScenarioDemo(seed.value, budget.value);
    message.value = result.value.failed
      ? `Found a failure after ${result.value.runs} checks. Reveal the shrink result next.`
      : 'No failure found within 50 checks. This does not prove the rule is correct.';
  } catch {
    result.value = undefined;
    message.value = 'The bounded demo could not finish. Check the settings and try again.';
  }
}
function reveal() {
  revealed.value = true;
  message.value = `Performed ${result.value?.shrinks ?? 0} successful shrink steps. Related values were recomputed at each step.`;
}
function replay() {
  if (!result.value?.replay) return;
  try {
    const value = replayScenarioDemo(result.value.replay);
    replayed.value = JSON.stringify(value) === JSON.stringify(result.value.shrunk);
    message.value = replayed.value
      ? 'Replay reproduced the same shrunk order, prices and relationships.'
      : 'Replay differed from the displayed result.';
  } catch {
    message.value = 'Replay was rejected because its recipe or engine is incompatible.';
  }
}
</script>

<template>
  <section class="scenario-demo" aria-label="Interactive scenario and replay demo">
    <form class="demo-controls" @submit.prevent="findFailure">
      <label>
        Seed
        <input
          v-model.number="seed"
          type="number"
          min="-2147483648"
          max="2147483647"
          step="1"
          required
        />
      </label>
      <label>
        Budget (cents)
        <input v-model.number="budget" type="number" min="1" max="200" step="1" required />
      </label>
      <button type="submit" :disabled="!valid">Find a counterexample</button>
    </form>
    <p class="demo-rule">Rule under test: every order costs at most {{ budget }} cents.</p>
    <p class="demo-status" role="status" aria-live="polite">{{ message }}</p>
    <div class="demo-actions">
      <button :disabled="!result?.failed || revealed" @click="reveal">Show shrink result</button>
      <button :disabled="!revealed || !result?.replay" @click="replay">
        Replay shrunk failure
      </button>
    </div>
    <div class="demo-orders">
      <article
        v-for="order in orders"
        :key="order.title"
        class="demo-order"
        :aria-label="order.title"
      >
        <h3>{{ order.title }}</h3>
        <p class="demo-total">{{ order.value.order.totalCents }} <span>cents</span></p>
        <p>Customer {{ order.value.customer.id }} · Order {{ order.value.order.id }}</p>
        <ul aria-label="Order lines">
          <li v-for="line in order.value.lines" :key="line.id">
            <span>{{ line.id }} → {{ line.orderId }}</span>
            <strong>{{ line.priceCents }}¢</strong>
          </li>
        </ul>
        <p class="demo-relationships">
          Customer link preserved. Every line belongs to this order. Total equals the sum of its
          lines.
        </p>
      </article>
    </div>
    <p v-if="replayed" class="demo-replayed">Reproduced from the saved seed and shrink path.</p>
    <details v-if="result?.replay && revealed">
      <summary>Inspect the replay record</summary>
      <p>The record identifies this fixed recipe and budget. It cannot execute uploaded code.</p>
      <textarea
        aria-label="Replay record"
        readonly
        :value="JSON.stringify(result.replay, null, 2)"
        rows="12"
        spellcheck="false"
      />
    </details>
  </section>
</template>

<style scoped>
.scenario-demo {
  border: 1px solid var(--rule);
  border-radius: 20px;
  padding: 24px;
  margin: 28px 0;
  background: var(--vp-c-bg-alt);
}
.demo-controls,
.demo-actions {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 12px;
}
label {
  display: grid;
  gap: 6px;
  flex: 1 1 130px;
  font-weight: 600;
}
input,
textarea {
  border: 1px solid var(--muted);
  border-radius: 7px;
  background: var(--paper);
  color: var(--ink);
  padding: 10px;
  width: 100%;
  min-width: 0;
}
button {
  border: 1px solid var(--ink);
  border-radius: 8px;
  background: var(--ink);
  color: var(--paper);
  padding: 10px 14px;
  font-weight: 650;
  min-height: 44px;
}
button:disabled {
  cursor: not-allowed;
  background: var(--vp-c-bg-soft);
  color: var(--muted);
  border-color: var(--rule);
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}
.demo-rule {
  font-weight: 650;
}
.demo-status {
  min-height: 3.5em;
}
.demo-orders {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px;
  margin-top: 24px;
}
.demo-order {
  padding: 18px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--paper);
  min-width: 0;
}
.demo-order h3 {
  margin: 0;
}
.demo-order p {
  overflow-wrap: anywhere;
}
.demo-total {
  font-size: 40px;
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.3;
}
.demo-total span {
  font-size: 16px;
  letter-spacing: normal;
  font-weight: 500;
}
.demo-order ul {
  list-style: none;
  padding: 0;
}
.demo-order li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--rule);
}
.demo-relationships {
  font-size: 14px;
}
.demo-replayed {
  font-weight: 650;
  color: var(--vp-c-brand-1);
}
summary {
  cursor: pointer;
  padding: 12px 0;
}
textarea {
  font: 12px/1.6 monospace;
  resize: vertical;
}
@media (max-width: 500px) {
  .scenario-demo {
    padding: 16px;
  }
  .demo-actions button,
  .demo-controls button {
    width: 100%;
  }
}
</style>

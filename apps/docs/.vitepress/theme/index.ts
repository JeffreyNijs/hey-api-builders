import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { defineAsyncComponent } from 'vue';
import MimletHome from './MimletHome.vue';
import Layout from './Layout.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('MimletHome', MimletHome);
    app.component(
      'ScenarioDemo',
      defineAsyncComponent(() => import('./ScenarioDemo.vue'))
    );
  },
} satisfies Theme;

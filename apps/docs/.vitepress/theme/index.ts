import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import MimletHome from './MimletHome.vue';
import Layout from './Layout.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('MimletHome', MimletHome);
  },
} satisfies Theme;

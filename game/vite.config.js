// TapTap H5 走相对路径静态包：base './'；modulePreload false 免得给 <link rel=modulepreload>
// 挂 crossorigin，小游戏容器里的资源请求不带这个属性。
export default {
  base: './',
  build: { modulePreload: false, target: 'es2020', assetsInlineLimit: 0 },
};

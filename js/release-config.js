/* Development defaults. Production values are emitted by scripts/build.py. */
(() => {
  const source = document.currentScript.src;
  window.AuroraReleaseConfig = Object.freeze({
    version: 'v1.0.0',
    imageBase: new URL('../assets/', source).href,
    shopURL: 'https://lab.aurora-racing.com/#shop'
  });
  window.AuroraAssetURL = path => new URL(String(path).replace(/^assets\//, ''), window.AuroraReleaseConfig.imageBase).href;
})();

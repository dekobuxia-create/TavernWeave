// 怪谈笔记 · MVU 加载器 v1.0.0（全球 CDN，失败后切国内镜像）
try {
  await import('https://cdn.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js');
} catch (error) {
  console.warn('[怪谈笔记] MVU 全球 CDN 加载失败，切换国内镜像：', error);
  try {
    await import('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js');
  } catch (fallbackError) {
    console.error('[怪谈笔记] MVU 双源加载均失败：', fallbackError);
  }
}

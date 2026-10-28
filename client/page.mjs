/**
 * 插件详情页（DSH 插件管理里的本插件页）的「My DSH 设置」：直接复用设置视图，不重复说明文案。
 */
function ZrBundleConfig(props) {
  return h('div', { className: 'zr-page' },
    h(ZrSettingsView, {
      minimal: true,
      onReload: function () {},
      onBack: null,
    })
  )
}

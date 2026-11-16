/**
 * 界面文案工具。
 *
 * 本插件是中文项目：界面文案只用中文，不做语言切换、不维护英文表。
 * zrT 仅负责把 {name} 占位符替换成实际值，方便拼动态文案时保持句子完整。
 */
function zrT(text, vars) {
  var value = String(text)
  if (vars !== undefined && vars !== null) {
    for (var key in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) value = value.split('{' + key + '}').join(String(vars[key]))
    }
  }
  return value
}

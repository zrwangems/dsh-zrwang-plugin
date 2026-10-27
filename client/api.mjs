/**
 * 浏览器半侧与宿主通信 + 通用数据钩子。
 * 只请求本插件前缀，失败抛给界面显示，不吞错。
 */
var ZR_PREFIX = '/dsh-zrwang-plugin'

function zrRequest(path, options) {
  var init = { headers: { 'content-type': 'application/json' } }
  if (options !== undefined && options !== null) {
    init.method = 'POST'
    init.body = JSON.stringify(options)
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(15000)
  }
  return fetch(ZR_PREFIX + path, init).then(function (response) {
    return response.json().then(function (payload) {
      if (!response.ok || payload.ok === false) {
        throw new Error((payload && payload.error) || ('HTTP ' + response.status))
      }
      return payload
    })
  })
}

/** 载入一个请求并返回 [state, setState, reload]；state 里带 loading/error/value。 */
function zrUseAsync(loader, deps) {
  var pair = React.useState({ loading: true, error: null, value: null })
  var state = pair[0]
  var setState = pair[1]
  var seq = React.useRef(0)
  var run = React.useCallback(function () {
    var mine = ++seq.current
    setState(function (previous) {
      return { loading: true, error: null, value: previous.value }
    })
    loader().then(function (value) {
      if (mine === seq.current) setState({ loading: false, error: null, value: value })
    }, function (error) {
      if (mine === seq.current) setState({ loading: false, error: String(error.message || error), value: null })
    })
  }, deps || [])
  React.useEffect(function () { run() }, [run])
  return [state, setState, run]
}

function zrErrorText(error) {
  return String((error && error.message) || error || '未知错误')
}

/** 兼容 ctx.effect 缺失的极端情况：直接执行，返回清理函数。 */
function zrEffect(ctx, factory, label) {
  if (typeof ctx.effect === 'function') return ctx.effect(factory, label)
  var cleanup = factory()
  return typeof cleanup === 'function' ? cleanup : function () {}
}

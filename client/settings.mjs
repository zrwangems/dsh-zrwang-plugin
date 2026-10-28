/**
 * My DSH 设置：供应商选择 + 中文表单 + 密钥不回显 + 配置目录入口。
 *
 * 数据来自宿主 GET /settings；保存 POST /settings。卡片类型：
 *   provider  先选供应商，只显示并保存当前供应商的 URL/模型/Key
 *   fields    普通表单（Nature 系列）
 *   info      只显示路径/状态并提供打开目录按钮
 */
function zrOpenExternal(url) {
  if (typeof url !== 'string' || url.length === 0) return
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // 打不开就忽略
  }
}

function ZrConfigField(props) {
  var field = props.field
  var value = props.value === undefined ? '' : props.value
  var onChange = props.onChange
  var head = [
    h('span', { className: 'zr-field-label' }, field.label || field.id),
    field.required ? h('span', { className: 'zr-required' }, ' *') : null,
    field.getKeyUrl ? h('button', {
      className: 'zr-link',
      type: 'button',
      onClick: function () { zrOpenExternal(field.getKeyUrl) },
    }, '获取 Key') : null,
  ]
  var control
  if (field.control === 'select') {
    control = h('select', {
      className: 'zr-input',
      value: value,
      onChange: function (event) { onChange(event.target.value) },
    }, (field.options || []).map(function (option) {
      return h('option', { key: option.value, value: option.value }, option.label)
    }))
  } else {
    control = h('input', {
      className: 'zr-input',
      type: field.secret === true ? 'password' : 'text',
      autoComplete: 'off',
      placeholder: field.placeholder || '',
      value: value,
      onChange: function (event) { onChange(event.target.value) },
    })
  }
  return h('div', { className: 'zr-field', key: field.id },
    h('label', { className: 'zr-field-head' }, head),
    field.help ? h('div', { className: 'zr-help' }, field.help) : null,
    control
  )
}

function ZrConfigCard(props) {
  var card = props.card
  var values = props.values || {}
  var backend = props.backend
  var onBackend = props.onBackend
  var onField = props.onField
  var onSave = props.onSave
  var onOpen = props.onOpen
  var onAction = props.onAction
  var saved = props.saved
  var fields = []
  if (card.kind === 'provider') fields = (card.providerFields || {})[backend] || []
  else if (card.kind === 'fields') fields = card.fields || []
  return h('div', { className: 'zr-card', key: card.id },
    h('div', { className: 'zr-card-head' },
      h('h4', null, card.title),
      card.kind === 'provider'
        ? h('select', {
          className: 'zr-input zr-provider-select',
          value: backend,
          onChange: function (event) { onBackend(card.id, event.target.value) },
        }, card.backendOptions.map(function (option) {
          return h('option', { key: option.id, value: option.id }, option.label)
        }))
        : null
    ),
    card.kind === 'info'
      ? h('div', null,
        h('div', { className: 'zr-desc' }, card.status || ''),
        h('div', { className: 'zr-actions' }, (card.actions || []).map(function (action) {
          if (typeof action.href === 'string' && action.href.length > 0) {
            return h('a', {
              className: 'zr-btn',
              key: action.id,
              href: action.href,
              target: '_blank',
              rel: 'noopener',
            }, action.label)
          }
          return h('button', {
            className: 'zr-btn',
            key: action.id,
            onClick: function () { onAction(card.id, action.id) },
          }, action.label)
        }))
      )
      : null,
    fields.length > 0
      ? h('div', { className: 'zr-field-grid' }, (function () {
        var rows = []
        for (var i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2))
        return rows.map(function (pair, rowIndex) {
          return h('div', { className: 'zr-field-row', key: 'row-' + rowIndex }, pair.map(function (field) {
            return h(ZrConfigField, {
              key: field.id,
              field: field,
              value: values[field.id],
              onChange: function (next) { onField(card.id, field.id, next) },
            })
          }))
        })
      })())
      : null,
    card.kind === 'info' ? null : h('div', { className: 'zr-actions' },
      h('button', { className: 'zr-btn zr-primary', onClick: function () { onSave(card.id) } }, '保存'),
      saved === card.id ? h('span', { className: 'zr-saved' }, '已保存') : null
    )
  )
}

function zrBuildValues(cards) {
  var values = {}
  for (var i = 0; i < cards.length; i += 1) {
    var card = cards[i]
    if (card.kind === 'provider') {
      var providers = {}
      for (var id in card.providerFields || {}) {
        providers[id] = {}
        var fields = card.providerFields[id]
        for (var j = 0; j < fields.length; j += 1) providers[id][fields[j].id] = fields[j].value || ''
      }
      values[card.id] = { backend: card.backend || '', providers: providers }
    } else if (card.kind === 'fields') {
      values[card.id] = {}
      for (var k = 0; k < (card.fields || []).length; k += 1) {
        var field = card.fields[k]
        values[card.id][field.id] = field.value || ''
      }
    }
  }
  return values
}

function ZrSettingsView(props) {
  var minimal = props.minimal === true
  var pair = zrUseAsync(function () { return zrRequest('/settings') }, [])
  var state = pair[0]
  var setState = pair[1]
  var reload = pair[2]
  var valuesPair = React.useState({})
  var values = valuesPair[0]
  var setValues = valuesPair[1]
  var savedPair = React.useState(null)
  var saved = savedPair[0]
  var setSaved = savedPair[1]
  var errorPair = React.useState(null)
  var error = errorPair[0]
  var setError = errorPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var pagePair = React.useState('models')
  var activePage = pagePair[0]
  var setActivePage = pagePair[1]

  var applyPayload = function (payload) {
    setState({ loading: false, error: null, value: payload })
    setValues(zrBuildValues(payload.cards || []))
  }

  React.useEffect(function () {
    if (state.value === null) return
    setValues(zrBuildValues(state.value.cards || []))
  }, [state.value])

  if (state.loading && state.value === null) return h('div', { className: 'zr-note' }, '正在读取设置…')
  if (state.error !== null) {
    return h('div', null,
      h('div', { className: 'zr-err' }, '读取设置失败：' + state.error),
      h('div', { className: 'zr-actions' }, h('button', { className: 'zr-btn', onClick: reload }, '重试'))
    )
  }
  var data = state.value

  var setField = function (cardId, fieldId, next) {
    setValues(function (previous) {
      var copy = {}
      for (var id in previous) copy[id] = previous[id]
      if (copy[cardId] !== undefined && copy[cardId].providers !== undefined) {
        var backend = copy[cardId].backend
        copy[cardId] = { backend: backend, providers: {} }
        for (var providerId in previous[cardId].providers) {
          copy[cardId].providers[providerId] = {}
          for (var key in previous[cardId].providers[providerId]) copy[cardId].providers[providerId][key] = previous[cardId].providers[providerId][key]
        }
        copy[cardId].providers[backend][fieldId] = next
      } else {
        copy[cardId] = {}
        for (var item in previous[cardId]) copy[cardId][item] = previous[cardId][item]
        copy[cardId][fieldId] = next
      }
      return copy
    })
    setSaved(null)
  }

  var setBackend = function (cardId, backend) {
    setValues(function (previous) {
      var copy = {}
      for (var id in previous) copy[id] = previous[id]
      copy[cardId] = { backend: backend, providers: previous[cardId].providers }
      return copy
    })
    setSaved(null)
  }

  var saveCard = function (cardId) {
    var card = (data.cards || []).find(function (item) { return item.id === cardId })
    if (card === undefined) return
    var body = { action: 'save', cardId: cardId }
    if (card.kind === 'provider') {
      body.backend = values[cardId].backend
      body.values = values[cardId].providers[values[cardId].backend]
    } else {
      body.values = values[cardId]
    }
    setBusy(true)
    setError(null)
    zrRequest('/settings', body).then(function (payload) {
      applyPayload(payload.settings)
      setSaved(cardId)
    }, function (reason) {
      setError(zrErrorText(reason))
    }).then(function () { setBusy(false) })
  }

  var openDir = function (target) {
    setError(null)
    zrRequest('/settings', { action: 'open-dir', target: target }).catch(function (reason) {
      setError(zrErrorText(reason))
    })
  }

  var runAction = function (cardId, actionId) {
    setError(null)
    zrRequest('/settings', { action: actionId, cardId: cardId }).catch(function (reason) {
      setError(zrErrorText(reason))
    })
  }

  var pages = [
    { id: 'models', label: '模型服务' },
    { id: 'nature', label: 'Nature-skill设置' },
  ]
  var visibleCards = (data.cards || []).filter(function (card) {
    return (card.page || 'models') === activePage
  })

  return h(React.Fragment, null,
    error !== null ? h('div', { className: 'zr-err' }, error) : null,
    h('div', { className: 'zr-tabs' }, pages.map(function (page) {
      return h('button', {
        key: page.id,
        className: 'zr-tab' + (activePage === page.id ? ' zr-tab-active' : ''),
        type: 'button',
        onClick: function () { setActivePage(page.id) },
      }, page.label)
    })),
    h('div', { className: 'zr-list' },
      visibleCards.map(function (card) {
        var cardValues = values[card.id]
        var providerValues = (card.kind === 'provider' && cardValues !== undefined)
          ? (cardValues.providers[cardValues.backend] || {})
          : cardValues
        return h(ZrConfigCard, {
          key: card.id,
          card: card,
          values: providerValues,
          backend: card.kind === 'provider' && cardValues !== undefined ? cardValues.backend : card.backend,
          saved: saved,
          onBackend: setBackend,
          onField: setField,
          onSave: saveCard,
          onOpen: openDir,
          onAction: runAction,
        })
      }),
      busy ? h('div', { className: 'zr-note' }, '正在保存…') : null
    )
  )
}

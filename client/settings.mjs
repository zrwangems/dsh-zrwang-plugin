/**
 * My DSH 设置：模型服务 / 科研服务 / 运行环境。
 *
 * 数据来自宿主 GET /settings；保存 POST /settings。
 * 每个配置块自己有「保存」按钮：输入/选择只改本地值，点保存才写配置；
 * 检查类按钮只做检测/校验，不写配置。
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
    h('span', { className: 'zr-field-label' }, zrT(field.label || field.id)),
    field.required ? h('span', { className: 'zr-required' }, ' *') : null,
    field.getKeyUrl ? h('button', {
      className: 'zr-link',
      type: 'button',
      onClick: function () { zrOpenExternal(field.getKeyUrl) },
    }, zrT(field.linkLabel || '获取 Key')) : null,
  ]
  if (field.control === 'inline-select') {
    return h('div', { className: 'zr-status-row zr-status-select', key: field.id },
      h('span', { className: 'zr-status-label' }, zrT(field.label || field.id)),
      h('select', {
        className: 'zr-input zr-inline-select',
        value: value,
        title: value,
        onChange: function (event) { onChange(event.target.value) },
      }, (field.options || []).map(function (option) {
        return h('option', { key: option.value, value: option.value }, zrT(option.label))
      })),
    )
  }
  if (field.control === 'status') {
    var level = field.level === undefined ? '' : field.level
    return h('div', { className: 'zr-status-row zr-status-' + level, key: field.id },
      h('span', { className: 'zr-status-label' }, zrT(field.label || field.id)),
      h('span', { className: 'zr-status-value', title: zrT(field.help || field.value || '') }, field.value === undefined ? '' : zrT(field.value)),
    )
  }
  var control
  if (field.control === 'select') {
    control = h('select', {
      className: 'zr-input',
      value: value,
      onChange: function (event) { onChange(event.target.value) },
    }, (field.options || []).map(function (option) {
      return h('option', { key: option.value, value: option.value }, zrT(option.label))
    }))
  } else if (field.control === 'textarea') {
    control = h('textarea', {
      className: 'zr-input zr-textarea',
      rows: field.rows || 3,
      placeholder: zrT(field.placeholder || ''),
      value: value,
      onChange: function (event) { onChange(event.target.value) },
    })
  } else {
    control = h('input', {
      className: 'zr-input',
      type: field.secret === true ? 'password' : 'text',
      autoComplete: 'off',
      placeholder: zrT(field.placeholder || ''),
      value: value,
      onChange: function (event) { onChange(event.target.value) },
      onChange: function (event) { onChange(event.target.value) },
    })
  }
  return h('div', { className: 'zr-field', key: field.id },
    h('label', { className: 'zr-field-head' }, head),
    field.help ? h('div', { className: 'zr-help' }, zrT(field.help)) : null,
    control
  )
}

function zrCheckLine(check) {
  if (check === undefined || check === null) return null
  var detail = typeof check.detail === 'string' && check.detail.length > 0 ? check.detail : (check.ok ? zrT('检查通过') : zrT('检查失败'))
  return h('div', { className: 'zr-check-result' + (check.ok === true ? ' zr-check-ok' : ' zr-check-bad') }, detail)
}

function ZrConfigCard(props) {
  var card = props.card
  var values = props.values || {}
  var onField = props.onField
  var onSave = props.onSave === undefined ? function () {} : props.onSave
  var dirty = props.dirty === true
  var onAction = props.onAction
  var saved = props.saved
  var busy = props.busy === true
  var busyAction = props.busyAction
  var check = props.check
  var fields = (card.fields || []).slice()
  var actions = (card.actions || []).slice()
  var actionsTop = card.actionsPosition === 'top'
  var actionRow = (function () {
    if (card.kind === 'info') {
      return h('div', { className: 'zr-actions zr-actions-top' }, actions.map(function (action) {
        var isBusy = busyAction === action.id
        return h('button', {
          className: 'zr-btn' + (isBusy ? ' zr-btn-busy' : ''),
          key: action.id,
          type: 'button',
          disabled: isBusy,
          onClick: function () { if (!isBusy) onAction(card.id, action.id) },
        }, isBusy ? zrT('检查中…') : zrT(action.label))
      }), saved === card.id ? h('span', { className: 'zr-saved' }, zrT('已更新')) : null)
    }
    return h('div', { className: 'zr-actions zr-actions-top' }, actions.map(function (action) {
      var isBusy = busyAction === action.id
      return h('button', {
        className: 'zr-btn' + (isBusy ? ' zr-btn-busy' : ''),
        key: action.id,
        type: 'button',
        disabled: isBusy,
        onClick: function () { if (!isBusy) onAction(card.id, action.id) },
      }, isBusy ? zrT('检查中…') : zrT(action.label))
    }), saved === card.id ? h('span', { className: 'zr-saved' }, zrT('已自动保存')) : null)
  })()
  return h('div', { className: 'zr-card', key: card.id },
    card.title ? h('div', { className: 'zr-card-head' }, h('h4', null, zrT(card.title))) : null,
    actionsTop ? actionRow : null,
    card.kind === 'info' && !actionsTop
      ? h('div', null,
        h('div', { className: 'zr-desc' + (busyAction === undefined || busyAction === null ? '' : ' zr-desc-busy') },
          busyAction === undefined || busyAction === null ? zrT(card.status || '') : zrT('正在检查，请稍等…')),
        h('div', { className: 'zr-actions' }, actions.map(function (action) {
          if (typeof action.href === 'string' && action.href.length > 0) {
            return h('a', {
              className: 'zr-btn',
              key: action.id,
              href: action.href,
              target: '_blank',
              rel: 'noopener',
            }, zrT(action.label))
          }
          var isBusy = busyAction === action.id
          return h('button', {
            className: 'zr-btn' + (isBusy ? ' zr-btn-busy' : ''),
            key: action.id,
            type: 'button',
            disabled: isBusy,
            onClick: function () { if (!isBusy) onAction(card.id, action.id) },
          }, isBusy ? zrT('检查中…') : zrT(action.label))
        }), saved === card.id ? h('span', { className: 'zr-saved' }, zrT('已更新')) : null)
      )
      : null,
    fields.length > 0
      ? h('div', { className: 'zr-field-grid' }, (function () {
        var rows = []
        for (var i = 0; i < fields.length; i += 1) {
          var field = fields[i]
          // 多行文本框与状态行独占一行，其余两列排布
          if (field.control === 'textarea' || field.control === 'status' || field.control === 'inline-select') { rows.push([field]); continue }
          var next = fields[i + 1]
          if (next !== undefined && next.control !== 'textarea' && next.control !== 'status' && next.control !== 'inline-select') {
            rows.push([field, next])
            i += 1
          } else {
            rows.push([field])
          }
        }
        return rows.map(function (pair, rowIndex) {
          // 状态行/内嵌下拉直接铺满整行，不进两列网格
          var single = pair.length === 1 && (pair[0].control === 'status' || pair[0].control === 'inline-select')
          if (single) {
            var field = pair[0]
            return h(ZrConfigField, {
              key: field.id,
              field: field,
              value: values[field.id],
              onChange: function (next) { onField(card.id, field.id, next) },
            })
          }
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
    zrCheckLine(check),
    card.kind === 'info'
      ? null
      : h('div', { className: 'zr-actions zr-save-row' },
        h('button', {
          className: 'zr-btn zr-btn-primary' + (busy ? ' zr-btn-busy' : ''),
          key: 'save',
          type: 'button',
          disabled: busy || !dirty,
          title: dirty ? zrT('保存这一块的配置') : zrT('没有改动'),
          onClick: function () { if (!busy && dirty) onSave(card.id) },
        }, busy ? zrT('保存中…') : zrT('保存')),
        actions.map(function (action) {
          var isBusy = busyAction === action.id
          return h('button', {
            className: 'zr-btn' + (isBusy ? ' zr-btn-busy' : ''),
            key: action.id,
            type: 'button',
            disabled: isBusy,
            onClick: function () { if (!isBusy) onAction(card.id, action.id) },
          }, isBusy ? zrT('检查中…') : zrT(action.label))
        }),
        saved === card.id && !dirty ? h('span', { className: 'zr-saved' }, zrT('已保存')) : null,
        dirty ? h('span', { className: 'zr-dirty' }, zrT('有未保存的修改')) : null
      )
  )
}

function zrBuildValues(cards) {
  var values = {}
  for (var i = 0; i < cards.length; i += 1) {
    var card = cards[i]
    if (card.kind !== 'fields') continue
    values[card.id] = {}
    for (var k = 0; k < (card.fields || []).length; k += 1) {
      var field = card.fields[k]
      values[card.id][field.id] = field.value || ''
    }
  }
  return values
}

function ZrSettingsView(props) {
  var minimal = props.minimal === true
  void minimal
  var pair = zrUseAsync(function () { return zrRequest('/settings', undefined, ZR_TIMEOUT_SETTINGS) }, [])
  var state = pair[0]
  var setState = pair[1]
  var reload = pair[2]
  var valuesPair = React.useState({})
  var values = valuesPair[0]
  var setValues = valuesPair[1]
  var valuesRef = React.useRef({})
  valuesRef.current = values
  var baselineRef = React.useRef({})
  var savedPair = React.useState(null)
  var saved = savedPair[0]
  var setSaved = savedPair[1]
  var errorPair = React.useState(null)
  var error = errorPair[0]
  var setError = errorPair[1]
  var busyPair = React.useState(0)
  var busy = busyPair[0] > 0
  var setBusy = busyPair[1]
  var actionBusyPair = React.useState(null)
  var actionBusy = actionBusyPair[0]
  var setActionBusy = actionBusyPair[1]
  var checksPair = React.useState({})
  var checks = checksPair[0]
  var setChecks = checksPair[1]
  var pagePair = React.useState('models')
  var activePage = pagePair[0]
  var setActivePage = pagePair[1]

  /**
   * 保存/检查成功后刷新服务端数据，但保留用户已输入但尚未提交的内容：
   * 只更新基线（判断“值有没有变”用），不覆盖本地输入。
   */
  var refreshPayload = function (payload) {
    var built = zrBuildValues(payload.cards || [])
    baselineRef.current = built
    setState({ loading: false, error: null, value: payload })
    setValues(function (previous) {
      var next = {}
      for (var cardId in built) {
        next[cardId] = {}
        for (var fieldId in built[cardId]) {
          var hasLocal = previous[cardId] !== undefined && Object.prototype.hasOwnProperty.call(previous[cardId], fieldId)
          next[cardId][fieldId] = hasLocal ? previous[cardId][fieldId] : built[cardId][fieldId]
        }
      }
      return next
    })
  }

  React.useEffect(function () {
    if (state.value === null) return
    var built = zrBuildValues(state.value.cards || [])
    baselineRef.current = built
    setValues(built)
  }, [state.value])

  if (state.loading && state.value === null) return h('div', { className: 'zr-note' }, zrT('正在读取设置…'))
  if (state.error !== null) {
    return h('div', null,
      h('div', { className: 'zr-err' }, zrT('读取设置失败：') + state.error),
      h('div', { className: 'zr-actions' }, h('button', { className: 'zr-btn', onClick: reload }, zrT('重试')))
    )
  }
  var data = state.value

  var saveCard = function (cardId, overrideValues) {
    var card = (data.cards || []).find(function (item) { return item.id === cardId })
    if (card === undefined) return
    var body = { action: 'save', cardId: cardId, values: overrideValues || valuesRef.current[cardId] || {} }
    setError(null)
    setBusy(function (count) { return count + 1 })
    zrRequest('/settings', body, ZR_TIMEOUT_SETTINGS).then(function (payload) {
      refreshPayload(payload.settings)
      // 保存会触发插件重启：稍后再拉一次，拿到重启后的真实配置
      setTimeout(function () { reload() }, 900)
      setSaved(cardId)
      setChecks(function (previous) {
        var copy = {}
        for (var id in previous) copy[id] = previous[id]
        delete copy[cardId]
        return copy
      })
    }, function (reason) {
      setError(zrErrorText(reason))
    }).then(function () {
      setBusy(function (count) { return Math.max(0, count - 1) })
    })
  }

  var setValueLocal = function (cardId, fieldId, next) {
    setValues(function (previous) {
      var copy = {}
      for (var id in previous) copy[id] = previous[id]
      copy[cardId] = {}
      for (var item in previous[cardId]) copy[cardId][item] = previous[cardId][item]
      copy[cardId][fieldId] = next
      return copy
    })
    setSaved(null)
  }

  var setField = function (cardId, fieldId, next) {
    setValueLocal(cardId, fieldId, next)
    var card = (data.cards || []).find(function (item) { return item.id === cardId })
    var field = card === undefined ? undefined : (card.fields || []).find(function (item) { return item.id === fieldId })
    // 下拉/开关类没有“失焦保存”的时机，标了 autoSave 的卡片选中即保存。
    if (card !== undefined && card.autoSave === true && field !== undefined && (field.control === 'select' || field.control === 'inline-select')) {
      var merged = {}
      var current = valuesRef.current[cardId] || {}
      for (var key in current) merged[key] = current[key]
      merged[fieldId] = next
      saveCard(cardId, merged)
    }
  }

  /** 这一块的输入和已保存的值不一样就算有改动，用来决定「保存」能不能点。 */
  var isDirty = function (cardId) {
    var current = valuesRef.current[cardId] || {}
    var base = baselineRef.current[cardId] || {}
    for (var id in current) {
      var normalized = current[id] === undefined || current[id] === null ? '' : String(current[id])
      var before = base[id] === undefined || base[id] === null ? '' : String(base[id])
      if (normalized !== before) return true
    }
    return false
  }

  var runAction = function (cardId, actionId) {
    setError(null)
    setSaved(null)
    setActionBusy(actionId)
    zrRequest('/settings', { action: actionId, cardId: cardId }, ZR_TIMEOUT_SETTINGS).then(function (payload) {
      if (payload !== undefined && payload.check !== undefined) {
        setChecks(function (previous) {
          var copy = {}
          for (var id in previous) copy[id] = previous[id]
          copy[cardId] = payload.check
          return copy
        })
      }
      if (payload !== undefined && payload.settings !== undefined) refreshPayload(payload.settings)
      else reload()
      setSaved(cardId)
    }).catch(function (reason) {
      setError(zrErrorText(reason))
    }).then(function () {
      setActionBusy(null)
    })
  }

  var pages = [
    { id: 'models', label: zrT('模型服务') },
    { id: 'research', label: zrT('科研服务') },
    { id: 'runtime', label: zrT('运行环境') },
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
        return h(ZrConfigCard, {
          key: card.id,
          card: card,
          values: values[card.id],
          saved: saved,
          busyAction: actionBusy,
          check: checks[card.id],
          onField: setField,
          onSave: saveCard,
          dirty: isDirty(card.id),
          busy: busy,
          onAction: runAction,
        })
      }),
      busy ? h('div', { className: 'zr-note' }, zrT('正在保存…')) : null
    )
  )
}

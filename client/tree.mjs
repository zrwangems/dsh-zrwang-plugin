/**
 * 技能目录树视图：折叠、三态复选框、搜索过滤；未配置好的技能禁选并标“未配置”。
 */

function zrLeafInfo(node, blocked) {
  var names = []
  var selectable = []
  var walk = function (current) {
    if (current.kind === 'skill') {
      names.push(current.name)
      if (blocked[current.name] === undefined) selectable.push(current.name)
      return
    }
    for (var i = 0; i < (current.children || []).length; i += 1) walk(current.children[i])
  }
  walk(node)
  return { names: names, selectable: selectable, blocked: names.length - selectable.length }
}

function zrNodeSummary(node, selection, blocked) {
  var info = zrLeafInfo(node, blocked)
  var selected = 0
  for (var i = 0; i < info.selectable.length; i += 1) {
    if (selection[info.selectable[i]] === true) selected += 1
  }
  return {
    total: info.names.length,
    selectable: info.selectable.length,
    blocked: info.blocked,
    selected: selected,
    all: info.selectable.length > 0 && selected === info.selectable.length,
    some: selected > 0,
  }
}

function zrNodeMatches(node, query) {
  if (query.length === 0) return true
  var hay = [node.title, node.zh, node.desc, node.name].filter(function (item) { return typeof item === 'string' }).join(' ')
  if (hay.toLowerCase().indexOf(query) >= 0) return true
  for (var i = 0; i < (node.children || []).length; i += 1) {
    if (zrNodeMatches(node.children[i], query)) return true
  }
  return false
}

function zrFilterTree(node, query) {
  if (query.length === 0) return node
  if (!zrNodeMatches(node, query)) return null
  if (node.kind === 'skill') return node
  var children = []
  for (var i = 0; i < (node.children || []).length; i += 1) {
    var child = zrFilterTree(node.children[i], query)
    if (child !== null) children.push(child)
  }
  var copy = {}
  for (var key in node) copy[key] = node[key]
  copy.children = children
  return copy
}

function ZrCheckbox(props) {
  var ref = React.useRef(null)
  React.useEffect(function () {
    if (ref.current !== null) ref.current.indeterminate = props.indeterminate === true
  }, [props.indeterminate, props.checked])
  return h('input', {
    ref: ref,
    type: 'checkbox',
    className: 'zr-check',
    checked: props.checked === true,
    disabled: props.disabled === true,
    onChange: props.onChange,
    'aria-label': props.label,
  })
}

function ZrNodeRow(props) {
  var node = props.node
  var depth = props.depth
  var blocked = props.blocked || {}
  var hasChildren = (node.children || []).length > 0
  var searching = props.search.length > 0
  var isOpen = searching ? true : props.expanded[node.id] === true
  var summary = zrNodeSummary(node, props.selection, blocked)
  var checked = false
  var disabled = false
  var blockedReason
  var gateOpen = false
  if (node.kind === 'skill') {
    blockedReason = blocked[node.name]
    disabled = blockedReason !== undefined
    checked = disabled !== true && props.selection[node.name] === true
  } else {
    gateOpen = depth === 0 ? props.gates[node.id] === true : props.gates[node.id] !== false
    checked = gateOpen
    disabled = summary.selectable === 0
  }
  if (props.locked === true) disabled = true
  var onCheck = function () {
    if (disabled) return
    if (node.kind === 'skill') props.onToggleSkill(node, !checked)
    else props.onToggleGate(node.id, !gateOpen)
  }
  var row = h('div', {
    className: 'zr-row',
    'data-kind': node.kind,
    'data-blocked': disabled ? '1' : '0',
    style: { paddingLeft: (6 + depth * 12) + 'px' },
  },
    h('button', {
      className: 'zr-chev',
      'data-empty': hasChildren ? '0' : '1',
      onClick: function () { props.onToggleExpanded(node.id, !isOpen) },
      'aria-label': isOpen ? '收起' : '展开',
    }, isOpen ? '▾' : '▸'),
    h(ZrCheckbox, { checked: checked, disabled: disabled, label: node.title, onChange: onCheck }),
    h('div', { className: 'zr-text' },
      h('div', { className: 'zr-title' },
        h('span', { title: blockedReason || node.zh || node.desc || node.title }, node.title),
        node.kind === 'skill' ? null : h('span', { className: 'zr-badge' }, summary.selected + '/' + summary.total),
        node.kind !== 'skill' && checked !== true && summary.selected > 0 ? h('span', { className: 'zr-tag' }, '未注入') : null,
        disabled && blockedReason !== undefined ? h('span', { className: 'zr-tag zr-blocked', title: blockedReason }, '未配置') : null
      ),
      node.kind !== 'skill' && node.desc ? h('div', { className: 'zr-desc' }, node.desc) : null,
      node.kind === 'skill' ? h('div', { className: 'zr-desc' }, blockedReason !== undefined ? node.zh + '（' + blockedReason + '）' : node.zh) : null
    ),
    node.kind === 'skill'
      ? h('div', { className: 'zr-row-actions' },
        h('button', {
          className: 'zr-detailbtn' + (props.detail !== null && props.detail.name === node.name ? ' zr-active' : ''),
          title: '展开/收起中文详情',
          onClick: function (event) { event.stopPropagation(); props.onToggleDetail(node) },
        }, '详情'),
        props.onOpenDoc !== undefined
          ? h('button', {
            className: 'zr-docbtn',
            title: '在右侧栏打开 SKILL.md',
            onClick: function (event) { event.stopPropagation(); props.onOpenDoc(node) },
          }, '打开')
          : null)
      : null
  )
  if (node.kind === 'skill' && props.detail !== null && props.detail.name === node.name) {
    var detail = props.detail
    var card = h('div', { className: 'zr-detail-card' },
      h('div', { className: 'zr-detail-title' }, node.title),
      h('div', { className: 'zr-detail-zh' }, node.zh || ''),
      detail.doc !== undefined
        ? h('div', { className: 'zr-detail-body' }, detail.doc.detailZh || '')
        : (detail.failed === true
          ? h('div', { className: 'zr-detail-body' }, '（中文说明暂不可用）')
          : h('div', { className: 'zr-detail-loading' }, '正在翻译中文说明…（首次可能需要几秒）'))
    )
    return h(React.Fragment, null, row, card)
  }
  if (!hasChildren || !isOpen) return row
  var children = []
  for (var i = 0; i < node.children.length; i += 1) {
    children.push(h(ZrNodeRow, {
      key: node.children[i].id,
      node: node.children[i],
      depth: depth + 1,
      expanded: props.expanded,
      selection: props.selection,
      gates: props.gates,
      blocked: blocked,
      locked: props.locked,
      search: props.search,
      onToggleExpanded: props.onToggleExpanded,
      onToggleGate: props.onToggleGate,
      onToggleSkill: props.onToggleSkill,
      detail: props.detail,
      onToggleDetail: props.onToggleDetail,
      onOpenDoc: props.onOpenDoc,
    }))
  }
  return h(React.Fragment, null, row, children)
}

function zrKnownSkillNames(groups) {
  var known = {}
  var walk = function (node) {
    if (node.kind === 'skill') {
      known[node.name] = true
      return
    }
    for (var i = 0; i < (node.children || []).length; i += 1) walk(node.children[i])
  }
  for (var i = 0; i < groups.length; i += 1) walk(groups[i])
  return known
}

function ZrSkillsView(props) {
  var data = props.data
  var blocked = props.blocked || {}
  var query = props.search.trim().toLowerCase()
  var groups = []
  for (var i = 0; i < data.catalog.groups.length; i += 1) {
    var filtered = zrFilterTree(data.catalog.groups[i], query)
    if (filtered !== null) groups.push(filtered)
  }
  var known = zrKnownSkillNames(data.catalog.groups)
  var conflicts = (data.links.conflicts || []).filter(function (item) { return known[item.name] === true })
  return h(React.Fragment, null,
    h('div', { className: 'zr-toolbar' },
      h('input', {
        className: 'zr-search',
        placeholder: '搜索技能、类别或说明',
        value: props.search,
        onChange: function (event) { props.onSearch(event.target.value) },
      }),
      h('button', { className: 'zr-btn', onClick: function () { props.onExpandAll(true) } }, '展开'),
      h('button', { className: 'zr-btn', onClick: function () { props.onExpandAll(false) } }, '收起')
    ),
    h('div', { className: 'zr-tree' },
      groups.length === 0 ? h('div', { className: 'zr-note' }, '没有匹配的技能') : null,
      groups.map(function (group) {
        return h(ZrNodeRow, {
          key: group.id,
          node: group,
          depth: 0,
          expanded: props.expanded,
          selection: props.selection,
          gates: data.session.gates,
          blocked: blocked,
          locked: props.locked,
          search: query,
          onToggleExpanded: props.onToggleExpanded,
          onToggleGate: props.onToggleGate,
          onToggleSkill: props.onToggleSkill,
          detail: props.detail,
          onToggleDetail: props.onToggleDetail,
          onOpenDoc: props.onOpenDoc,
        })
      })
    ),
    conflicts.length > 0
      ? h('div', { className: 'zr-foot' },
        h('div', { className: 'zr-err' }, conflicts.map(function (item) { return item.name + '：' + item.reason }).join('\n')))
      : null
  )
}

/**
 * 技能目录树视图：折叠、三态复选框、搜索过滤；未配置好的技能禁选并标“未配置”。
 */

/**
 * 统计一棵子树：total 技能数、selected 已勾选、injected 当前门禁下真正会注入的数量。
 * 父级目录关闭时，子树的 injected 全部为 0——这正是界面上要能看出来的差别。
 */
function zrNodeStats(node, depth, gates, selection, blocked, parentOpen) {
  if (node.kind === 'skill') {
    var isBlocked = blocked[node.name] !== undefined
    var isSelected = selection[node.name] === true
    return {
      total: 1,
      selected: isSelected ? 1 : 0,
      injected: parentOpen === true && isSelected && !isBlocked ? 1 : 0,
      blocked: isBlocked ? 1 : 0,
      open: parentOpen === true,
    }
  }
  var selfOpen = depth === 0 ? gates[node.id] === true : gates[node.id] !== false
  var open = parentOpen === true && selfOpen
  var total = 0
  var selected = 0
  var injected = 0
  var blockedCount = 0
  var children = node.children || []
  for (var i = 0; i < children.length; i += 1) {
    var child = zrNodeStats(children[i], depth + 1, gates, selection, blocked, open)
    total += child.total
    selected += child.selected
    injected += child.injected
    blockedCount += child.blocked
  }
  return { total: total, selected: selected, injected: injected, blocked: blockedCount, open: open }
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
  var sources = props.sources || {}
  var repoUrl = node.kind === 'skill'
    ? (sources.bySkill || {})[node.name]
    : (sources.byNode || {})[node.id]
  var hasChildren = (node.children || []).length > 0
  var searching = props.search.length > 0
  var isOpen = searching ? true : props.expanded[node.id] === true
  var stats = zrNodeStats(node, depth, props.gates || {}, props.selection, blocked, props.parentOpen !== false)
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
    disabled = stats.total - stats.blocked === 0
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
        node.kind === 'skill' ? null : h('span', { className: 'zr-badge', title: '已注入/技能总数' }, '注入 ' + stats.injected + '/' + stats.total),
        node.kind !== 'skill' && stats.selected !== stats.injected
          ? h('span', { className: 'zr-tag', title: '已勾选的技能数（父级目录关闭时不注入）' }, '已勾选 ' + stats.selected)
          : null,
        node.kind !== 'skill' && checked !== true && stats.selected > 0 ? h('span', { className: 'zr-tag' }, '未注入') : null,
        disabled && blockedReason !== undefined ? h('span', { className: 'zr-tag zr-blocked', title: blockedReason }, '未配置') : null
      ),
      node.kind !== 'skill' && node.desc ? h('div', { className: 'zr-desc' }, node.desc) : null,
      node.kind === 'skill' ? h('div', { className: 'zr-desc' }, blockedReason !== undefined ? node.zh + '（' + blockedReason + '）' : node.zh) : null
    ),
    h('div', { className: 'zr-row-actions' },
      repoUrl === undefined
        ? null
        : h('button', {
          className: 'zr-repobtn',
          title: '在浏览器打开上游 GitHub 项目：' + repoUrl.replace('https://github.com/', ''),
          onClick: function (event) {
            event.stopPropagation()
            if (props.onOpenRepo !== undefined) props.onOpenRepo(repoUrl)
          },
        }, '↗'),
      hasChildren && node.kind !== 'skill'
        ? h(React.Fragment, null,
          h('button', {
            className: 'zr-bulkbtn',
            title: '选中/打开这一层下面的所有技能与分组（只下一层）',
            onClick: function (event) { event.stopPropagation(); if (props.onBulk !== undefined) props.onBulk(node.id, true) },
          }, '全选'),
          h('button', {
            className: 'zr-bulkbtn',
            title: '取消/关闭这一层下面的所有技能与分组（只下一层）',
            onClick: function (event) { event.stopPropagation(); if (props.onBulk !== undefined) props.onBulk(node.id, false) },
          }, '全关'))
        : null,
      node.kind === 'skill'
        ? h(React.Fragment, null,
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
        : null)
  )
  if (node.kind === 'skill' && props.detail !== null && props.detail.name === node.name) {
    var detail = props.detail
    var card = h('div', { className: 'zr-detail-card' },
      detail.doc !== undefined
        ? h('div', { className: 'zr-detail-body' },
          h(ZrMarkdown, { text: detail.doc.detailZh || '' }),
          detail.doc.truncated === true
            ? h('div', { className: 'zr-detail-note' }, '中文摘要在此处中断；完整内容请点该技能行右侧的「打开」查看 SKILL.md。')
            : null)
        : (detail.failed === true
          ? h('div', { className: 'zr-detail-body' }, '（中文说明暂不可用）')
          : h('div', { className: 'zr-detail-loading' }, '正在读取中文说明…'))
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
      parentOpen: stats.open,
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
      sources: props.sources,
      onOpenRepo: props.onOpenRepo,
      onBulk: props.onBulk,
    }))
  }
  return h(React.Fragment, null, row, children)
}

function ZrPresetsBar(props) {
  var presets = props.presets || { active: '默认', items: [] }
  var items = presets.items || []
  var menuPair = React.useState(null)
  var menu = menuPair[0]
  var setMenu = menuPair[1]

  // 右键菜单挂到 document.body：侧栏容器有 overflow/transform 时，面板内的 fixed 会被裁剪。
  React.useEffect(function () {
    if (menu === null) return undefined
    var node = document.createElement('div')
    node.className = 'zr-ctx'
    node.style.position = 'fixed'
    node.style.zIndex = '2147483000'
    var entries = [{
      label: '基于此新建',
      action: function () { props.onClone(menu.name) },
    }]
    if (menu.builtin !== true) {
      entries.push({
        label: '重命名',
        action: function () {
          var current = menu.unnamed === true ? '' : menu.name
          var next = window.prompt('重命名为：', current)
          if (next === null) return
          var trimmed = next.trim()
          if (trimmed.length > 0 && trimmed !== menu.name) props.onRename(menu.name, trimmed)
        },
      })
      entries.push({
        label: '删除',
        danger: true,
        action: function () {
          if (window.confirm('删除模式「' + menu.name + '」？')) props.onDelete(menu.name)
        },
      })
    }
    entries.forEach(function (entry) {
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = entry.label
      if (entry.danger === true) button.className = 'zr-ctx-danger'
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        setMenu(null)
        entry.action()
      })
      node.appendChild(button)
    })
    node.addEventListener('click', function (event) { event.stopPropagation() })
    document.body.appendChild(node)
    // 选择态在底部：菜单固定出现在 chip 上方；水平方向按 chip 左边缘对齐并夹在视口内
    var width = node.offsetWidth || 132
    var height = node.offsetHeight || 90
    var anchor = menu.anchor || { left: menu.x, right: menu.x, top: menu.y }
    var left = anchor.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    var top = anchor.top - height - 6
    if (top < 8) top = Math.max(8, (anchor.bottom || anchor.top) + 6)
    node.style.left = left + 'px'
    node.style.top = top + 'px'
    var close = function () { setMenu(null) }
    document.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return function () {
      document.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      if (node.parentNode !== null) node.parentNode.removeChild(node)
    }
  }, [menu])

  var openMenu = function (event, item) {
    event.preventDefault()
    event.stopPropagation()
    if (props.locked === true) return
    var rect = event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
      ? event.currentTarget.getBoundingClientRect()
      : { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY }
    setMenu({
      x: event.clientX,
      y: event.clientY,
      anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      name: item.name,
      builtin: item.builtin === true,
      unnamed: item.unnamed === true,
    })
  }

  return h('div', { className: 'zr-presets' },
    h('div', { className: 'zr-presets-list' },
      items.map(function (mode) {
        var active = presets.active === mode.name
        return h('button', {
          key: mode.name,
          className: 'zr-preset' + (active ? ' zr-active' : '') + (mode.unnamed === true ? ' zr-unnamed' : ''),
          disabled: props.locked === true,
          title: (mode.unnamed === true ? '当前对话的临时模式，右键可改名/删除' : '右键：基于此新建 / 重命名 / 删除'),
          onClick: function () { if (!active) props.onApply(mode.name) },
          onContextMenu: function (event) { openMenu(event, mode) },
        }, mode.name + ' · ' + mode.count)
      })
    )
  )
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

function ZrArsRow(props) {
  var ars = props.data.ars
  var openPair = React.useState(false)
  var open = openPair[0]
  var setOpen = openPair[1]
  var docPair = React.useState(null)
  var doc = docPair[0]
  var setDoc = docPair[1]
  if (ars === undefined) return null
  var enabled = props.gates.ars === true
  var toggle = function () {
    var next = !open
    setOpen(next)
    if (next && doc === null) {
      setDoc({ loading: true })
      zrRequest('/ars/doc').then(function (payload) {
        setDoc({ text: payload.text, title: payload.title })
      }, function (reason) {
        setDoc({ failed: reason })
      })
    }
  }
  var badge = ars.injected + '/' + ars.skillCount
  var row = h('div', { className: 'zr-row', 'data-kind': 'group', 'data-blocked': '0', style: { paddingLeft: '6px' } },
    h('button', { className: 'zr-chev', 'data-empty': '1', tabIndex: -1, 'aria-hidden': 'true', onClick: function () { toggle() } }, '▸'),
    h(ZrCheckbox, {
      checked: enabled,
      disabled: props.locked === true,
      label: ars.label,
      onChange: function () { if (props.locked !== true) props.onToggleGate('ars', !enabled) },
    }),
    h('div', { className: 'zr-text' },
      h('div', { className: 'zr-title' },
        h('span', { title: ars.license }, ars.label),
        h('span', { className: 'zr-badge' }, badge),
        enabled !== true ? h('span', { className: 'zr-tag' }, '未注入') : null
      ),
      h('div', { className: 'zr-desc' }, '论文流水线 · ' + ars.commandCount + ' 个 /ars-* 命令')
    ),
    h('div', { className: 'zr-row-actions' },
      typeof ars.repo === 'string' && ars.repo.length > 0
        ? h('button', {
          className: 'zr-repobtn',
          title: '在浏览器打开上游 GitHub 项目：' + ars.repo,
          type: 'button',
          onClick: function (event) {
            event.stopPropagation()
            if (props.onOpenRepo !== undefined) props.onOpenRepo('https://github.com/' + ars.repo)
          },
        }, '↗')
        : null,
      h('button', {
        className: 'zr-detailbtn' + (open ? ' zr-active' : ''),
        type: 'button',
        onClick: function (event) { event.stopPropagation(); toggle() },
      }, '详情'))
  )
  if (!open) return row
  var card = h('div', { className: 'zr-detail-card' },
    doc === null || doc.loading === true
      ? h('div', { className: 'zr-detail-loading' }, '正在读取用法…')
      : (doc.failed !== undefined
        ? h('div', { className: 'zr-detail-body' }, '用法文档读取失败：' + String(doc.failed))
        : h('div', { className: 'zr-ars-doc' }, h(ZrMarkdown, { text: doc.text }))))
  return h(React.Fragment, null, row, card)
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
          parentOpen: true,
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
          sources: data.catalog.sources,
          onOpenRepo: props.onOpenRepo,
          onBulk: props.onBulk,
        })
      }),
      h(ZrArsRow, {
        data: data,
        gates: data.session.gates,
        locked: props.locked,
        onToggleGate: props.onToggleGate,
        onOpenRepo: props.onOpenRepo,
      })
    ),
    conflicts.length > 0
      ? h('div', { className: 'zr-foot' },
        h('div', { className: 'zr-err' }, conflicts.map(function (item) { return item.name + '：' + item.reason }).join('\n')))
      : null
  )
}

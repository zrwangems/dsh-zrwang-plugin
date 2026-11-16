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
    // 更深层目录：子树里没有任何勾选技能时不显示勾选，也不让点（避免“空目录也勾着”）
    if (depth > 0 && stats.selected === 0) disabled = true
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
      'aria-label': isOpen ? zrT('收起') : zrT('展开'),
    }, isOpen ? '▾' : '▸'),
    h(ZrCheckbox, { checked: checked, disabled: disabled, label: node.title, onChange: onCheck }),
    h('div', { className: 'zr-text' },
      h('div', { className: 'zr-title' },
        h('span', { title: blockedReason || node.zh || node.desc || node.title }, node.title),
        node.kind === 'skill' ? null : h('span', { className: 'zr-badge', title: zrT('已注入/技能总数') }, '注入 ' + stats.injected + '/' + stats.total),
        node.kind !== 'skill' && stats.selected !== stats.injected
          ? h('span', { className: 'zr-tag', title: zrT('已勾选的技能数（父级目录关闭时不注入）') }, '已勾选 ' + stats.selected)
          : null,
        node.kind !== 'skill' && stats.injected === 0 && stats.selected > 0 ? h('span', { className: 'zr-tag' }, zrT('未注入')) : null,
        disabled && blockedReason !== undefined ? h('span', { className: 'zr-tag zr-blocked', title: blockedReason }, zrT('未配置')) : null
      ),
      node.kind !== 'skill' && node.desc ? h('div', { className: 'zr-desc' }, node.desc) : null,
      node.kind === 'skill' ? h('div', { className: 'zr-desc' }, blockedReason !== undefined ? node.zh + '（' + blockedReason + '）' : node.zh) : null
    ),
    h('div', { className: 'zr-row-actions' },
      repoUrl === undefined
        ? null
        : h('button', {
          className: 'zr-repobtn',
          title: zrT('在浏览器打开上游 GitHub 项目：') + repoUrl.replace('https://github.com/', ''),
          onClick: function (event) {
            event.stopPropagation()
            if (props.onOpenRepo !== undefined) props.onOpenRepo(repoUrl)
          },
        }, '↗'),
      hasChildren && node.kind !== 'skill'
        ? (function () {
          // 搜索过滤时只对“看得见的直接子节点”生效，避免全选波及被过滤掉的项。
          var only
          if (searching) {
            only = (node.children || []).map(function (child) { return child.kind === 'skill' ? child.name : child.id })
          }
          return h(React.Fragment, null,
            h('button', {
              className: 'zr-bulkbtn',
              title: zrT('选中/打开这一层下面的所有技能与分组（只下一层）'),
              onClick: function (event) { event.stopPropagation(); if (props.onBulk !== undefined) props.onBulk(node.id, true, only) },
            }, zrT('全选')),
            h('button', {
              className: 'zr-bulkbtn',
              title: zrT('取消/关闭这一层下面的所有技能与分组（只下一层）'),
              onClick: function (event) { event.stopPropagation(); if (props.onBulk !== undefined) props.onBulk(node.id, false, only) },
            }, zrT('全关')))
        })()
        : null,
      node.kind === 'skill'
        ? h(React.Fragment, null,
          h('button', {
            className: 'zr-detailbtn' + (props.detail !== null && props.detail.name === node.name ? ' zr-active' : ''),
            title: zrT('展开/收起中文详情'),
            onClick: function (event) { event.stopPropagation(); props.onToggleDetail(node) },
          }, zrT('详情')),
          props.onOpenDoc !== undefined
            ? h('button', {
              className: 'zr-docbtn',
              title: zrT('在右侧栏打开 SKILL.md'),
              onClick: function (event) { event.stopPropagation(); props.onOpenDoc(node) },
            }, zrT('打开'))
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
            ? h('div', { className: 'zr-detail-note' }, zrT('中文摘要在此处中断；完整内容请点该技能行右侧的「打开」查看 SKILL.md。'))
            : null)
        : (detail.failed === true
          ? h('div', { className: 'zr-detail-body' }, zrT('（中文说明暂不可用）'))
          : h('div', { className: 'zr-detail-loading' }, zrT('正在读取中文说明…')))
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
  var workspace = presets.workspace || null
  var menuPair = React.useState(null)
  var menu = menuPair[0]
  var setMenu = menuPair[1]
  // 不用原生 window.prompt/confirm：Electron 的渲染进程没有 prompt，桌面端会静默失败。
  var dialogPair = React.useState(null)
  var dialog = dialogPair[0]
  var setDialog = dialogPair[1]

  var closeDialog = function () { setDialog(null) }
  var submitDialog = function () {
    if (dialog === null) return
    if (dialog.kind === 'rename') {
      var trimmed = String(dialog.value || '').trim()
      if (trimmed.length > 0 && trimmed !== dialog.name) props.onRename(dialog.name, trimmed)
    } else if (dialog.kind === 'delete') {
      props.onDelete(dialog.name)
    }
    setDialog(null)
  }
  var dialogInput = function (event) {
    setDialog(function (previous) {
      if (previous === null) return previous
      var next = {}
      for (var key in previous) next[key] = previous[key]
      next.value = event.target.value
      return next
    })
  }
  var dialogKeyDown = function (event) {
    if (event.key === 'Enter') { event.preventDefault(); submitDialog() } else if (event.key === 'Escape') { event.preventDefault(); closeDialog() }
  }

  // 菜单作为组件自己的 React 子节点渲染（position: fixed + 视口坐标），不再往 document.body 写节点。
  var menuEntries = []
  if (menu !== null) {
    menuEntries.push({ label: zrT('基于此新建'), action: function () { props.onClone(menu.name) } })
    if (menu.builtin !== true) {
      menuEntries.push({
        label: zrT('重命名'),
        action: function () { setDialog({ kind: 'rename', name: menu.name, value: menu.name }) },
      })
      menuEntries.push({
        label: zrT('删除'),
        danger: true,
        action: function () { setDialog({ kind: 'delete', name: menu.name }) },
      })
    }
  }
  var menuStyle = (function () {
    if (menu === null) return null
    var anchor = menu.anchor || { left: menu.x, right: menu.x, top: menu.y, bottom: menu.y }
    var width = 132
    var left = anchor.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    return {
      position: 'fixed',
      left: left + 'px',
      top: Math.max(8, anchor.top - 6) + 'px',
      transform: 'translateY(-100%)',
    }
  })()
  React.useEffect(function () {
    if (menu === null) return undefined
    var close = function () { setMenu(null) }
    var onKey = function (event) { if (event.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return function () {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
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
      workspace: item.workspace === true,
    })
  }

  return h('div', { className: 'zr-presets' },
    workspace === null || workspace.title === undefined
      ? null
      : h('div', {
        className: 'zr-presets-ws',
        title: (workspace.title || '') + (workspace.path !== undefined && workspace.path.length > 0 ? '（' + workspace.path + '）' : ''),
      }, zrT('工作区：') + workspace.title),
    h('div', { className: 'zr-presets-list' },
      items.map(function (mode) {
        var active = presets.active === mode.name
        var tip = zrT('项目基础态（注入 0）；右键：基于此新建；勾选或打开门禁会自动建立当前工作区的模式')
        if (mode.workspace === true) tip = zrT('当前工作区的模式，改动自动保存；右键：基于此新建 / 重命名 / 删除')
        else if (mode.builtin !== true) tip = zrT('项目级模式，所有工作区共享；右键：基于此新建 / 重命名 / 删除')
        return h('button', {
          key: mode.name,
          className: 'zr-preset' + (active ? ' zr-active' : '') + (mode.workspace === true ? ' zr-wsmode' : ''),
          disabled: props.locked === true,
          title: tip,
          onClick: function () { if (!active) props.onApply(mode.name) },
          onContextMenu: function (event) { openMenu(event, mode) },
        }, mode.name + ' · ' + mode.count)
      })
    ),
    menu === null ? null : h('div', {
      className: 'zr-ctx',
      style: menuStyle,
      onClick: function (event) { event.stopPropagation() },
    }, menuEntries.map(function (entry) {
      return h('button', {
        key: entry.label,
        type: 'button',
        className: entry.danger === true ? 'zr-ctx-danger' : undefined,
        onClick: function (event) { event.stopPropagation(); setMenu(null); entry.action() },
      }, entry.label)
    })),
    dialog === null ? null : h('div', { className: 'zr-modal-mask', onClick: closeDialog },
      h('div', { className: 'zr-modal', onClick: function (event) { event.stopPropagation() } },
        h('div', { className: 'zr-modal-title' }, dialog.kind === 'rename' ? zrT('重命名模式') : zrT('删除模式')),
        dialog.kind === 'rename'
          ? h('input', {
            className: 'zr-input',
            autoFocus: true,
            value: dialog.value,
            onChange: dialogInput,
            onKeyDown: dialogKeyDown,
          })
          : h('div', { className: 'zr-desc' }, zrT('确定删除模式「{name}」？', { name: dialog.name })),
        h('div', { className: 'zr-modal-actions' },
          h('button', { className: 'zr-btn', type: 'button', onClick: closeDialog }, zrT('取消')),
          h('button', {
            className: 'zr-btn' + (dialog.kind === 'delete' ? ' zr-btn-danger' : ''),
            type: 'button',
            onClick: submitDialog,
          }, dialog.kind === 'rename' ? zrT('确定') : zrT('删除'))
        )
      )
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
        enabled !== true ? h('span', { className: 'zr-tag' }, zrT('未注入')) : null
      ),
      h('div', { className: 'zr-desc' }, zrT('论文流水线 · ') + ars.commandCount + zrT(' 个 /ars-* 命令'))
    ),
    h('div', { className: 'zr-row-actions' },
      typeof ars.repo === 'string' && ars.repo.length > 0
        ? h('button', {
          className: 'zr-repobtn',
          title: zrT('在浏览器打开上游 GitHub 项目：') + ars.repo,
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
      }, zrT('详情')))
  )
  if (!open) return row
  var card = h('div', { className: 'zr-detail-card' },
    doc === null || doc.loading === true
      ? h('div', { className: 'zr-detail-loading' }, zrT('正在读取用法…'))
      : (doc.failed !== undefined
        ? h('div', { className: 'zr-detail-body' }, zrT('用法文档读取失败：') + String(doc.failed))
        : h('div', { className: 'zr-ars-doc' }, h(ZrMarkdown, { text: doc.text }))))
  return h(React.Fragment, null, row, card)
}

var ZR_PHASE_CLASS = { running: ' zr-ok', starting: ' zr-warn', failed: ' zr-bad', unavailable: ' zr-blocked' }

/** 组件行状态文案：用本地模板拼，避免宿主返回的中文状态串在英文界面里露出来。 */
function zrComponentStatus(component) {
  var phase = component.phase === undefined ? 'idle' : component.phase
  if (phase === 'running') {
    return component.toolCount === undefined ? zrT('已启动') : zrT('已启动（{count} 个工具）', { count: component.toolCount })
  }
  if (phase === 'starting') {
    return component.attempt > 0 ? zrT('启动中（第 {n} 次尝试）', { n: component.attempt + 1 }) : zrT('启动中…')
  }
  if (phase === 'failed') return zrT('启动失败')
  if (phase === 'unavailable') return zrT('当前 profile 不支持')
  return zrT('未启动')
}

function ZrComponentRow(props) {
  var component = props.component
  if (component === undefined) return null
  // MathWorks 组件由工程技能组推导，不能手动勾；Windows MCP 组件手动开关。
  var locked = props.locked === true || component.kind === 'auto'
  var toggle = function () {
    if (locked) return
    if (props.onToggleGate !== undefined) props.onToggleGate(component.id, !component.enabled)
  }
  var phase = component.phase || 'idle'
  var tagTitle = ''
  if (component.server && component.server.lastError) tagTitle = component.server.lastError
  else if (phase === 'running') tagTitle = zrT('已注册到当前 DSH：MCP 工具会在当前对话的下一条消息起出现在工具表，不需要新开会话')
  else if (phase === 'starting') tagTitle = zrT('启动完成后，MCP 工具从当前对话的下一条消息起生效，不需要新开会话')
  var tag = component.enabled === true
    ? h('span', { className: 'zr-tag' + (ZR_PHASE_CLASS[phase] || ''), title: tagTitle }, zrComponentStatus(component))
    : (component.globallyActive === true
      ? h('span', { className: 'zr-tag zr-ok', title: zrT('其它会话仍在使用，组件保持注册') }, zrT('全局已启动'))
      : h('span', { className: 'zr-tag' }, component.kind === 'auto' ? zrT('未开启') : zrT('未注入')))
  var actions = []
  if (component.restartable === true && props.onMcpAction !== undefined) {
    actions.push(h('button', {
      className: 'zr-bulkbtn',
      type: 'button',
      title: zrT('重建这个 MCP 服务器实例（重置重连预算；MATLAB 重开会话后也用它）'),
      onClick: function (event) {
        event.stopPropagation()
        props.onMcpAction(component.id, 'restart')
      },
    }, zrT('重启')))
  }
  return h('div', { className: 'zr-row', 'data-kind': 'group', 'data-blocked': '0', style: { paddingLeft: '6px' } },
    h('button', { className: 'zr-chev', 'data-empty': '1', tabIndex: -1, 'aria-hidden': 'true' }, '▸'),
    h(ZrCheckbox, {
      checked: component.enabled === true,
      disabled: locked,
      label: zrT(component.label),
      onChange: toggle,
    }),
    h('div', { className: 'zr-text' },
      h('div', { className: 'zr-title' },
        h('span', null, zrT(component.label)),
        tag
      ),
      h('div', { className: 'zr-desc' },
        zrT(component.desc) + ' · ' + (component.kind === 'auto' ? zrT('随工程技能组自动开关') : zrT('手动开关')))
    ),
    actions.length > 0 ? h('div', { className: 'zr-row-actions' }, actions) : null
  )
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
        placeholder: zrT('搜索技能、类别或说明'),
        value: props.search,
        onChange: function (event) { props.onSearch(event.target.value) },
      }),
      h('button', { className: 'zr-btn', onClick: function () { props.onExpandAll(true) } }, zrT('展开')),
      h('button', { className: 'zr-btn', onClick: function () { props.onExpandAll(false) } }, zrT('收起'))
    ),
    h('div', { className: 'zr-tree' },
      (data.components || []).some(function (item) { return item.enabled === true; })
        ? h('div', { className: 'zr-mcp-strip' }, (data.components || []).filter(function (item) { return item.enabled === true; }).map(function (item) {
          return h('span', {
            key: item.id,
            className: 'zr-tag' + (ZR_PHASE_CLASS[item.phase] || ''),
            title: item.server && item.server.lastError ? item.server.lastError : '',
          }, zrT('{label}：{status}', { label: zrT(item.label), status: zrComponentStatus(item) }))
        }))
        : null,
      groups.length === 0 ? h('div', { className: 'zr-note' }, zrT('没有匹配的技能')) : null,
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
      }),
      (data.components || []).map(function (component) {
        return h(ZrComponentRow, {
          key: component.id,
          component: component,
          locked: props.locked,
          onToggleGate: props.onToggleGate,
          onMcpAction: props.onMcpAction,
        })
      })
    ),
    conflicts.length > 0
      ? h('div', { className: 'zr-foot' },
        h('div', { className: 'zr-err' }, conflicts.map(function (item) { return item.name + '：' + item.reason }).join('\n')))
      : null
  )
}

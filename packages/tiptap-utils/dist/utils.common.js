
    /*!
    * tiptap-utils v1.10.6
    * (c) 2024 überdosis GbR (limited liability)
    * @license MIT
    */
  
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var prosemirrorUtils = require('prosemirror-utils');

function getMarkAttrs(state, type) {
  const {
    from,
    to
  } = state.selection;
  let marks = [];
  state.doc.nodesBetween(from, to, node => {
    marks = [...marks, ...node.marks];
  });
  const mark = marks.find(markItem => markItem.type.name === type.name);
  if (mark) {
    return mark.attrs;
  }
  return {};
}

function nodeEqualsType({
  types,
  node
}) {
  return Array.isArray(types) && types.includes(node.type) || node.type === types;
}

function getNodeAttrs(state, type, attrs) {
  let attributes = attrs ? {
    ...attrs
  } : null;
  if ('align' in type.attrs) {
    const {
      schema: {
        nodes: {
          paragraph,
          heading
        }
      },
      selection: {
        from,
        to
      }
    } = state;
    let align = null;
    state.doc.nodesBetween(from, to, node => {
      if (align) {
        return false;
      }
      if (!nodeEqualsType({
        node,
        types: [paragraph, heading]
      })) {
        return true;
      }
      align = node.attrs.align || null;
      return false;
    });
    if (align) {
      attributes = attrs ? {
        ...attrs,
        align
      } : null;
    }
  }
  return attributes;
}

function getMarkRange($pos = null, type = null) {
  if (!$pos || !type) {
    return false;
  }
  const start = $pos.parent.childAfter($pos.parentOffset);
  if (!start.node) {
    return false;
  }
  const link = start.node.marks.find(mark => mark.type === type);
  if (!link) {
    return false;
  }
  let startIndex = $pos.index();
  let startPos = $pos.start() + start.offset;
  let endIndex = startIndex + 1;
  let endPos = startPos + start.node.nodeSize;
  while (startIndex > 0 && link.isInSet($pos.parent.child(startIndex - 1).marks)) {
    startIndex -= 1;
    startPos -= $pos.parent.child(startIndex).nodeSize;
  }
  while (endIndex < $pos.parent.childCount && link.isInSet($pos.parent.child(endIndex).marks)) {
    endPos += $pos.parent.child(endIndex).nodeSize;
    endIndex += 1;
  }
  return {
    from: startPos,
    to: endPos
  };
}

function markIsActive(state, type) {
  const {
    from,
    $from,
    to,
    empty
  } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marks());
  }
  return !!state.doc.rangeHasMark(from, to, type);
}

function nodeSelected(selection, type, attrs) {
  const attrKeys = Object.keys(attrs);
  const predicate = node => node.type === type;
  const node = prosemirrorUtils.findSelectedNodeOfType(type)(selection) || prosemirrorUtils.findParentNode(predicate)(selection);
  if (!attrKeys.length || !node) {
    return !!node;
  }
  if (!['paragraph', 'heading', 'blockquote', 'list_item', 'table_cell', 'table_header'].includes(type.name)) {
    return node.node.hasMarkup(type, {
      ...node.node.attrs,
      ...attrs
    });
  }
  const nodesAttrs = Object.entries(node.node.attrs).filter(([key]) => attrKeys.includes(key));
  return nodesAttrs.length && nodesAttrs.every(([key, value]) => attrs[key] === value);
}
function nodeIsActive({
  schema,
  selection
}, type, attrs = {}) {
  if (type.name !== 'alignment') {
    return nodeSelected(selection, type, attrs);
  }
  const {
    paragraph,
    heading,
    blockquote,
    list_item: listItem,
    table_cell: tableCell,
    table_header: tableHeader
  } = schema.nodes;
  return [paragraph, heading, blockquote, listItem, tableCell, tableHeader].some(node => nodeSelected(selection, node, attrs));
}

exports.getMarkAttrs = getMarkAttrs;
exports.getMarkRange = getMarkRange;
exports.getNodeAttrs = getNodeAttrs;
exports.markIsActive = markIsActive;
exports.nodeEqualsType = nodeEqualsType;
exports.nodeIsActive = nodeIsActive;


    /*!
    * tiptap-commands v1.14.6
    * (c) 2020 überdosis GbR (limited liability)
    * @license MIT
    */
  
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('prosemirror-commands'), require('prosemirror-schema-list'), require('prosemirror-inputrules'), require('prosemirror-state'), require('prosemirror-model'), require('tiptap-utils'), require('prosemirror-utils')) :
  typeof define === 'function' && define.amd ? define(['exports', 'prosemirror-commands', 'prosemirror-schema-list', 'prosemirror-inputrules', 'prosemirror-state', 'prosemirror-model', 'tiptap-utils', 'prosemirror-utils'], factory) :
  (global = global || self, factory(global.tiptapCommands = {}, global.prosemirrorCommands, global.prosemirrorSchemaList, global.prosemirrorInputrules, global.prosemirrorState, global.prosemirrorModel, global.tiptapUtils, global.prosemirrorUtils));
}(this, (function (exports, prosemirrorCommands, prosemirrorSchemaList, prosemirrorInputrules, prosemirrorState, prosemirrorModel, tiptapUtils, prosemirrorUtils) { 'use strict';

  function insertText (text = '') {
    return (state, dispatch) => {
      const {
        $from
      } = state.selection;
      const {
        pos
      } = $from.pos;
      dispatch(state.tr.insertText(text, pos));
      return true;
    };
  }

  function getMarksBetween(start, end, state) {
    let marks = [];
    state.doc.nodesBetween(start, end, (node, pos) => {
      marks = [...marks, ...node.marks.map(mark => ({
        start: pos,
        end: pos + node.nodeSize,
        mark
      }))];
    });
    return marks;
  }

  function markInputRule (regexp, markType, getAttrs) {
    return new prosemirrorInputrules.InputRule(regexp, (state, match, start, end) => {
      const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
      const {
        tr
      } = state;
      const m = match.length - 1;
      let markEnd = end;
      let markStart = start;

      if (match[m]) {
        const matchStart = start + match[0].indexOf(match[m - 1]);
        const matchEnd = matchStart + match[m - 1].length - 1;
        const textStart = matchStart + match[m - 1].lastIndexOf(match[m]);
        const textEnd = textStart + match[m].length;
        const excludedMarks = getMarksBetween(start, end, state).filter(item => {
          const {
            excluded
          } = item.mark.type;
          return excluded.find(type => type.name === markType.name);
        }).filter(item => item.end > matchStart);

        if (excludedMarks.length) {
          return false;
        }

        if (textEnd < matchEnd) {
          tr.delete(textEnd, matchEnd);
        }

        if (textStart > matchStart) {
          tr.delete(matchStart, textStart);
        }

        markStart = matchStart;
        markEnd = markStart + match[m].length;
      }

      tr.addMark(markStart, markEnd, markType.create(attrs));
      tr.removeStoredMark(markType);
      return tr;
    });
  }

  function nodeInputRule (regexp, type, getAttrs) {
    return new prosemirrorInputrules.InputRule(regexp, (state, match, start, end) => {
      const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
      const {
        tr
      } = state;

      if (match[0]) {
        tr.replaceWith(start - 1, end, type.create(attrs));
      }

      return tr;
    });
  }

  function pasteRule (regexp, type, getAttrs) {
    const handler = fragment => {
      const nodes = [];
      fragment.forEach(child => {
        if (child.isText) {
          const {
            text
          } = child;
          let pos = 0;
          let match;

          do {
            match = regexp.exec(text);

            if (match) {
              const start = match.index;
              const end = start + match[0].length;
              const attrs = getAttrs instanceof Function ? getAttrs(match[0]) : getAttrs;

              if (start > 0) {
                nodes.push(child.cut(pos, start));
              }

              nodes.push(child.cut(start, end).mark(type.create(attrs).addToSet(child.marks)));
              pos = end;
            }
          } while (match);

          if (pos < text.length) {
            nodes.push(child.cut(pos));
          }
        } else {
          nodes.push(child.copy(handler(child.content)));
        }
      });
      return prosemirrorModel.Fragment.fromArray(nodes);
    };

    return new prosemirrorState.Plugin({
      props: {
        transformPasted: slice => new prosemirrorModel.Slice(handler(slice.content), slice.openStart, slice.openEnd)
      }
    });
  }

  function markPasteRule (regexp, type, getAttrs) {
    const handler = (fragment, parent) => {
      const nodes = [];
      fragment.forEach(child => {
        if (child.isText) {
          const {
            text,
            marks
          } = child;
          let pos = 0;
          let match;
          const isLink = !!marks.filter(x => x.type.name === 'link')[0]; // eslint-disable-next-line

          while (!isLink && (match = regexp.exec(text)) !== null) {
            if (parent && parent.type.allowsMarkType(type) && match[1]) {
              const start = match.index;
              const end = start + match[0].length;
              const textStart = start + match[0].indexOf(match[1]);
              const textEnd = textStart + match[1].length;
              const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs; // adding text before markdown to nodes

              if (start > 0) {
                nodes.push(child.cut(pos, start));
              } // adding the markdown part to nodes


              nodes.push(child.cut(textStart, textEnd).mark(type.create(attrs).addToSet(child.marks)));
              pos = end;
            }
          } // adding rest of text to nodes


          if (pos < text.length) {
            nodes.push(child.cut(pos));
          }
        } else {
          nodes.push(child.copy(handler(child.content, child)));
        }
      });
      return prosemirrorModel.Fragment.fromArray(nodes);
    };

    return new prosemirrorState.Plugin({
      props: {
        transformPasted: slice => new prosemirrorModel.Slice(handler(slice.content), slice.openStart, slice.openEnd)
      }
    });
  }

  function removeMark (type) {
    return (state, dispatch) => {
      const {
        tr,
        selection
      } = state;
      let {
        from,
        to
      } = selection;
      const {
        $from,
        empty
      } = selection;

      if (empty) {
        const range = tiptapUtils.getMarkRange($from, type);
        from = range.from;
        to = range.to;
      }

      tr.removeMark(from, to, type);
      return dispatch(tr);
    };
  }

  function replaceText (range = null, type, attrs = {}) {
    return (state, dispatch) => {
      const {
        $from,
        $to
      } = state.selection;
      const index = $from.index();
      const from = range ? range.from : $from.pos;
      const to = range ? range.to : $to.pos;

      if (!$from.parent.canReplaceWith(index, index, type)) {
        return false;
      }

      if (dispatch) {
        dispatch(state.tr.replaceWith(from, to, type.create(attrs)));
      }

      return true;
    };
  }

  function setInlineBlockType (type, attrs = {}) {
    return (state, dispatch) => {
      const {
        $from
      } = state.selection;
      const index = $from.index();

      if (!$from.parent.canReplaceWith(index, index, type)) {
        return false;
      }

      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(type.create(attrs)));
      }

      return true;
    };
  }

  function dispatchTasks(tasks, align, selectionIsCell, tr, dispatch) {
    if (!tasks.length) {
      return false;
    }

    let transformation = tr;
    tasks.forEach(({
      cell,
      node,
      pos
    }) => {
      if (cell) {
        transformation = prosemirrorUtils.setCellAttrs(cell, {
          align
        })(transformation);
        return;
      }

      const attrs = { ...node.attrs,
        align: selectionIsCell ? align : null
      };
      transformation = transformation.setNodeMarkup(pos, node.type, attrs, node.marks);
    });

    if (dispatch) {
      dispatch(transformation);
    }

    return true;
  }

  function setTextAlignment(type, attrs = {}) {
    return (state, dispatch) => {
      const {
        doc,
        selection
      } = state;

      if (!selection || !doc) {
        return false;
      }

      const {
        paragraph,
        heading,
        blockquote,
        list_item: listItem,
        table_cell: tableCell,
        table_header: tableHeader
      } = state.schema.nodes;
      const {
        ranges
      } = selection;
      let {
        tr
      } = state;
      const selectionIsCell = prosemirrorUtils.isCellSelection(selection);
      const alignment = attrs.align || null; // If there is no text selected, or the text is within a single node

      if (selection.empty || ranges.length === 1 && ranges[0].$from.parent.eq(ranges[0].$to.parent) && !selectionIsCell) {
        const {
          depth,
          parent
        } = selection.$from;
        const predicateTypes = depth > 1 && tiptapUtils.nodeEqualsType({
          node: parent,
          types: paragraph
        }) ? [blockquote, listItem, tableCell, tableHeader] : parent.type;

        const predicate = node => tiptapUtils.nodeEqualsType({
          node,
          types: predicateTypes
        });

        const {
          pos,
          node: {
            type: nType,
            attrs: nAttrs,
            marks: nMarks
          }
        } = prosemirrorUtils.findParentNode(predicate)(selection);
        tr = tr.setNodeMarkup(pos, nType, { ...nAttrs,
          align: alignment
        }, nMarks);

        if (dispatch) {
          dispatch(tr);
        }

        return true;
      }

      const tasks = [];

      if (selectionIsCell) {
        const tableTypes = [tableHeader, tableCell];
        ranges.forEach(range => {
          const {
            $from: {
              parent: fromParent
            },
            $to: {
              parent: toParent
            }
          } = range;

          if (!fromParent.eq(toParent) || !range.$from.sameParent(range.$to) || !tiptapUtils.nodeEqualsType({
            node: fromParent,
            types: tableTypes
          }) || !tiptapUtils.nodeEqualsType({
            node: toParent,
            types: tableTypes
          })) {
            return;
          }

          if (fromParent.attrs.align !== alignment) {
            tasks.push({
              node: fromParent,
              pos: range.$from.pos,
              cell: prosemirrorUtils.findCellClosestToPos(range.$from)
            });
          }

          const predicate = ({
            align
          }) => typeof align !== 'undefined' && align !== null;

          prosemirrorUtils.findChildrenByAttr(fromParent, predicate, true).forEach(({
            node,
            pos
          }) => {
            if (!tiptapUtils.nodeEqualsType({
              node,
              types: [paragraph, heading, blockquote, listItem]
            })) {
              return;
            }

            tasks.push({
              node,
              pos: range.$from.pos + pos
            });
          });
        });
        return dispatchTasks(tasks, alignment, true, tr, dispatch);
      }

      doc.nodesBetween(selection.from, selection.to, (node, pos) => {
        if (!tiptapUtils.nodeEqualsType({
          node,
          types: [paragraph, heading, blockquote, listItem]
        })) {
          return true;
        }

        const align = node.attrs.align || null;

        if (align === alignment) {
          return true;
        }

        tasks.push({
          node,
          pos
        });
        return tiptapUtils.nodeEqualsType({
          node,
          types: [blockquote, listItem]
        });
      });
      return dispatchTasks(tasks, alignment, true, tr, dispatch);
    };
  }

  // see https://github.com/ProseMirror/prosemirror-transform/blob/main/src/structure.js
  // Since this piece of code was "borrowed" from prosemirror, ESLint rules are ignored.

  /* eslint-disable max-len, no-plusplus, no-undef, eqeqeq */

  function canSplit(doc, pos, depth = 1, typesAfter) {
    const $pos = doc.resolve(pos);
    const base = $pos.depth - depth;
    const innerType = typesAfter && typesAfter[typesAfter.length - 1] || $pos.parent;
    if (base < 0 || $pos.parent.type.spec.isolating || !$pos.parent.canReplace($pos.index(), $pos.parent.childCount) || !innerType.type.validContent($pos.parent.content.cutByIndex($pos.index(), $pos.parent.childCount))) return false;

    for (let d = $pos.depth - 1, i = depth - 2; d > base; d--, i--) {
      const node = $pos.node(d);
      const index = $pos.index(d);
      if (node.type.spec.isolating) return false;
      let rest = node.content.cutByIndex(index, node.childCount);
      const after = typesAfter && typesAfter[i] || node;
      if (after != node) rest = rest.replaceChild(0, after.type.create(after.attrs));
      /* Change starts from here */
      // if (!node.canReplace(index + 1, node.childCount) || !after.type.validContent(rest))
      //   return false

      if (!node.canReplace(index + 1, node.childCount)) return false;
      /* Change ends here */
    }

    const index = $pos.indexAfter(base);
    const baseType = typesAfter && typesAfter[0];
    return $pos.node(base).canReplaceWith(index, index, baseType ? baseType.type : $pos.node(base + 1).type);
  } // this is a copy of splitListItem
  // see https://github.com/ProseMirror/prosemirror-schema-list/blob/main/src/schema-list.js


  function splitToDefaultListItem(itemType) {
    return function (state, dispatch) {
      const {
        $from,
        $to,
        node
      } = state.selection;
      if (node && node.isBlock || $from.depth < 2 || !$from.sameParent($to)) return false;
      const grandParent = $from.node(-1);
      if (grandParent.type != itemType) return false;

      if ($from.parent.content.size == 0) {
        // In an empty block. If this is a nested list, the wrapping
        // list item should be split. Otherwise, bail out and let next
        // command handle lifting.
        if ($from.depth == 2 || $from.node(-3).type != itemType || $from.index(-2) != $from.node(-2).childCount - 1) return false;

        if (dispatch) {
          let wrap = prosemirrorModel.Fragment.empty;
          const keepItem = $from.index(-1) > 0; // Build a fragment containing empty versions of the structure
          // from the outer list item to the parent node of the cursor

          for (let d = $from.depth - (keepItem ? 1 : 2); d >= $from.depth - 3; d--) wrap = prosemirrorModel.Fragment.from($from.node(d).copy(wrap)); // Add a second list item with an empty default start node


          wrap = wrap.append(prosemirrorModel.Fragment.from(itemType.createAndFill()));
          const tr = state.tr.replace($from.before(keepItem ? null : -1), $from.after(-3), new prosemirrorModel.Slice(wrap, keepItem ? 3 : 2, 2));
          tr.setSelection(state.selection.constructor.near(tr.doc.resolve($from.pos + (keepItem ? 3 : 2))));
          dispatch(tr.scrollIntoView());
        }

        return true;
      }

      const nextType = $to.pos == $from.end() ? grandParent.contentMatchAt($from.indexAfter(-1)).defaultType : null;
      const tr = state.tr.delete($from.pos, $to.pos);
      /* Change starts from here */
      // let types = nextType && [null, {type: nextType}]

      let types = nextType && [{
        type: itemType
      }, {
        type: nextType
      }];
      if (!types) types = [{
        type: itemType
      }, null];
      /* Change ends here */

      if (!canSplit(tr.doc, $from.pos, 2, types)) return false;
      if (dispatch) dispatch(tr.split($from.pos, 2, types).scrollIntoView());
      return true;
    };
  }
  /* eslint-enable max-len, no-plusplus, no-undef, eqeqeq */

  function toggleBlockType(type, toggletype, attrs = {}) {
    return (state, dispatch, view) => {
      const isActive = tiptapUtils.nodeIsActive(state, type, attrs);
      const attributes = tiptapUtils.getNodeAttrs(state, type, attrs);

      if (isActive) {
        return prosemirrorCommands.setBlockType(toggletype, attributes)(state, dispatch, view);
      }

      return prosemirrorCommands.setBlockType(type, attributes)(state, dispatch, view);
    };
  }

  function isList(node, schema) {
    return node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list || node.type === schema.nodes.todo_list;
  }

  function toggleList(listType, itemType) {
    return (state, dispatch, view) => {
      const {
        schema,
        selection
      } = state;
      const {
        $from,
        $to
      } = selection;
      const range = $from.blockRange($to);

      if (!range) {
        return false;
      }

      const parentList = prosemirrorUtils.findParentNode(node => isList(node, schema))(selection);

      if (range.depth >= 1 && parentList && range.depth - parentList.depth <= 1) {
        if (parentList.node.type === listType) {
          return prosemirrorSchemaList.liftListItem(itemType)(state, dispatch, view);
        }

        if (isList(parentList.node, schema) && listType.validContent(parentList.node.content)) {
          const {
            tr
          } = state;
          tr.setNodeMarkup(parentList.pos, listType);

          if (dispatch) {
            dispatch(tr);
          }

          return false;
        }
      }

      return prosemirrorSchemaList.wrapInList(listType)(state, dispatch, view);
    };
  }

  function toggleWrap (type, attrs = {}) {
    return (state, dispatch, view) => {
      const isActive = tiptapUtils.nodeIsActive(state, type, attrs);

      if (isActive) {
        return prosemirrorCommands.lift(state, dispatch);
      }

      const attrs = tiptapUtils.getNodeAttrs(state, type);
      return prosemirrorCommands.wrapIn(type, attrs)(state, dispatch, view);
    };
  }

  function updateMark (type, attrs) {
    return (state, dispatch) => {
      const {
        tr,
        selection,
        doc
      } = state;
      let {
        from,
        to
      } = selection;
      const {
        $from,
        empty
      } = selection;

      if (empty) {
        const range = tiptapUtils.getMarkRange($from, type);
        from = range.from;
        to = range.to;
      }

      const hasMark = doc.rangeHasMark(from, to, type);

      if (hasMark) {
        tr.removeMark(from, to, type);
      }

      tr.addMark(from, to, type.create(attrs));
      return dispatch(tr);
    };
  }

  Object.defineProperty(exports, 'autoJoin', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.autoJoin;
    }
  });
  Object.defineProperty(exports, 'baseKeymap', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.baseKeymap;
    }
  });
  Object.defineProperty(exports, 'chainCommands', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.chainCommands;
    }
  });
  Object.defineProperty(exports, 'createParagraphNear', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.createParagraphNear;
    }
  });
  Object.defineProperty(exports, 'deleteSelection', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.deleteSelection;
    }
  });
  Object.defineProperty(exports, 'exitCode', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.exitCode;
    }
  });
  Object.defineProperty(exports, 'joinBackward', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.joinBackward;
    }
  });
  Object.defineProperty(exports, 'joinDown', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.joinDown;
    }
  });
  Object.defineProperty(exports, 'joinForward', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.joinForward;
    }
  });
  Object.defineProperty(exports, 'joinUp', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.joinUp;
    }
  });
  Object.defineProperty(exports, 'lift', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.lift;
    }
  });
  Object.defineProperty(exports, 'liftEmptyBlock', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.liftEmptyBlock;
    }
  });
  Object.defineProperty(exports, 'macBaseKeymap', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.macBaseKeymap;
    }
  });
  Object.defineProperty(exports, 'newlineInCode', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.newlineInCode;
    }
  });
  Object.defineProperty(exports, 'pcBaseKeymap', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.pcBaseKeymap;
    }
  });
  Object.defineProperty(exports, 'selectAll', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.selectAll;
    }
  });
  Object.defineProperty(exports, 'selectNodeBackward', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.selectNodeBackward;
    }
  });
  Object.defineProperty(exports, 'selectNodeForward', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.selectNodeForward;
    }
  });
  Object.defineProperty(exports, 'selectParentNode', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.selectParentNode;
    }
  });
  Object.defineProperty(exports, 'setBlockType', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.setBlockType;
    }
  });
  Object.defineProperty(exports, 'splitBlock', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.splitBlock;
    }
  });
  Object.defineProperty(exports, 'splitBlockKeepMarks', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.splitBlockKeepMarks;
    }
  });
  Object.defineProperty(exports, 'toggleMark', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.toggleMark;
    }
  });
  Object.defineProperty(exports, 'wrapIn', {
    enumerable: true,
    get: function () {
      return prosemirrorCommands.wrapIn;
    }
  });
  Object.defineProperty(exports, 'addListNodes', {
    enumerable: true,
    get: function () {
      return prosemirrorSchemaList.addListNodes;
    }
  });
  Object.defineProperty(exports, 'liftListItem', {
    enumerable: true,
    get: function () {
      return prosemirrorSchemaList.liftListItem;
    }
  });
  Object.defineProperty(exports, 'sinkListItem', {
    enumerable: true,
    get: function () {
      return prosemirrorSchemaList.sinkListItem;
    }
  });
  Object.defineProperty(exports, 'splitListItem', {
    enumerable: true,
    get: function () {
      return prosemirrorSchemaList.splitListItem;
    }
  });
  Object.defineProperty(exports, 'wrapInList', {
    enumerable: true,
    get: function () {
      return prosemirrorSchemaList.wrapInList;
    }
  });
  Object.defineProperty(exports, 'textblockTypeInputRule', {
    enumerable: true,
    get: function () {
      return prosemirrorInputrules.textblockTypeInputRule;
    }
  });
  Object.defineProperty(exports, 'wrappingInputRule', {
    enumerable: true,
    get: function () {
      return prosemirrorInputrules.wrappingInputRule;
    }
  });
  exports.insertText = insertText;
  exports.markInputRule = markInputRule;
  exports.markPasteRule = markPasteRule;
  exports.nodeInputRule = nodeInputRule;
  exports.pasteRule = pasteRule;
  exports.removeMark = removeMark;
  exports.replaceText = replaceText;
  exports.setInlineBlockType = setInlineBlockType;
  exports.setTextAlignment = setTextAlignment;
  exports.splitToDefaultListItem = splitToDefaultListItem;
  exports.toggleBlockType = toggleBlockType;
  exports.toggleList = toggleList;
  exports.toggleWrap = toggleWrap;
  exports.updateMark = updateMark;

  Object.defineProperty(exports, '__esModule', { value: true });

})));

import stylesheet from './stylesheet';
import {registerNodeType} from './nodetype';
import NodeAttr from './attr';
import {inheritAttributes} from './utils';

const _eventHandlers = Symbol('eventHandlers'),
  _collisionState = Symbol('collisionState'),
  _data = Symbol('data'),
  _mouseCapture = Symbol('mouseCapture');

const _attr = Symbol('attr'),
  _style = Symbol('style');

export default class BaseNode {
  static Attr = NodeAttr;

  static inheritAttributes = inheritAttributes;

  constructor(attrs) {
    this[_eventHandlers] = {};
    this[_data] = {};
    this[_style] = {};
    this[_attr] = new this.constructor.Attr(this);
    if(attrs) {
      this.attr(attrs);
    }
  }

  serialize() {
    const nodeType = this.nodeType,
      attrs = this[_attr].serialize(),
      dataset = JSON.stringify(this.dataset),
      id = this.id;

    return {
      nodeType,
      attrs,
      dataset,
      id,
    };
  }

  clearLayout() {
    if(this.hasLayout) {
      this.parent.clearLayout();
    }
  }

  merge(attrs) {
    this[_attr].merge(attrs);
  }

  cloneNode() {
    const node = new this.constructor();
    node.merge(this[_attr].serialize());
    node.data(this.dataset);
    const bgimage = this.attr('bgimage');
    if(bgimage && bgimage.image) {
      node.attr('bgimage', null);
      node.attr('bgimage', Object.assign({}, bgimage));
    }
    return node;
  }

  attr(props, val) {
    const setVal = (key, value) => {
      if(!this[_attr].__attributeNames.has(key) && !(key in this[_attr])) {
        Object.defineProperty(this[_attr], key, {
          // enumerable: true,
          configurable: true,
          set(value) {
            const subject = this.subject;
            this.quietSet(key, value);
            // fixed color inherit
            if(key === 'color' && !this.__attributeNames.has('fillColor')) {
              subject.attr('fillColor', value);
            }
            // fixed font inherit
            if((key === 'fontSize'
              || key === 'fontFamily'
              || key === 'fontStyle'
              || key === 'fontVariant'
              || key === 'fontWeight') && !this.__attributeNames.has('font')) {
              const parseFont = require('./helpers/parse-font');
              const font = this.get('font') || 'normal normal normal 16px Arial';
              const parsed = parseFont(font);
              parsed.fontSize = parsed.size + parsed.unit;
              if(key === 'fontSize' && (typeof value === 'number' || /[\d.]$/.test(value))) {
                value += 'px';
              }
              parsed[key] = value;
              const {style, variant, weight, family, fontSize} = parseFont(font);
              subject.attr('font', `${style} ${variant} ${weight} ${fontSize} ${family}`);
            }
            if(key === 'font'
              || key === 'lineHeight'
              || key === 'lineBreak'
              || key === 'wordBreak'
              || key === 'letterSpacing'
              || key === 'textIndent') {
              const children = subject.querySelectorAll('*');
              children.forEach((node) => {
                if(node.retypesetting) node.retypesetting();
              });
            }
            if(inheritAttributes.has(key)) {
              subject.forceUpdate();
            }
          },
          get() {
            return this.get(key);
          },
        });
      }
      this[_attr][key] = value;
      // if(stylesheet.relatedAttributes.has(key)) {
      //   this.updateStyles();
      // }
    };
    if(typeof props === 'object') {
      Object.entries(props).forEach(([prop, value]) => {
        this.attr(prop, value);
      });
      return this;
    } if(typeof props === 'string') {
      if(val !== undefined) {
        if(props === 'attrs') {
          if(Array.isArray(val)) {
            val = Object.assign({}, ...val);
          }
          Object.entries(val).forEach(([prop, value]) => {
            this.attr(prop, value);
          });
          return this;
        }
        if(props === 'style') {
          if(Array.isArray(val)) {
            val = Object.assign({}, ...val);
          }
          Object.entries(val).forEach(([prop, value]) => {
            this.style[prop] = value;
          });
          return this;
        }
        if(typeof val === 'function') {
          val = val(this.attr(props));
        }
        if(val && typeof val.then === 'function') {
          return val.then((res) => {
            setVal(props, res);
          });
        }
        setVal(props, val);
        return this;
      }
      return props in this[_attr] ? this[_attr][props] : this[_attr].get(props);
    }

    return this[_attr].attrs;
  }

  get __attr() {
    return this[_attr];
  }

  get attributes() {
    if(typeof Proxy === 'function') {
      try {
        return new Proxy(this[_attr], {
          get(target, prop) {
            return prop in target ? target[prop] : target.get(prop);
          },
          set(target, prop, value) {
            if(typeof prop !== 'string' || /^__/.test(prop)) target[prop] = value;
            else target.subject.attr(prop, value);
            return true;
          },
          deleteProperty(target, prop) {
            if(typeof prop !== 'string' || /^__/.test(prop)) delete target[prop];
            else target.subject.attr(prop, null);
            return true;
          },
        });
      } catch (ex) {
        return this[_attr];
      }
    }
    return this[_attr];
  }

  get style() {
    if(typeof Proxy === 'function') {
      try {
        return new Proxy(this[_attr], {
          get(target, prop) {
            if(prop !== 'id' && prop !== 'name' && prop !== 'class'
              && target.__attributeNames.has(prop)
              || inheritAttributes.has(prop)) {
              return target[prop];
            }
            return target.subject[_style][prop];
          },
          set(target, prop, value) {
            if(prop !== 'id' && prop !== 'name' && prop !== 'class'
              && target.__attributeNames.has(prop)
              || inheritAttributes.has(prop)) {
              target.subject.attr(prop, value);
            } else {
              target.subject[_style][prop] = value;
            }
            return true;
          },
          deleteProperty(target, prop) {
            if(prop !== 'id' && prop !== 'name' && prop !== 'class'
              && target.__attributeNames.has(prop)
              || inheritAttributes.has(prop)) {
              target.subject.attr(prop, null);
            } else {
              delete target.subject[_style][prop];
            }
            return true;
          },
        });
      } catch (ex) {
        return this[_attr];
      }
    }
    return this[_attr];
  }

  forceUpdate() {
    const parent = this.parent;
    if(parent) {
      this.parent.update(this);
    }
  }

  draw() {
    const styleNeedUpdate = this.__styleNeedUpdate;
    if(styleNeedUpdate) {
      stylesheet.computeStyle(this);
      if(this.querySelectorAll) {
        const children = this.querySelectorAll('*');
        children.forEach(child => stylesheet.computeStyle(child));
      }
      if(styleNeedUpdate === 'siblings') {
        if(this.parent) {
          const children = this.parent.children;
          const index = children.indexOf(this);
          const len = children.length;
          for(let i = index + 1; i < len; i++) {
            const node = children[i];
            stylesheet.computeStyle(node);
            if(node.querySelectorAll) {
              const nodes = node.querySelectorAll('*');
              nodes.forEach(child => stylesheet.computeStyle(child));
            }
          }
        }
      }
    }
  }

  get layer() {
    return this.parent && this.parent.layer;
  }

  data(props, val) {
    const setVal = (key, value) => {
      this[_data][key] = value;
      if(this.attr) {
        const attrKey = `data-${key}`;
        // this.attr(attrKey, value);
        if(stylesheet.relatedAttributes.has(attrKey)) {
          this.updateStyles();
        }
      }
      if(value == null) {
        delete this[_data][key];
      }
    };
    if(typeof props === 'object') {
      Object.entries(props).forEach(([prop, value]) => {
        this.data(prop, value);
      });
      return this;
    } if(typeof props === 'string') {
      if(val !== undefined) {
        if(typeof val === 'function') {
          val = val(this[_data][props]);
        }
        if(val && typeof val.then === 'function') {
          return val.then((res) => {
            setVal(props, res);
          });
        }
        setVal(props, val);
        return this;
      }
      return this[_data][props];
    }
    return this[_data];
  }

  updateStyles(nextSibling = false) {
    // append to parent & reset name or class or id auto updateStyles
    this.__styleNeedUpdate = nextSibling ? 'siblings' : 'children';
    this.forceUpdate();
  }

  get dataset() {
    return this[_data];
  }

  getEventHandlers(type) {
    return type != null ? this[_eventHandlers][type] || [] : this[_eventHandlers];
  }

  on(type, handler) {
    if(Array.isArray(type)) {
      type.forEach(t => this.on(t, handler));
    } else {
      this[_eventHandlers][type] = this[_eventHandlers][type] || [];
      this[_eventHandlers][type].push(handler);
    }
    return this;
  }

  once(type, handler) {
    if(Array.isArray(type)) {
      type.forEach(t => this.once(t, handler));
    } else {
      this.on(type, function f(...args) {
        this.off(type, f);
        return handler.apply(this, args);
      });
    }
    return this;
  }

  off(type, handler) {
    if(Array.isArray(type)) {
      type.forEach(t => this.off(t, handler));
    } else if(handler && this[_eventHandlers][type]) {
      const idx = this[_eventHandlers][type].indexOf(handler);

      if(idx >= 0) {
        this[_eventHandlers][type].splice(idx, 1);
      }
    } else {
      delete this[_eventHandlers][type];
    }
    return this;
  }

  // d3-friendly
  addEventListener(type, handler) {
    return this.on(type, handler);
  }

  removeEventListener(type, handler) {
    return this.off(type, handler);
  }

  remove(exit = true) {
    if(!this.parent) return null;
    return this.parent.removeChild(this, exit);
  }

  pointCollision(evt) {
    throw Error('you mast override this method');
  }

  setMouseCapture() {
    this[_mouseCapture] = true;
  }

  releaseMouseCapture() {
    this[_mouseCapture] = false;
  }

  isCaptured(evt) {
    return (evt.type === 'mousemove' || evt.type === 'mousedown' || evt.type === 'mouseup') && this[_mouseCapture];
  }

  dispatchEvent(type, evt, collisionState = false, swallow = false) { // eslint-disable-line complexity
    const handlers = this.getEventHandlers(type);
    evt.returnValue = true;
    if(swallow && handlers.length === 0) {
      return;
    }
    if(!evt.stopDispatch) {
      evt.stopDispatch = () => {
        evt.terminated = true;
      };
    }
    if(!evt.stopPropagation) {
      evt.stopPropagation = () => {
        evt.cancelBubble = true;
      };
    }
    if(!evt.preventDefault) {
      evt.preventDefault = () => {
        evt.returnValue = false;
      };
    }
    if(evt.type !== type) {
      if(evt.type) {
        evt.originalType = evt.type;
      }
      evt.type = type;
    }

    let isCollision = collisionState || this.pointCollision(evt);
    const captured = this.isCaptured(evt);

    if(this[_collisionState] && type === 'mouseleave') {
      // dispatched from group
      evt.target = this;
      this[_collisionState] = false;
      isCollision = true;
      this.attr('__internal_state_hover_', null);
    }

    if(!evt.terminated && (isCollision || captured)) {
      if(!evt.target) evt.target = this;

      const changedTouches = evt.originalEvent && evt.originalEvent.changedTouches;
      if(changedTouches) {
        if(type === 'touchstart') {
          const touch = changedTouches[0],
            layer = this.layer;
          if(touch && touch.identifier != null) {
            layer.touchedTargets[touch.identifier] = layer.touchedTargets[touch.identifier] || [];
            layer.touchedTargets[touch.identifier].push(this);
          }
        }
        if(/^touch/.test(type)) {
          const touches = Array.from(evt.originalEvent.touches),
            layer = this.layer;
          evt.targetTouches = [];

          touches.forEach((touch) => {
            const identifier = touch.identifier;
            if(layer.touchedTargets[identifier] && layer.touchedTargets[identifier].indexOf(this) >= 0) {
              evt.targetTouches.push(touch);
            }
          });
          evt.touches = touches;
          evt.changedTouches = Array.from(changedTouches);
        }
      }

      if(type === 'mousedown' || type === 'touchstart') {
        this.attr('__internal_state_active_', 'active');
      } else if(type === 'mouseup' || type === 'touchend') {
        this.attr('__internal_state_active_', null);
      }

      [...handlers].forEach(handler => handler.call(this, evt));

      if(!this[_collisionState] && isCollision && type === 'mousemove') {
        const _evt = Object.assign({}, evt);
        _evt.type = 'mouseenter';
        delete _evt.target;
        _evt.terminated = false;
        this.dispatchEvent('mouseenter', _evt, true, true);
        this.attr('__internal_state_hover_', 'hover');
        this[_collisionState] = true;
      }
    }

    if(this[_collisionState] && !isCollision && type === 'mousemove') {
      const _evt = Object.assign({}, evt);
      _evt.type = 'mouseleave';
      delete _evt.target;
      _evt.terminated = false;
      this.dispatchEvent('mouseleave', _evt);
      this.attr('__internal_state_hover_', null);
      // this[_collisionState] = false;
    }

    return isCollision;
  }

  get parentNode() {
    return this.parent;
  }

  getNodeNearBy(distance = 1, isElement = false) {
    if(!this.parent) return null;
    if(distance === 0) return this;
    const children = isElement ? this.parent.children : this.parent.childNodes;
    const idx = children.indexOf(this);
    return children[idx + distance];
  }

  get nextSibling() {
    return this.getNodeNearBy(1);
  }

  get previousSibling() {
    return this.getNodeNearBy(-1);
  }

  get nextElementSibling() {
    return this.getNodeNearBy(1, true);
  }

  get previousElementSibling() {
    return this.getNodeNearBy(-1, true);
  }

  contains(node) {
    while(node && this !== node) {
      node = node.parent;
    }
    return !!node;
  }

  // called when layer appendChild
  connect(parent, zOrder = 0) {
    if(this.parent) {
      // throw new Error('This node belongs to another parent node! Remove it first...')
      this.remove();
    }

    Object.defineProperty(this, 'zOrder', {
      value: zOrder,
      writable: false,
      configurable: true,
    });

    Object.defineProperty(this, 'parent', {
      get: () => parent,
      configurable: true,
    });

    this.dispatchEvent('append', {
      parent,
      zOrder,
    }, true, true);

    parent.dispatchEvent('appendChild', {
      child: this,
      zOrder,
    }, true, true);

    if(this.layer) {
      this.updateStyles(true);
    }

    return this;
  }

  // override to recycling resources
  disconnect(parent) {
    if(!this.parent || parent !== this.parent) {
      throw new Error('Invalid node to disconnect');
    }

    if(this.layer) {
      const nextSibling = this.nextElementSilbing;
      if(nextSibling) nextSibling.updateStyles(true);
    }

    const zOrder = this.zOrder;
    delete this.zOrder;
    delete this.parent;
    delete this.isDirty;

    this.dispatchEvent('remove', {
      parent,
      zOrder,
    }, true, true);

    parent.dispatchEvent('removeChild', {
      child: this,
      zOrder,
    }, true, true);

    return this;
  }

  enter() {
    // override to do atction after connection, can return a promise
    return this;
  }

  exit() {
    // override to do atction before disconnection, can return a promise
    return this;
  }

  getAttribute(prop) {
    /* istanbul ignore next */
    return this.attr(prop);
  }

  setAttribute(prop, val) {
    /* istanbul ignore next */
    return this.attr(prop, val);
  }

  removeAttribute(prop) {
    /* istanbul ignore next */
    return this.attr(prop, null);
  }

  set id(val) {
    this.attr('id', val);
  }

  get id() {
    return this.attr('id');
  }

  set name(val) {
    this.attr('name', val);
  }

  get name() {
    return this.attr('name');
  }

  set className(val) {
    this.attr('class', val);
  }

  get className() {
    return this.attr('class');
  }
}

registerNodeType('node', BaseNode, true);

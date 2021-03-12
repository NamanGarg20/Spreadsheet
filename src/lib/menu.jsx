// -*- mode: rjsx-mode; -*-

import React  from 'react';
import ReactDom from 'react-dom';

/** Show menu specified by menuSpec at coordinates where Event ev
 *  occurred.
 *
 *  menuSpec must be an object, having a required property menuItems
 *  which must specify a list of menu items.  Each menu item must be
 *  an object with the following optional properties:
 *
 *    menuLabel:      text describing the menu item.
 *    menuItemFn:     a function to call if the menu item is selected.
 *    menuItemFnArgs: a list of arguments sent to menuItemFn().
 *
 *  Note that if a menu-item does not have a menuItemFn then it
 *  is regarded as inactive, and interactions with it are not possible.
 *
 *  At both the menuSpec and menu-item level, any properties with
 *  names not starting with the prefix "menu" are sent over to
 *  the generated HTML; this makes it possible to specify,
 *  among other things, class-names.
 */
export default function showMenu(ev, menuSpec=TEST) {
  const menuId = "544-menu";
  const { pageX: x, pageY: y } = ev;
  const menu = <Menu x={x} y={y} menu={menuSpec}/>;
  const oldDiv = document.getElementById(menuId);
  if (oldDiv) oldDiv.remove();
  const  menuDiv = document.createElement('div');
  menuDiv.id = menuId;
  document.body.appendChild(menuDiv);
  ReactDom.render(menu, menuDiv);
}

//all internal prop names start with this prefix
const ATTR_PREFIX = 'menu';
const MENU_CLASS = 'menu';
const MENU_ITEM_CLASS = 'menu-item';
const MENU_ITEM_INACTIVE_CLASS = 'menu-item-disabled';

class MenuItem extends React.Component {

  constructor(props) {
    super(props);

    this.clickHandler = this.clickHandler.bind(this);
  }

  clickHandler() {
    this.props.menuSelect();
    this.props.menuItem.menuItemFn?.(...(this.props.menuItemFnArgs ?? []));
  }

  render() {
    const item = this.props.menuItem;
    let className = MENU_ITEM_CLASS;
    if (!item.menuItemFn) className += ' ' + MENU_ITEM_INACTIVE_CLASS;
    const htmlAttr = mergeHtmlAttr(item, { className });
    return (
      <div {...htmlAttr} onClick={this.clickHandler}>
        {item.menuLabel ?? ''}
      </div>
    );
  }
}

class Menu extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      index: 0,
      isVisible: true,
      top: '0px', left: '0px',
    };
    this.myRef = React.createRef();

    this.outsideClickHandler = this.outsideClickHandler.bind(this);
    this.selectItem = this.selectItem.bind(this);
  }

  componentDidMount() {
    document.addEventListener('click', this.outsideClickHandler, true);
    this.setMenuPosition();
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.outsideClickHandler, true);
  }

  selectItem() {
    this.setState({isVisible: false,});
  }



  outsideClickHandler(event) {
    const domNode = ReactDom.findDOMNode(this);
    if (!domNode || !domNode.contains(event.target)) {
      this.setState({isVisible: false,});
    }
  }

  setMenuPosition() {
    let { x, y } = this.props;
    const { innerWidth, innerHeight } = window;
    const rect = this.myRef.current.getBoundingClientRect();
    if (y + rect.height > innerHeight) y -= rect.height;
    this.setState({
      top: `${y}px`,
      left: `${x}px`,
    });
  }

  render() {
    const { isVisible, top, left }= this.state;
    if (!isVisible) return '';
    const menu = this.props.menu;
    const items = menu.menuItems;
    const style = { position: 'absolute', top, left, };
    const defaultHtmlAttr = { className: MENU_CLASS, style };
    const htmlAttr = mergeHtmlAttr(this.props, defaultHtmlAttr);
    const itemFn = (item, i) => (
      <MenuItem key={i} menuSelect={this.selectItem} menuIndex={i}
                menuItem={item}/>
    );
    return (
      <div {...htmlAttr} ref={this.myRef}>
        { items.map(itemFn) }
      </div>
    );
  }
}

function mergeHtmlAttr(props, defaults) {
  const htmlAttr = {...defaults };
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith(ATTR_PREFIX)) continue;
    if (htmlAttr[k]) {
      if (k === 'className') {
        htmlAttr[k] += ` ${v}`;
        continue;
      }
      else if (k === 'style') {
        htmlAttr[k] = Object.assign({}, htmlAttr[k], v);
        continue;
      }
    }
    htmlAttr[k] = v;
  }
  return htmlAttr;
}

const TEST = {
  menuItems: [
    { menuLabel: 'Hello', },
    { menuLabel: 'Bad', menuItemFn() { console.log('hello');}, },
    { menuLabel: 'World', },
  ],
};

export function TestMenu() {
  return (
    <Menu menu={TEST}/>
  );
}

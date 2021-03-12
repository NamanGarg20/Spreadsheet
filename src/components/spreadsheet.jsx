//-*- mode: rjsx-mode;

import {indexToRowSpec, indexToColSpec} from './util.mjs';
import popupMenu from '../lib/menu.jsx';
import SingleInput from './single-input.jsx';

import React from 'react';
import ReactDom from 'react-dom';


/************************ Spreadsheet Component ************************/

const [ N_ROWS, N_COLS ] = [ 10, 10 ];
const ROW_HDRS = Array.from({length: N_ROWS}).map((_, i) => indexToRowSpec(i));
const COL_HDRS = Array.from({length: N_COLS}).
  map((_, i) => indexToColSpec(i).toUpperCase());

export default class Spreadsheet extends React.Component {

  constructor(props) {
    super(props);
    const handlers = [
      'update', 'focusCell', 'clearMenu', 'dataMenu',
    ];
    for (const k of handlers) {
      this[k] = this[k].bind(this);
    }

    this.state = {
      ssAge: 0,
      cellId: '',
      copyCellId: '',
      error: '',
    };
  }

  clearMenu(ev) {
    ev.preventDefault();
    const clear = async () => {
      await this.props.spreadsheet.clear();
      this.age();
    };
    this.setState({error: ''});
    popupMenu(ev, { menuItems: [
      { menuLabel: 'Clear', menuItemFn: clear },
    ]});
  }

  dataMenu(cellId) {
    const ss = this.props.spreadsheet;
    const formula = ss.query(cellId)?.formula;
    const copy = formula && (() => {
      this.setState({copyCellId: cellId});
      this.age();
    });
    const paste = this.state.copyCellId && (async () => {
      try {
        await ss.copy(cellId, this.state.copyCellId);
        this.age();
      }
      catch (err) {
        this.setState({error: err.message});
      }
    });
    const del = formula && (async () => {
      await ss.delete(cellId);
      this.age();
    });
    const id = cellId.toUpperCase();
    const copyLabel = (copy) ? `Copy ${id}` : `Copy`;
    const deleteLabel = (del) ? `Delete ${id}` : `Delete`;
    const pasteLabel =
          (paste) ? `Paste ${this.state.copyCellId.toUpperCase()} to ${id}`
                  : `Paste`;
    const menu = {
      menuItems: [
        { menuLabel: copyLabel, menuItemFn: copy, },
        { menuLabel: deleteLabel, menuItemFn: del, },
        { menuLabel: pasteLabel, menuItemFn: paste },
      ],
    };
    return ev => {
      ev.preventDefault();
      this.setState({error: ''});
      popupMenu(ev, menu);
    };
  }


  age() {
    this.setState(({ssAge}) => ({ssAge: ssAge + 1 }));
  }

  async update(formula) {
    await this.props.spreadsheet.eval(this.state.cellId, formula);
    this.setState({error: ''});
    this.age();
  }

  focusCell(ev) {
    if (ev.currentTarget === ev.target) {
      const cellId = ev.target.getAttribute('data-cellid');
      this.setState({cellId, error: ''});
    }
  }


  render() {
    const { spreadsheet } = this.props;
    const { cellId, } = this.state;
    const ssName = spreadsheet.name;
    const valueFormulas = spreadsheet.valueFormulas();
    const formula = (cellId && valueFormulas[cellId]?.formula) || '';
    const data = ROW_HDRS.map(row => COL_HDRS.map(col => {
      const id = `${col}${row}`.toLowerCase();
      let klass = (id === cellId) ? 'focused' : '';
      if (id === this.state.copyCellId) klass += ' copied';
      const dataMenuFn = this.dataMenu(id);
      return { cellId: id, dataMenuFn, klass, ...valueFormulas[id]  };
    }));
    const dataElements =
          data.map((row, i) => row.map((d, j) =>
                                 <SSCell key={j}
                                         cellId={d.cellId}
                                         formula={d.formula ?? '' }
                                         value={d.value ?? ''}
                                         onContextMenu={d.dataMenuFn}
                                         onFocus={this.focusCell}
                                         className={d.klass}
                                         tabIndex={i*N_COLS + j + 1}/>
                                      ));
    const focusedId = cellId ? cellId.toUpperCase() : '';
    return (
      <>
        <SingleInput label={focusedId} id={cellId} value={formula}
                   update={this.update}/>
        <table className="ss">
          <thead>
            <tr>
              <th onContextMenu={this.clearMenu}>
                {ssName}
              </th>
              {COL_HDRS.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {dataElements.map((dataRow, i) =>
                              <tr key={i}><th>{ROW_HDRS[i]}</th>{dataRow}</tr>)
            }
          </tbody>
        </table>
        <div className="error">{this.state.error}</div>
      </>
    );
  }

}

function SSCell(props) {
  const { cellId, formula, value, onContextMenu, onFocus,
          className, tabIndex } = props;
  return (
    <td onContextMenu={onContextMenu}
        data-cellid={cellId}
        onFocus={onFocus}
        className={className}
        tabIndex={tabIndex}
        title={formula ?? ''}>
      {value ?? ''}
    </td>
  );
}

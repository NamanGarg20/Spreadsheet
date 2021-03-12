import parse from './expr-parser.mjs';
import AppError from './app-error.mjs';
import { cellRefToCellId } from './util.mjs';


/**
 * User errors are reported by throwing a suitable AppError object
 * having a suitable message property and code property set as
 * follows:
 *
 *  `SYNTAX`: for a syntax error.
 *  `CIRCULAR_REF` for a circular reference.
 */

// names of private (not to be used outside this class) methods/properties 
// start with an '_'.
export default class Spreadsheet {

  static async make(name, store=null) {
    const ss = new Spreadsheet(name, store);
    if (store) {
      for (const [cellId, formula] of await store.readFormulas(name)) {
	await ss.eval(cellId, formula, false);
      }
    }
    return ss;
  }

  constructor(name, store=null) {
    this.name = name;
    this._store = store;
    this._cells = {};  //map from cellIds to CellInfo objects
    this._undos = {};  //map from cellIds to previous this._cells[cellId]
  }
  
  /** Set cell with id baseCellId to result of evaluating string
   *  formula.  Update all cells which are directly or indirectly
   *  dependent on the base cell.  Return an object mapping the id's
   *  of all dependent cells to their updated values.  
   */
    async eval(baseCellId, formula, updateStore=true) {
    try {
      this._undos = {};
      const cellId = cellRefToCellId(baseCellId);
      const oldAst = this._cells[cellId]?.ast;
      const ast = parse(formula, cellId);
      const cell = this._updateCell(cellId, cell => cell.ast = ast);
      if (oldAst) this._removeAsDependent(cellId, oldAst);
      const updates = this._evalCell(cell, new Set());
      if (this._store && updateStore) {
	await this._store.updateCell(this.name, cellId, formula);
      }
      return updates;
    }
    catch (err) {
      this._undo();
      throw err;
    }
  }

  /** return object containing formula and value for cell cellId 
   *  return { value: 0, formula: '' } for an empty cell.
   */
  query(cellId) {
    cellId = cellId.toLowerCase();
    const cell = this._cells[cellId];
    return { value: cell?.value ?? 0, formula: cell?.formula ?? '', };
  }

  /** Clear contents of this spreadsheet. No undo information recorded. */
  async clear() {
    if (this._store) await this._store.clear(this.name);
    this._undos = {};
    this._cells = {};
  }

  /** Delete all info for cellId from this spreadsheet. Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.  
   */
  async delete(cellId) {
    cellId = cellId.toLowerCase();
    this._undos = {};
    const results = {};
    if (this._cells[cellId]) {
      const dependents = this._cells[cellId].dependents;
      this._updateCell(cellId, cell => delete this._cells[cell.id]);;      
      for (const dependent of dependents) {
	const formula = this._cells[dependent].formula
	Object.assign(results, await this.eval(dependent, formula));
      }
    }
    if (this._store) await this._store.delete(this.name, cellId);
    return results;
  }

  /** copy formula from srcCellId to destCellId, adjusting any
   *  relative cell references suitably.  Return an object mapping the
   *  id's of all dependent cells to their updated values. Copying
   *  an empty cell is equivalent to deleting the destination cell.
   */
  async copy(destCellId, srcCellId) {
    destCellId = destCellId.toLowerCase();
    srcCellId = srcCellId.toLowerCase();
    this._undos = {};
    const srcCell = this._cells[srcCellId];
    if (!srcCell?.formula) {
      return await this.delete(destCellId);
    }
    else {
      let destFormula;
      try {
	destFormula = srcCell.ast.toString(destCellId);
      }
      catch (err) {
	if (err instanceof AppError && err.code == 'SYNTAX') {
	  const srcFormula = srcCell.ast.toString(srcCellId);
	  const msg = `cannot copy formula ${srcFormula} to ${destCellId}: `;
	  throw new AppError('SYNTAX', msg + err.message);
	}
	else {
	  throw err;
	}
      }
      return await this.eval(destCellId, destFormula);
    }
  }

  /** Return dump of cell values as list of cellId and formula pairs.
   *  Do not include any cell's with empty formula.
   *
   *  Returned list must be sorted by cellId with primary order being
   *  topological (cell A < cell B when B depends on A) and secondary
   *  order being lexicographical (when cells have no dependency
   *  relation). 
   *
   *  Specifically, the cells must be dumped in a non-decreasing depth
   *  order:
   *     
   *    + The depth of a cell with no dependencies is 0.
   *
   *    + The depth of a cell C with direct prerequisite cells
   *      C1, ..., Cn is max(depth(C1), .... depth(Cn)) + 1.
   *
   *  Cells having the same depth must be sorted in lexicographic order
   *  by their IDs.
   *
   *  Note that empty cells must be ignored during the topological
   *  sort.
   */
  dump() {
    const prereqs = this._makePrereqs();
    const allCellIds = Object.keys(prereqs);
    const nCells = allCellIds.length;
    let cellIds0 =
	  allCellIds.
	  filter(id => prereqs[id].length === 0).
	  sort();
    const sortedIds = [];
    const doneIds = new Set();
    while (sortedIds.length < nCells) {
      let cellIds1 = [];
      for (const cellId of cellIds0) {
	doneIds.add(cellId);
	sortedIds.push(cellId);
	console.assert(this._cells[cellId]);
	for (const dependentId of this._cells[cellId].dependents) {
	  if (prereqs[dependentId]) {
	    console.assert(this._cells[cellId]);
	    const dependentCell = this._cells[dependentId];
	    let hasPrereqs = true;
	    for (const prereq of prereqs[dependentId]) {
	      if (!doneIds.has(prereq)) { hasPrereqs = false; break; }
	    }
	    if (hasPrereqs) cellIds1.push(dependentId);
	  }
	} //for (const dependentId...)
      } //for (const cellId of cellIds0)
      cellIds0 = cellIds1.sort();
    } //while
    return sortedIds.map(id => [ id, this._cells[id].formula ]);
  }

  /** Return object mapping cellId's to objects containing 
   *  their value and formula. If cellIdValuePairs is specified
   *  only return mapping for those cellId's.
   *
   *  [This fixes a bug in the API for the other functions which return
   *  only cellId-value or cellId-formula pairs.]
   */
  valueFormulas(cellIdValuePairs=null) {
    if (cellIdValuePairs === null) cellIdValuePairs = this.dump();
    const pairValue = ([cellId, _]) => [cellId, this.query(cellId) ];
    return Object.fromEntries(cellIdValuePairs.map(pairValue));
  }

  /** undo all changes since last operation */
  _undo() {
    for (const [k, v] of Object.entries(this._undos)) {
      if (v) {
	this._cells[k] = v;
      }
      else {
	delete this._cells[k];
      }
    }
  }

  /** Return object mapping cellId to list containing prerequisites
   *  for cellId for all non-empty cells.
   */
  _makePrereqs() {
    const prereqCells =
       Object.values(this._cells).filter(cell => !cell.isEmpty());
    const prereqs = Object.fromEntries(prereqCells.map(c => [c.id, []]));
    for (const cell of prereqCells) {
      for (const d of cell.dependents) {
	if (prereqs[d]) prereqs[d].push(cell.id);
      }
    }
    return prereqs;
  }
 
  // must update all cells using only this function to guarantee
  // recording undo information.
  _updateCell(cellId, updateFn) {
    if (!(cellId in this._undos)) {
      this._undos[cellId] = this._cells[cellId]?.copy();
    }
    const cell =
      this._cells[cellId] ?? (this._cells[cellId] = new CellInfo(cellId));
    updateFn(cell);
    return cell;
  }

  _evalCell(cell, working) {
    const value = this._evalAst(cell.id, cell.ast);
    this._updateCell(cell.id, cell => cell.value = value);
    const vals = { [cell.id]: value };
    working.add(cell.id);
    for (const dependent of cell.dependents) {
      if (working.has(dependent)) {
	const msg = `circular ref involving ${dependent}`;
	throw new AppError('CIRCULAR_REF', msg);
      }
      const depCell = this._cells[dependent];
      Object.assign(vals, this._evalCell(depCell, working));
    }
    working.delete(cell.id);
    return vals;
  }

  _evalAst(baseCellId, ast) {
    if (ast === null) {
      return 0;
    }
    else if (ast.type === 'num') {
      return ast.value;
    }
    else if (ast.type === 'ref') {
      const cellId = cellRefToCellId(ast.toString(baseCellId));
      const cell =
	this._updateCell(cellId, cell => cell.dependents.add(baseCellId));
      return cell.value;
    }
    else {
      console.assert(ast.type === 'app', `unknown ast type ${ast.type}`);
      const f = FNS[ast.fn];
      console.assert(f, `unknown ast fn ${ast.fn}`);
      return f(...ast.kids.map(k => this._evalAst(baseCellId, k)));
    }
  }

  _removeAsDependent(baseCellId, ast) {
    if (ast.type === 'app') {
      ast.kids.forEach(k => this._removeAsDependent(baseCellId, k));
    }
    else if (ast.type === 'ref') {
      const cellId = cellRefToCellId(ast.toString(baseCellId));
      this._updateCell(cellId, cell => cell.dependents.delete(baseCellId));
    }
  }

}



class CellInfo {
  constructor(id) {
    this.id = id;
    this.value = 0;    //cache of current value, not strictly necessary
    this.ast = null;
    this.dependents = new Set(); //cell-ids of cells which depend on this
    //equivalently, this cell is a prerequisite for all cells in dependents
    
  }

  //formula computed on the fly from the ast
  get formula() { return this.ast ? this.ast.toString(this.id) : ''; }

  //empty if no ast (equivalently, the formula is '').
  isEmpty() { return !this.ast; }
  
  copy() {
    const v = new CellInfo(this.id);
    Object.assign(v, this);
    v.dependents = new Set(v.dependents);
    return v;   
  }

}

const FNS = {
  '+': (a, b) => a + b,
  '-': (a, b=null) => b === null ? -a : a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
}

import AppError from './app-error.mjs';
import MemSpreadsheet from './mem-spreadsheet.mjs';

//use for development only
import { inspect } from 'util';

import mongo from 'mongodb';

//use in mongo.connect() to avoid warning
const MONGO_CONNECT_OPTIONS = { useUnifiedTopology: true };



/**
 * User errors must be reported by throwing a suitable
 * AppError object having a suitable message property
 * and code property set as follows:
 *
 *  `SYNTAX`: for a syntax error.
 *  `CIRCULAR_REF` for a circular reference.
 *  `DB`: database error.
 */

export default class PersistentSpreadsheet {

  //factory method
  static async make(dbUrl, spreadsheetName) {
    let client, data, spreadsheet
    try {
      client = await mongo.connect(dbUrl, MONGO_CONNECT_OPTIONS);
      data = client.db().collection(spreadsheetName);
      spreadsheet = await loadData(data);
    }
    catch (err) {
      const msg = `cannot connect to URL "${dbUrl}": ${err}`;
      throw new AppError('DB', msg);
    }
    return new PersistentSpreadsheet(spreadsheetName, client,
				     data, spreadsheet);
  }

  constructor(spreadsheetName, client, data, spreadsheet) {
    Object.assign(this, {spreadsheetName, client, data, spreadsheet});
  }

  /** Release all resources held by persistent spreadsheet.
   *  Specifically, close any database connections.
   */
  async close() {
    await this.client.close();
  }

  /** Set cell with id baseCellId to result of evaluating string
   *  formula.  Update all cells which are directly or indirectly
   *  dependent on the base cell.  Return an object mapping the id's
   *  of all dependent cells to their updated values.
   */
  async eval(baseCellId, formula) {
    const results = this.spreadsheet.eval(baseCellId, formula);
    try {
      await this.data.updateOne({_id: baseCellId}, {$set: { formula }},
				{ upsert: true });
    }
    catch (err) {
      this.spreadsheet.undo();
      const msg = `cannot update "${baseCellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }

  /** return object containing formula and value for cell cellId 
   *  return { value: 0, formula: '' } for an empty cell.
   */
  async query(cellId) {
    return this.spreadsheet.query(cellId);
  }

  /** Clear contents of this spreadsheet */
  async clear() {
    try {
      const collections = await this.client.db().listCollections().toArray();
      if (collections.find(c => c.name === this.spreadsheetName)) {
	await this.data.drop();
      }
    }
    catch (err) {
      const msg = `cannot drop collection ${this.spreadsheetName}: ${err}`;
      throw new AppError('DB', msg);
    }
    this.spreadsheet.clear();
  }

  /** Delete all info for cellId from this spreadsheet. Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.  
   */
  async delete(cellId) {
    let results;
    results = this.spreadsheet.delete(cellId);
    try {
      await this.data.deleteOne({_id: cellId});
    }
    catch (err) {
      this.spreadsheet.undo();
      const msg = `cannot delete ${cellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }
  
  /** copy formula from srcCellId to destCellId, adjusting any
   *  relative cell references suitably.  Return an object mapping the
   *  id's of all dependent cells to their updated values. Copying
   *  an empty cell is equivalent to deleting the destination cell.
   */
  async copy(destCellId, srcCellId) {
    const srcFormula = this.spreadsheet.query(srcCellId).formula;
    if (!srcFormula) {
      return await this.delete(destCellId);
    }
    else {
      const results = this.spreadsheet.copy(destCellId, srcCellId);
      try {
	const formula = this.spreadsheet.query(destCellId).formula;
	await this.data.updateOne({_id: destCellId}, {$set: { formula }},
				  { upsert: true });
      }
      catch (err) {
	this.spreadsheet.undo();
	const msg = `cannot update "${baseCellId}: ${err}`;
	throw new AppError('DB', msg);
      }
      return results;
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
  async dump() {
    return this.spreadsheet.dump();
  }

}

async function loadData(data) {
  const ss = new MemSpreadsheet();
  const cursor = await data.find({}); 
  const cells = await cursor.toArray();
  for (const {_id: baseCellRef, formula } of cells) {
    ss.eval(baseCellRef, formula);
  }
  return ss;
}
